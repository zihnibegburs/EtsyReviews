import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const sid = req.cookies.get(process.env.SESSION_COOKIE_NAME!)?.value;
  if (!sid) return NextResponse.json({ authenticated: false });

  // session-<userId>-<ts>.(sig)
  const match = /^session-([^-.]+)-\d+/.exec(sid);
  if (!match) return NextResponse.json({ authenticated: false });

  const user = await db.user.findUnique({ where: { id: match[1] } });
  if (!user) return NextResponse.json({ authenticated: false });

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      lastLoginAt: user.lastLoginAt,
    },
  });
}
