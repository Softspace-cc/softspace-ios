import { verifyToken } from '../lib/auth.js';
import prisma from '../lib/prisma.js';
import { httpError } from '../lib/errors.js';
import { ensureUserIsNotPlatformBanned, buildPlatformBanMessage } from '../lib/platformBans.js';

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization;
    let token = null;
    if (header?.startsWith('Bearer ')) token = header.slice(7);
    else if (req.query.token) token = String(req.query.token);
    if (!token) throw httpError(401, 'unauthenticated');

    const payload = verifyToken(token);
    if (!payload?.sub) throw httpError(401, 'invalid_token');

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) throw httpError(401, 'session_expired');

    const { user, ban } = await ensureUserIsNotPlatformBanned(session.user);
    if (ban) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      throw httpError(403, 'account_banned', buildPlatformBanMessage(ban), ban);
    }

    req.user = user;
    req.session = session;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  return requireAuth(req, _res, next);
}
