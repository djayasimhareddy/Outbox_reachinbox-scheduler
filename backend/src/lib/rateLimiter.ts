import { redis } from "./redis";

const HOUR = 3_600_000;

export const windowId = (t = Date.now()) => Math.floor(t / HOUR);
export const nextWindowStart = (t = Date.now()) => (windowId(t) + 1) * HOUR;

// Atomic check + increment: returns -1 if the limit is already reached
const ACQUIRE_LUA = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c >= tonumber(ARGV[1]) then return -1 end
c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return c
`;

export async function tryAcquire(senderId: string, limit: number) {
  const window = windowId();
  const key = `rl:${senderId}:${window}`;
  const res = (await redis.eval(ACQUIRE_LUA, 1, key, limit, 7200)) as number;
  return { ok: res !== -1, window };
}

// Give the slot back if the SMTP send failed
export async function release(senderId: string, window: number) {
  await redis.decr(`rl:${senderId}:${window}`);
}

// Order in which jobs overflowed this window; used to keep order in the next one
export async function overflowRank(senderId: string, window: number) {
  const key = `rlq:${senderId}:${window}`;
  const rank = await redis.incr(key);
  if (rank === 1) await redis.expire(key, 7200);
  return rank - 1;
}