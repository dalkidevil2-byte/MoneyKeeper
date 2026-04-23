// btoa/atob은 브라우저, Edge 런타임, Node.js 18+ 모두에서 사용 가능
const SECRET = process.env.AUTH_SECRET ?? 'fallback-secret';

export function createToken(): string {
  return btoa(`authenticated:${SECRET}`);
}

export function verifyToken(token: string): boolean {
  return token === createToken();
}
