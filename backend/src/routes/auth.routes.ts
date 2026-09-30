import { Router } from "express";
import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import passport from "../auth/passport";
import { config } from "../config";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${config.FRONTEND_URL}/login?error=auth_failed`,
  }),
  (req, res) => {
    const user = req.user as User;
    const token = jwt.sign({ sub: user.id }, config.JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: config.NODE_ENV === "production" ? "none" : "lax",
      secure: config.NODE_ENV === "production",
      maxAge: 7 * 24 * 3600 * 1000,
    });
    res.redirect(`${config.FRONTEND_URL}/dashboard`);
  }
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      slackConnected: !!user.slackWebhookUrl,
    });
  })
);

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

export default router;