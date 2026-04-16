import { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet } from 'jose';

export interface AuthenticatedRequest extends Request {
  user?: {
    walletAddress: string;
    privyUserId: string;
  };
}

const PRIVY_APP_ID = process.env.PRIVY_APP_ID || '';
const JWKS_URL = `https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(JWKS_URL));
  }
  return jwks;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `privy.io`,
      audience: PRIVY_APP_ID,
    });

    const walletAddress = extractWalletAddress(payload);
    if (!walletAddress) {
      res.status(401).json({ error: 'No wallet address in token' });
      return;
    }

    req.user = {
      walletAddress,
      privyUserId: payload.sub as string,
    };

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractWalletAddress(payload: any): string | null {
  // Privy embeds linked accounts in the JWT
  const linkedAccounts: Array<{ type: string; address?: string }> =
    payload.linked_accounts || [];

  const wallet = linkedAccounts.find(
    (a) => a.type === 'wallet' && a.address
  );

  return wallet?.address?.toLowerCase() || null;
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `privy.io`,
      audience: PRIVY_APP_ID,
    });

    const walletAddress = extractWalletAddress(payload);
    if (walletAddress) {
      req.user = {
        walletAddress,
        privyUserId: payload.sub as string,
      };
    }
  } catch {
    // token invalid — continue as unauthenticated
  }

  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const adminAddresses = (process.env.ADMIN_ADDRESSES || '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!adminAddresses.includes(req.user.walletAddress)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}
