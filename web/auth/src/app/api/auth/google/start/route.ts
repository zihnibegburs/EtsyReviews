import { NextRequest, NextResponse } from 'next/server';
import { b64url, sha256, randomUrlSafeBytes } from '@/lib/crypto';


const AUTHZ_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'openid email profile';


export async function GET(req: NextRequest) {
    const src = req.nextUrl.searchParams.get('src') || 'web';


    const codeVerifier = randomUrlSafeBytes(32);
    const codeChallenge = b64url(sha256(codeVerifier));
    const state = randomUrlSafeBytes(16);


    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID_WEB!,
        response_type: 'code',
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        scope: SCOPE,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        access_type: 'offline', // refresh_token on first consent
    });


    const res = NextResponse.redirect(`${AUTHZ_URL}?${params.toString()}`);
    res.cookies.set('g_pkce', JSON.stringify({ codeVerifier, state, src }), {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 10 * 60, // 10 minutes
        path: '/',
    });
    return res;
}