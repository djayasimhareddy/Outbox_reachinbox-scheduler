import { Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();
const redirectUri = config.SLACK_REDIRECT_URI ?? `${config.BACKEND_URL}/slack/callback`;

// 1) Send the logged-in user to Slack's consent screen.
//    `state` is a short-lived signed token: it carries the userId and blocks CSRF.
router.get("/connect", requireAuth, (req, res) => {
  const state = jwt.sign({ sub: req.userId, purpose: "slack" }, config.JWT_SECRET, {
    expiresIn: "10m",
  });
  const params = new URLSearchParams({
    client_id: config.SLACK_CLIENT_ID,
    scope: "incoming-webhook",
    redirect_uri: redirectUri,
    state,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
});

// 2) Slack sends the user back here with a code; exchange it for a webhook URL.
router.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const done = (result: string): void =>
      res.redirect(`${config.FRONTEND_URL}/dashboard?slack=${result}`);

    if (error || !code || !state) return done("denied");

    let userId: string;
    try {
      const p = jwt.verify(state, config.JWT_SECRET) as { sub: string; purpose: string };
      if (p.purpose !== "slack") throw new Error("bad purpose");
      userId = p.sub;
    } catch {
      return done("invalid_state");
    }

    const resp = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.SLACK_CLIENT_ID,
        client_secret: config.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const data = (await resp.json()) as {
      ok: boolean;
      error?: string;
      incoming_webhook?: { url: string; channel: string };
    };

    if (!data.ok || !data.incoming_webhook) {
      console.error("Slack OAuth failed:", data.error);
      return done("failed");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { slackWebhookUrl: data.incoming_webhook.url },
    });
    done("connected");
  })
);

// Disconnect: clear the webhook; rate-limit hits then silently skip Slack
router.post(
  "/disconnect",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.user.update({ where: { id: req.userId! }, data: { slackWebhookUrl: null } });
    res.json({ ok: true });
  })
);

// Sends a real test message to verify the connection
router.post(
  "/test",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user?.slackWebhookUrl) {
      res.status(400).json({ error: "Slack not connected" });
      return;
    }
    const r = await fetch(user.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: ":white_check_mark: ReachInbox scheduler is connected to Slack." }),
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  })
);

export default router;