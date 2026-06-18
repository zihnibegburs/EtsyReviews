import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { db } from '@/lib/db';
import { issueAppSession } from '@/lib/session';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const stash = req.cookies.get('g_pkce')?.value;

  if (!code || !stash) return new NextResponse('Missing code/session', { status: 400 });

  let parsed: any; try { parsed = JSON.parse(stash); } catch { return new NextResponse('Bad session', { status: 400 }); }
  if (state !== parsed.state) return new NextResponse('Invalid state', { status: 400 });

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID_WEB!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET_WEB!,
    code,
    grant_type: 'authorization_code',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    code_verifier: parsed.codeVerifier,
  });

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!tokenResp.ok) {
    return new NextResponse('Token exchange failed: ' + (await tokenResp.text()), { status: 400 });
  }

  const tokens = await tokenResp.json() as {
    access_token: string;
    refresh_token?: string;
    id_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };

  // Verify id_token
  const { payload } = await jwtVerify(tokens.id_token, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: process.env.GOOGLE_CLIENT_ID_WEB!,
  });

  const googleSub = payload.sub as string;
  const email = (payload.email as string) ?? null;
  const emailVerified = payload.email_verified === true;
  const name = (payload.name as string) ?? null;
  const picture = (payload.picture as string) ?? null;

  // Upsert user
  const user = await db.user.upsert({
    where: { googleSub },
    create: { googleSub, email, emailVerified, name, picture, lastLoginAt: new Date() },
    update: { email, emailVerified, name, picture, lastLoginAt: new Date() },
  });

  const fromExt = parsed.src === 'ext';
  const res = new NextResponse(
    fromExt
      ? `<!doctype html><html><body><script>try{if(window.opener)window.opener.postMessage({type:'auth:success'},'*')}catch(e){};window.close()</script>OK</body></html>`
      : null,
    { status: fromExt ? 200 : 302, headers: fromExt ? { 'Content-Type': 'text/html' } : { Location: '/' } }
  );

  // Clear PKCE cookie
  res.cookies.set('g_pkce', '', { path: '/', maxAge: 0 });

  // Set your own session cookie
  res.cookies.set(process.env.SESSION_COOKIE_NAME!, issueAppSession(user.id), {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });

  return res;
}
