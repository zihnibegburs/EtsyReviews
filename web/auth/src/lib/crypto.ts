import crypto from 'crypto';


export function b64url(input: Buffer | string) {
const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
return buf
.toString('base64')
.replace(/\+/g, '-')
.replace(/\//g, '_')
.replace(/=+$/g, '');
}


export function sha256(input: Buffer | string) {
return crypto.createHash('sha256').update(input).digest();
}


export function randomUrlSafeBytes(n = 32) {
return b64url(crypto.randomBytes(n));
}