import IORedis from "ioredis";
import { config } from "../config";

// maxRetriesPerRequest: null is required by BullMQ workers
const redisUrl = new URL(config.REDIS_URL);
export const redis = new IORedis(redisUrl.toString(), {
	maxRetriesPerRequest: null,
	...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
});