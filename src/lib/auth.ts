const SECRET = process.env.AUTH_SECRET ?? 'fallback-secret-change-me';

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createToken(): Promise<string> {
  const key = await getKey(SECRET);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('authenticated'));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const key = await getKey(SECRET);
    const sigBytes = Uint8Array.from(atob(token), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode('authenticated'));
  } catch {
    return false;
  }
}
