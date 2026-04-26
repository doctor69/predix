import { Context, Next } from 'hono';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { Bindings, Variables } from '../index';

export interface UserContext {
  walletAddress: string;
  privyUserId: string;
}

type HonoEnv = { Bindings: Bindings; Variables: Variables };

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(appId: string) {
  if (!jwksCache.has(appId)) {
    jwksCache.set(
      appId,
      createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`))
    );
  }
  return jwksCache.get(appId)!;
}

function extractWallet(payload: Record<string, unknown>): string | null {
  const accounts = (payload.linked_accounts as Array<{ type: string; address?: string }>) || [];
  const wallet = accounts.find((a) => a.type === 'wallet' && a.address);
  return wallet?.address?.toLowerCase() ?? null;
}

export async function requireAuth(c: Context<HonoEnv>, next: Next) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization header' }, 401);
  }

  try {
    const token = header.slice(7);
    const appId = c.env.PRIVY_APP_ID;
    const { payload } = await jwtVerify(token, getJwks(appId), {
      issuer: 'privy.io',
      audience: appId,
    });

    const walletAddress = extractWallet(payload as Record<string, unknown>);
    if (!walletAddress) return c.json({ error: 'No wallet address in token' }, 401);

    c.set('user', { walletAddress, privyUserId: payload.sub as string });
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}

export async function requireAdmin(c: Context<HonoEnv>, next: Next) {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const admins = c.env.ADMIN_ADDRESSES.split(',').map((a) => a.trim().toLowerCase());
  if (!admins.includes(user.walletAddress)) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  await next();
}
