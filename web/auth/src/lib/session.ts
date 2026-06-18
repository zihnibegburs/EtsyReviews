import crypto from 'crypto';

export function issueAppSession(userId: string) {
  const ts = Date.now();
  const sig = crypto
    .createHmac('sha256', process.env.SESSION_SECRET || 'dev-secret')
    .update(`${userId}:${ts}`)
    .digest('hex')
    .slice(0, 16);
  // opaque cookie (switch to JWT later if you like)
  return `session-${userId}-${ts}.${sig}`;
}
