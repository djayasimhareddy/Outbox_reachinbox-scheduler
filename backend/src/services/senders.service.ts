import type { Sender } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import https from "https";

// One in-flight creation per user, so concurrent calls share the same work.
const inflight = new Map<string, Promise<Sender[]>>();

interface EtherealAccount {
  user: string;
  pass: string;
  smtp: { host: string; port: number; secure: boolean };
}

function createEtherealAccount(): Promise<EtherealAccount> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ requestor: "reachinbox-scheduler", version: "1.0.0" });
    const req = https.request(
      "https://api.nodemailer.com/user",
      {
        method: "POST",
        family: 4,
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const account: unknown = JSON.parse(data);
            if (
              typeof account !== "object" || account === null ||
              !("status" in account) || account.status !== "success" ||
              !("user" in account) || typeof account.user !== "string" ||
              !("pass" in account) || typeof account.pass !== "string" ||
              !("smtp" in account) || typeof account.smtp !== "object" || account.smtp === null
            ) {
              reject(new Error(`Ethereal account creation failed: ${data}`));
              return;
            }
            const smtp = account.smtp as Record<string, unknown>;
            if (typeof smtp.host !== "string" || typeof smtp.port !== "number" || typeof smtp.secure !== "boolean") {
              reject(new Error(`Invalid Ethereal SMTP response: ${data}`));
              return;
            }
            resolve({ user: account.user, pass: account.pass, smtp: { host: smtp.host, port: smtp.port, secure: smtp.secure } });
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Ethereal request timed out")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function createMissingSenders(userId: string): Promise<Sender[]> {
  const target = config.SENDERS_PER_USER;

  for (let attempts = 0; attempts < target * 3; attempts += 1) {
    if ((await prisma.sender.count({ where: { userId } })) >= target) break;

    const account = await createEtherealAccount();
    console.log("Ethereal account created:", account.user);
    await prisma.sender.upsert({
      where: { userId_email: { userId, email: account.user } },
      update: {},
      create: {
        userId,
        email: account.user,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpUser: account.user,
        smtpPass: account.pass,
      },
    });
  }

  return prisma.sender.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export function ensureSenders(userId: string): Promise<Sender[]> {
  const pending = inflight.get(userId);
  if (pending) return pending;

  const creation = createMissingSenders(userId);
  inflight.set(userId, creation);
  void creation.finally(() => {
    if (inflight.get(userId) === creation) inflight.delete(userId);
  }).catch(() => undefined);
  return creation;
}

