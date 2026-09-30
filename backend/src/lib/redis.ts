import IORedis from "ioredis";
import { config } from "../config";

// maxRetriesPerRequest: null is required by BullMQ workers
export const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });