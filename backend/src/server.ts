import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { config } from "./config";
import { emailQueue } from "./queue/emailQueue";
import passport from "./auth/passport";
import authRouter from "./routes/auth.routes";
import emailsRouter from "./routes/emails.routes";
import { requireAuth } from "./middleware/requireAuth";
import { ensureIndex } from "./lib/elastic";
import slackRouter from "./routes/slack.routes";
import "./worker";


const app = express();
app.set("trust proxy", 1);
const allowedOrigin = config.FRONTEND_URL.replace(/\/$/, "");
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(passport.initialize());

// Live BullMQ dashboard
const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath("/admin/queues");
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
app.use("/admin/queues", boardAdapter.getRouter());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/auth", authRouter);
app.use("/slack", slackRouter);
app.use("/api/emails", requireAuth, emailsRouter);

ensureIndex().catch((error) => console.error("ES index setup failed:", error instanceof Error ? error.message : error));
app.listen(config.PORT, "0.0.0.0", () => {
  console.log(`API on :${config.PORT}  |  Bull Board: /admin/queues`);
});
