import { Router } from 'express';
import { customAlphabet } from 'nanoid';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { hashPassword, verifyPassword, signToken, tokenExpiry } from '../lib/auth.js';
import { httpError } from '../lib/errors.js';
import { loginSchema, registerSchema } from '../lib/validators.js';
import { privateUser, stringifyTags } from '../lib/serializers.js';
import { requireAuth } from '../middleware/auth.js';
import { ADMIN_PERMS, DEFAULT_MEMBER_PERMS } from '../lib/permissions.js';
import { ensureUserIsNotPlatformBanned, buildPlatformBanMessage } from '../lib/platformBans.js';
import crypto from 'crypto';

const router = Router();
const tokenId = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 32);

async function assertNotPlatformBanned(user) {
  const { user: freshUser, ban } = await ensureUserIsNotPlatformBanned(user);
  if (ban) {
    throw httpError(403, 'account_banned', buildPlatformBanMessage(ban), ban);
  }
  return freshUser;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 requests per 15 min for auth endpoints
  message: { error: 'Too many requests, please try again later.' }
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const email = data.email.toLowerCase().trim();
    const username = data.username.toLowerCase().trim();

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true, email: true, username: true },
    });
    if (existing) {
      const target = existing.email === email ? 'email' : 'username';
      throw httpError(409, 'already_taken', null, { field: target });
    }

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        email,
        username,
        displayName: data.displayName.trim(),
        passwordHash,
        pronouns: data.pronouns ?? null,
        identityTags: stringifyTags(data.identityTags),
        locale: data.locale ?? 'en',
      },
    });

    const token = signToken({ sub: user.id, jti: tokenId() });
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        userAgent: req.headers['user-agent']?.slice(0, 200),
        ipAddress: req.ip,
        expiresAt: tokenExpiry(),
      },
    });

    res.status(201).json({ token, user: privateUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const id = data.identifier.toLowerCase().trim();
    let user = await prisma.user.findFirst({
      where: { OR: [{ email: id }, { username: id }] },
    });
    if (!user) throw httpError(401, 'invalid_credentials');
    const ok = await verifyPassword(data.password, user.passwordHash);
    if (!ok) throw httpError(401, 'invalid_credentials');
    user = await assertNotPlatformBanned(user);

    const token = signToken({ sub: user.id, jti: tokenId() });
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        userAgent: req.headers['user-agent']?.slice(0, 200),
        ipAddress: req.ip,
        expiresAt: tokenExpiry(),
      },
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    res.json({ token, user: privateUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await prisma.session.delete({ where: { id: req.session.id } }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// QR Login endpoint (Mobile app -> Server -> PC app)
router.post('/qr-login', requireAuth, async (req, res, next) => {
  try {
    const { socketId } = req.body;
    if (!socketId) throw httpError(400, 'Missing socketId');

    const user = req.user;
    await assertNotPlatformBanned(user);
    
    // Generate a new token and session for the PC app
    const token = signToken({ sub: user.id, jti: tokenId() });
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        userAgent: req.headers['user-agent']?.slice(0, 200) || 'QR Login',
        ipAddress: req.ip,
        expiresAt: tokenExpiry(),
      },
    });

    // We need to send this token to the PC app via socket
    // We can access the socket.io instance via req.app.get('io') if it's set
    const io = req.app.get('io');
    if (io) {
      io.to(socketId).emit('qr:login:success', { token, user: privateUser(user) });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: privateUser(req.user) });
});

router.get('/discord/url', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Discord OAuth is not configured.' });
  }
  const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email`;
  res.json({ url });
});

router.post('/discord/callback', authLimiter, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) throw httpError(400, 'missing_code');

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;

    if (!clientId || !clientSecret) {
      throw httpError(500, 'Discord OAuth is not configured on the server.');
    }

    // Exchange code for token
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: tokenParams,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Discord token error:', errText);
      throw httpError(400, 'invalid_discord_code');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch user profile
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      throw httpError(400, 'discord_profile_error');
    }

    const discordUser = await userRes.json();
    
    // discordUser has: id, username, global_name, avatar, email, ...
    
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { discordId: discordUser.id },
          { email: discordUser.email }
        ]
      }
    });

    let isNewUser = false;

    if (user) {
      // If user exists but doesn't have discordId linked, link it
      if (!user.discordId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { discordId: discordUser.id }
        });
      }
      user = await assertNotPlatformBanned(user);
    } else {
      isNewUser = true;
      // Register new user
      const email = discordUser.email || `${discordUser.id}@discord.local`;
      // Find a unique username
      let baseUsername = discordUser.username.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (!baseUsername) baseUsername = 'discord_user';
      let username = baseUsername;
      let counter = 1;
      while (await prisma.user.findUnique({ where: { username } })) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      // Generate a random password since Discord users don't have one here
      const randomPass = crypto.randomBytes(16).toString('hex');
      const passwordHash = await hashPassword(randomPass);

      const avatarUrl = discordUser.avatar 
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null;

      user = await prisma.user.create({
        data: {
          email,
          username,
          displayName: discordUser.global_name || discordUser.username,
          passwordHash,
          discordId: discordUser.id,
          avatarUrl,
          // bio is usually not provided via standard OAuth without user.profile scope, 
          // which is whitelisted. So we leave it null or use an empty string.
        }
      });
    }

    const token = signToken({ sub: user.id, jti: tokenId() });
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        userAgent: req.headers['user-agent']?.slice(0, 200),
        ipAddress: req.ip,
        expiresAt: tokenExpiry(),
      },
    });
    
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

    res.json({ token, user: privateUser(user), isNewUser });
  } catch (err) {
    next(err);
  }
});

router.get('/telegram/config', (req, res) => {
  const botName = process.env.TELEGRAM_BOT_NAME;
  if (!botName) {
    return res.status(500).json({ error: 'Telegram Login is not configured.' });
  }
  res.json({ botName });
});

router.post('/telegram/callback', authLimiter, async (req, res, next) => {
  try {
    const data = req.body;
    if (!data || !data.hash || !data.id) {
      throw httpError(400, 'invalid_telegram_data');
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw httpError(500, 'Telegram Login is not configured on the server.');
    }

    // Verify hash
    const checkHash = data.hash;
    const dataCopy = { ...data };
    delete dataCopy.hash;
    
    const dataCheckString = Object.keys(dataCopy)
      .sort()
      .map(k => `${k}=${dataCopy[k]}`)
      .join('\n');
      
    const secret = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

    if (hmac !== checkHash) {
      throw httpError(401, 'invalid_telegram_hash');
    }

    // Check if auth_date is older than 24 hours
    const authDate = parseInt(data.auth_date, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      throw httpError(401, 'telegram_auth_expired');
    }

    const telegramId = String(data.id);
    let user = await prisma.user.findFirst({
      where: { telegramId }
    });

    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      // Register new user
      const email = `${telegramId}@telegram.local`;
      
      let baseUsername = (data.username || data.first_name || 'telegram_user')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
      if (!baseUsername) baseUsername = 'telegram_user';
      
      let username = baseUsername;
      let counter = 1;
      while (await prisma.user.findUnique({ where: { username } })) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      const randomPass = crypto.randomBytes(16).toString('hex');
      const passwordHash = await hashPassword(randomPass);
      
      let displayName = data.first_name || 'Telegram User';
      if (data.last_name) displayName += ` ${data.last_name}`;

      user = await prisma.user.create({
        data: {
          email,
          username,
          displayName,
          passwordHash,
          telegramId,
          avatarUrl: data.photo_url || null,
        }
      });
    }
    user = await assertNotPlatformBanned(user);

    const token = signToken({ sub: user.id, jti: tokenId() });
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        userAgent: req.headers['user-agent']?.slice(0, 200),
        ipAddress: req.ip,
        expiresAt: tokenExpiry(),
      },
    });
    
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

    res.json({ token, user: privateUser(user), isNewUser });
  } catch (err) {
    next(err);
  }
});

// Re-export for convenience
export { ADMIN_PERMS, DEFAULT_MEMBER_PERMS };
export default router;
