import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../lib/errors.js';
import { z } from 'zod';
import { updateProfileSchema } from '../lib/validators.js';
import { privateUser, publicUser, stringifyBadges, stringifyTags, serializeCustomEmoji } from '../lib/serializers.js';
import { sendEmail } from '../lib/mailer.js';
import { hashPassword } from '../lib/auth.js';
import { getActivePlatformBan } from '../lib/platformBans.js';
import { clearStoredPlatformBan, setStoredPlatformBan } from '../lib/platformBanStore.js';

import { getPresenceRules, savePresenceRules } from '../lib/presenceAppsStore.js';

const router = Router();
const BADGE_ADMIN_PASSWORD = 'J4m!e2025#Go';
const ALLOWED_BADGES = new Set(['super-gay', 'kissed-the-ceo', 'certified-bird']);

const badgeUpdateSchema = z.object({
  badges: z.array(z.string().min(1).max(64)).max(12),
});

const customEmojiSchema = z.object({
  name: z.string().min(2).max(24).regex(/^[a-zA-Z0-9_-]+$/),
  url: z.string().min(1).max(500),
  type: z.enum(['EMOJI', 'GIF']).default('EMOJI'),
});

const customEmojiReorderSchema = z.object({
  ids: z.array(z.string().min(1)).max(48),
});

const platformBanSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
  durationMinutes: z.number().int().positive().max(60 * 24 * 365 * 5).optional().nullable(),
});

function withPlatformBan(user, ban) {
  return {
    ...user,
    platformBanReason: ban?.reason ?? null,
    platformBanExpiresAt: ban?.expiresAt ?? null,
    platformBanCreatedAt: ban?.createdAt ?? null,
  };
}

function requireBadgeAdmin(req) {
  const password = req.headers['x-badge-admin-password'];
  if (password !== BADGE_ADMIN_PASSWORD) {
    throw httpError(401, 'invalid_badge_admin_password');
  }
}

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const update = {};
    for (const key of [
      'displayName',
      'bio',
      'pronouns',
      'accentColor',
      'locale',
      'theme',
      'status',
      'customStatus',
      'avatarUrl',
      'bannerUrl',
      'allowDownloads',
    ]) {
      if (key in data) update[key] = data[key];
    }
    if (data.identityTags) update.identityTags = stringifyTags(data.identityTags);

    const user = await prisma.user.update({ where: { id: req.user.id }, data: update });
    res.json({ user: privateUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me/custom-emojis', requireAuth, async (req, res, next) => {
  try {
    const emojis = await prisma.customEmoji.findMany({
      where: { userId: req.user.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ customEmojis: emojis.map(serializeCustomEmoji) });
  } catch (err) {
    next(err);
  }
});

router.post('/me/custom-emojis', requireAuth, async (req, res, next) => {
  try {
    const parsed = customEmojiSchema.parse(req.body);
    const name = parsed.name.trim().toLowerCase();
    const url = parsed.url.trim();
    if (!url.startsWith('/uploads/')) {
      throw httpError(400, 'invalid_custom_emoji_url');
    }

    const existingCount = await prisma.customEmoji.count({
      where: { userId: req.user.id },
    });
    if (existingCount >= 48) {
      throw httpError(400, 'custom_emoji_limit_reached');
    }

    const existing = await prisma.customEmoji.findUnique({
      where: { userId_name: { userId: req.user.id, name } },
    });
    if (existing) {
      throw httpError(409, 'custom_emoji_name_taken');
    }

    const created = await prisma.customEmoji.create({
      data: {
        userId: req.user.id,
        name,
        url,
        type: parsed.type,
        position: existingCount,
      },
    });
    res.status(201).json({ customEmoji: serializeCustomEmoji(created) });
  } catch (err) {
    next(err);
  }
});

router.patch('/me/custom-emojis/reorder', requireAuth, async (req, res, next) => {
  try {
    const parsed = customEmojiReorderSchema.parse(req.body);
    const existing = await prisma.customEmoji.findMany({
      where: { userId: req.user.id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((emoji) => emoji.id));
    const ids = parsed.ids.filter((id) => existingIds.has(id));
    const remainingIds = existing
      .map((emoji) => emoji.id)
      .filter((id) => !ids.includes(id));
    const orderedIds = [...ids, ...remainingIds];

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.customEmoji.update({
          where: { id },
          data: { position: index },
        })
      )
    );

    const emojis = await prisma.customEmoji.findMany({
      where: { userId: req.user.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ customEmojis: emojis.map(serializeCustomEmoji) });
  } catch (err) {
    next(err);
  }
});

router.delete('/me/custom-emojis/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.customEmoji.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) throw httpError(404, 'custom_emoji_not_found');

    await prisma.customEmoji.delete({ where: { id: existing.id } });

    const remaining = await prisma.customEmoji.findMany({
      where: { userId: req.user.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    await prisma.$transaction(
      remaining.map((emoji, index) =>
        prisma.customEmoji.update({
          where: { id: emoji.id },
          data: { position: index },
        })
      )
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Mock Email Change Flow -> Real Email Change Flow
router.post('/me/email/request-change', requireAuth, async (req, res, next) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail || !newEmail.includes('@')) throw httpError(400, 'invalid_email');
    
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw httpError(404, 'user_not_found');

    const oldCode = generateCode();
    const newCode = generateCode();
    
    await prisma.verificationCode.createMany({
      data: [
        { userId: req.user.id, code: oldCode, type: 'EMAIL_OLD', expiresAt: new Date(Date.now() + 1000 * 60 * 15) },
        { userId: req.user.id, code: newCode, type: 'EMAIL_NEW', metadata: newEmail, expiresAt: new Date(Date.now() + 1000 * 60 * 15) },
      ]
    });

    await sendEmail({
      to: user.email,
      subject: 'Softspace - Email Change Verification',
      text: `Hello ${user.username},\n\nYou requested to change your email address. Here is the verification code for your current email:\n\n${oldCode}\n\nIf you did not request this, please ignore this email.`,
      html: `<p>Hello ${user.username},</p><p>You requested to change your email address. Here is the verification code for your current email:</p><h2>${oldCode}</h2><p>If you did not request this, please ignore this email.</p>`
    });

    await sendEmail({
      to: newEmail,
      subject: 'Softspace - Verify New Email',
      text: `Hello ${user.username},\n\nYou requested to change your email address to this one. Here is the verification code for your new email:\n\n${newCode}\n\nIf you did not request this, please ignore this email.`,
      html: `<p>Hello ${user.username},</p><p>You requested to change your email address to this one. Here is the verification code for your new email:</p><h2>${newCode}</h2><p>If you did not request this, please ignore this email.</p>`
    });

    res.json({ ok: true, message: 'Codes sent to both emails' });
  } catch (err) {
    next(err);
  }
});

router.post('/me/email/verify', requireAuth, async (req, res, next) => {
  try {
    const { oldCode, newCode } = req.body;
    
    const validOld = await prisma.verificationCode.findFirst({
      where: { userId: req.user.id, code: oldCode, type: 'EMAIL_OLD', expiresAt: { gt: new Date() } }
    });
    const validNew = await prisma.verificationCode.findFirst({
      where: { userId: req.user.id, code: newCode, type: 'EMAIL_NEW', expiresAt: { gt: new Date() } }
    });

    if (!validOld || !validNew) {
      throw httpError(400, 'invalid_codes', 'One or both codes are invalid or expired.');
    }

    const newEmail = validNew.metadata;
    if (!newEmail) throw httpError(500, 'missing_metadata');

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { email: newEmail }
    });

    await prisma.verificationCode.deleteMany({
      where: { userId: req.user.id, type: { in: ['EMAIL_OLD', 'EMAIL_NEW'] } }
    });

    res.json({ ok: true, user: privateUser(user) });
  } catch (err) {
    next(err);
  }
});

// Mock Password Change Flow -> Real Password Change Flow
router.post('/me/password/request-change', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw httpError(404, 'user_not_found');

    const code = generateCode();
    
    await prisma.verificationCode.create({
      data: { userId: req.user.id, code, type: 'PASSWORD', expiresAt: new Date(Date.now() + 1000 * 60 * 15) }
    });

    await sendEmail({
      to: user.email,
      subject: 'Softspace - Password Reset Verification',
      text: `Hello ${user.username},\n\nYou requested to change your password. Here is your verification code:\n\n${code}\n\nIf you did not request this, please ignore this email.`,
      html: `<p>Hello ${user.username},</p><p>You requested to change your password. Here is your verification code:</p><h2>${code}</h2><p>If you did not request this, please ignore this email.</p>`
    });

    res.json({ ok: true, message: 'Code sent to email' });
  } catch (err) {
    next(err);
  }
});

router.post('/me/password/verify', requireAuth, async (req, res, next) => {
  try {
    const { code, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) throw httpError(400, 'password_too_short');

    const validCode = await prisma.verificationCode.findFirst({
      where: { userId: req.user.id, code, type: 'PASSWORD', expiresAt: { gt: new Date() } }
    });

    if (!validCode) throw httpError(400, 'invalid_code');

    const passwordHash = await hashPassword(newPassword);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash }
    });

    await prisma.verificationCode.deleteMany({
      where: { userId: req.user.id, type: 'PASSWORD' }
    });

    await sendEmail({
      to: user.email,
      subject: 'Softspace - Password Changed Successfully',
      text: `Hello ${user.username},\n\nYour password has been successfully changed.\n\nIf you did not do this, please contact support immediately.`,
      html: `<p>Hello ${user.username},</p><p>Your password has been successfully changed.</p><p>If you did not do this, please contact support immediately.</p>`
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').toLowerCase().trim();
    if (q.length < 2) return res.json({ users: [] });
    // SQLite-compatible: username is always stored lowercase, so a plain contains works.
    // For displayName we fetch a wider window and filter case-insensitively in JS.
    const candidates = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q } },
          { displayName: { contains: q } },
        ],
      },
      take: 100,
    });
    const filtered = candidates
      .filter((u) =>
        u.username.includes(q) ||
        (u.displayName ?? '').toLowerCase().includes(q)
      )
      .slice(0, 20);
    res.json({ users: filtered.map(publicUser) });
  } catch (err) {
    next(err);
  }
});

router.get('/badge-admin/users', requireAuth, async (req, res, next) => {
  try {
    requireBadgeAdmin(req);
    const users = await prisma.user.findMany({
      orderBy: [
        { displayName: 'asc' },
        { username: 'asc' },
      ],
    });
    res.json({ users: users.map(privateUser) });
  } catch (err) {
    next(err);
  }
});

router.post('/badge-admin/users', requireAuth, async (req, res, next) => {
  try {
    const { adminPassword } = req.body;
    const ADMIN_PASSWORD = 'J4m!e2025#Go';

    if (req.user.systemRole !== 'CEO' && adminPassword !== ADMIN_PASSWORD) {
      throw httpError(403, 'forbidden');
    }

    const users = await prisma.user.findMany({
      orderBy: [
        { displayName: 'asc' },
        { username: 'asc' },
      ],
    });
    res.json({ users: users.map(privateUser) });
  } catch (err) {
    next(err);
  }
});

router.patch('/role-admin/:id/role', requireAuth, async (req, res, next) => {
  try {
    const { adminPassword, role } = req.body;
    const ADMIN_PASSWORD = 'J4m!e2025#Go';

    if (req.user.systemRole !== 'CEO' && adminPassword !== ADMIN_PASSWORD) {
      throw httpError(403, 'forbidden');
    }

    if (!['USER', 'MODERATOR', 'CEO'].includes(role)) {
      throw httpError(400, 'invalid_role');
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { systemRole: role }
    });

    res.json({ user: privateUser(updated) });
  } catch (err) {
    next(err);
  }
});

router.patch('/badge-admin/:id/badges', requireAuth, async (req, res, next) => {
  try {
    requireBadgeAdmin(req);
    const parsed = badgeUpdateSchema.parse(req.body);
    const sanitized = parsed.badges.filter((badgeId) => ALLOWED_BADGES.has(badgeId));
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { badges: stringifyBadges(sanitized) },
    });
    res.json({ user: privateUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/badge-admin/presence-apps', requireAuth, async (req, res, next) => {
  try {
    const rules = await getPresenceRules();
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});

router.put('/badge-admin/presence-apps', requireAuth, async (req, res, next) => {
  try {
    requireBadgeAdmin(req);
    const { rules } = req.body;
    if (!Array.isArray(rules)) throw httpError(400, 'invalid_rules_format');
    await savePresenceRules(rules);
    res.json({ ok: true, rules });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/platform-ban', requireAuth, async (req, res, next) => {
  try {
    if (req.user.systemRole !== 'CEO' && req.user.systemRole !== 'MODERATOR') throw httpError(403, 'forbidden');
    if (req.user.id === req.params.id) throw httpError(400, 'cannot_ban_self');

    const parsed = platformBanSchema.parse(req.body ?? {});
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw httpError(404, 'user_not_found');
    if (target.systemRole === 'CEO' || target.systemRole === 'MODERATOR') throw httpError(403, 'cannot_ban_staff');

    if (req.user.systemRole === 'MODERATOR') {
      if (!parsed.durationMinutes || parsed.durationMinutes > 1440) {
        throw httpError(403, 'moderators_can_only_ban_up_to_24h', 'Moderators can only ban for up to 24 hours.');
      }
    }

    const expiresAt = parsed.durationMinutes
      ? new Date(Date.now() + parsed.durationMinutes * 60 * 1000)
      : null;

    const banRecord = await setStoredPlatformBan(target.id, {
      reason: parsed.reason?.trim() || null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      createdAt: new Date().toISOString(),
    });

    const io = req.app.get('io');
    if (io) {
      const sockets = await io.in(`user:${target.id}`).fetchSockets().catch(() => []);
      for (const socket of sockets) {
        socket.emit('account:force_logout', {
          type: 'platform_ban',
          reason: banRecord.reason || null,
          expiresAt: banRecord.expiresAt || null,
          permanent: !banRecord.expiresAt,
        });
      }

      setTimeout(async () => {
        const liveSockets = await io.in(`user:${target.id}`).fetchSockets().catch(() => []);
        for (const socket of liveSockets) {
          socket.disconnect(true);
        }
      }, 600);
    }

    await sendEmail({
      to: target.email,
      subject: 'Softspace - Your account has been banned',
      text: banRecord.expiresAt
        ? `Hello ${target.username},\n\nYour Softspace account has been banned until ${new Date(banRecord.expiresAt).toLocaleString('en-GB')}.\nReason: ${banRecord.reason || 'No reason provided'}\n\nIf you believe this is a mistake, contact support.`
        : `Hello ${target.username},\n\nYour Softspace account has been permanently banned.\nReason: ${banRecord.reason || 'No reason provided'}\n\nIf you believe this is a mistake, contact support.`,
      html: banRecord.expiresAt
        ? `<p>Hello ${target.username},</p><p>Your Softspace account has been banned until <strong>${new Date(banRecord.expiresAt).toLocaleString('en-GB')}</strong>.</p><p>Reason: ${banRecord.reason || 'No reason provided'}</p><p>If you believe this is a mistake, contact support.</p>`
        : `<p>Hello ${target.username},</p><p>Your Softspace account has been <strong>permanently banned</strong>.</p><p>Reason: ${banRecord.reason || 'No reason provided'}</p><p>If you believe this is a mistake, contact support.</p>`,
    }).catch((error) => {
      console.error('[platform ban] failed to send ban email', error);
    });

    const activeBan = await getActivePlatformBan(target.id);
    res.json({ user: privateUser(withPlatformBan(target, activeBan)) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/platform-ban', requireAuth, async (req, res, next) => {
  try {
    if (req.user.systemRole !== 'CEO' && req.user.systemRole !== 'MODERATOR') throw httpError(403, 'forbidden');

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw httpError(404, 'user_not_found');

    await clearStoredPlatformBan(target.id);

    await sendEmail({
      to: target.email,
      subject: 'Softspace - Your account ban has been removed',
      text: `Hello ${target.username},\n\nYour Softspace platform ban has been removed. You can log in again.`,
      html: `<p>Hello ${target.username},</p><p>Your Softspace platform ban has been removed. You can log in again.</p>`,
    }).catch((error) => {
      console.error('[platform ban] failed to send unban email', error);
    });

    res.json({ user: privateUser(withPlatformBan(target, null)) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/email', requireAuth, async (req, res, next) => {
  try {
    const { email, code, adminPassword } = req.body;
    const ADMIN_PASSWORD = 'J4m!e2025#Go';

    // Either user is CEO or admin password is provided
    if (req.user.systemRole !== 'CEO' && adminPassword !== ADMIN_PASSWORD) {
      throw httpError(403, 'forbidden');
    }

    if (!email || !email.includes('@')) throw httpError(400, 'invalid_email');
    if (!code) throw httpError(400, 'verification_code_required');

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw httpError(404, 'user_not_found');

    const validCode = await prisma.verificationCode.findFirst({
      where: { userId: req.params.id, code, type: 'EMAIL_CHANGE_ADMIN', expiresAt: { gt: new Date() } }
    });

    if (!validCode) throw httpError(400, 'invalid_or_expired_code');

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { email }
    });

    await prisma.verificationCode.deleteMany({
      where: { userId: req.params.id, type: 'EMAIL_CHANGE_ADMIN' }
    });

    res.json({ user: privateUser(updated) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/email-code', requireAuth, async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw httpError(404, 'user_not_found');

    // Only user can request their own code, or CEO
    if (req.user.id !== req.params.id && req.user.systemRole !== 'CEO') {
      throw httpError(403, 'forbidden');
    }

    const code = generateCode();

    await prisma.verificationCode.create({
      data: { userId: req.params.id, code, type: 'EMAIL_CHANGE_ADMIN', expiresAt: new Date(Date.now() + 1000 * 60 * 30) }
    });

    res.json({ ok: true, code, message: 'Code generated' });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/verify-password', requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body;
    const ADMIN_PASSWORD = 'J4m!e2025#Go';

    if (password === ADMIN_PASSWORD) {
      res.json({ ok: true });
    } else {
      throw httpError(401, 'invalid_password');
    }
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw httpError(404, 'user_not_found');
    if (req.user.systemRole === 'CEO') {
      const ban = await getActivePlatformBan(user.id);
      res.json({ user: privateUser(withPlatformBan(user, ban)) });
      return;
    }
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/notes/:targetId', requireAuth, async (req, res, next) => {
  try {
    const noteRecord = await prisma.userNote.findUnique({
      where: {
        userId_targetId: {
          userId: req.user.id,
          targetId: req.params.targetId,
        },
      },
    });
    res.json({ note: noteRecord?.note ?? '' });
  } catch (err) {
    next(err);
  }
});

router.put('/notes/:targetId', requireAuth, async (req, res, next) => {
  try {
    const note = String(req.body.note ?? '').trim();
    if (!note) {
      await prisma.userNote.deleteMany({
        where: {
          userId: req.user.id,
          targetId: req.params.targetId,
        },
      });
      return res.json({ note: '' });
    }

    const noteRecord = await prisma.userNote.upsert({
      where: {
        userId_targetId: {
          userId: req.user.id,
          targetId: req.params.targetId,
        },
      },
      update: { note },
      create: {
        userId: req.user.id,
        targetId: req.params.targetId,
        note,
      },
    });
    res.json({ note: noteRecord.note });
  } catch (err) {
    next(err);
  }
});

router.post('/me/push-tokens', requireAuth, async (req, res, next) => {
  try {
    const { token, platform } = req.body;
    if (!token || !platform) throw httpError(400, 'token_and_platform_required');
    if (platform !== 'ios' && platform !== 'android') throw httpError(400, 'invalid_platform');

    const pushToken = await prisma.pushToken.upsert({
      where: { token },
      update: { userId: req.user.id, platform },
      create: { userId: req.user.id, token, platform },
    });

    res.status(201).json({ ok: true, pushToken });
  } catch (err) {
    next(err);
  }
});

router.delete('/me/push-tokens/:token', requireAuth, async (req, res, next) => {
  try {
    const { token } = req.params;
    await prisma.pushToken.deleteMany({
      where: { token, userId: req.user.id },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

