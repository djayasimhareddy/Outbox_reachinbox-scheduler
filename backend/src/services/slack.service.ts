import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

interface RateLimitInfo {
  userId: string;
  senderId: string;
  senderEmail: string;
  limit: number;
  window: number;
  resumeAt: number;
}

// Never throws: no Slack connected = silently skip
export async function notifyRateLimitHit(info: RateLimitInfo): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: info.userId } });
    if (!user?.slackWebhookUrl) return;

    // Only one message per sender per hour window, not one per delayed job
    const first = await redis.set(`slacknotify:${info.senderId}:${info.window}`, "1", "EX", 3600, "NX");
    if (!first) return;

    const res = await fetch(user.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:warning: Hourly limit (${info.limit}) reached for sender *${info.senderEmail}*. Remaining emails rescheduled to <!date^${Math.floor(info.resumeAt / 1000)}^{date_short_pretty} at {time}|${new Date(info.resumeAt).toISOString()}>.`,
      }),
    });
    if (!res.ok) console.error("Slack webhook failed:", res.status);
  } catch (err) {
    console.error("Slack notify error:", err);
  }
}