import { z } from 'zod';

export const usernameSchema = z
  .string()
  .min(3, 'username_too_short')
  .max(24, 'username_too_long')
  .regex(/^[a-zA-Z0-9_]+$/, 'username_invalid_chars');

export const passwordSchema = z
  .string()
  .min(8, 'password_too_short')
  .max(128, 'password_too_long');

export const registerSchema = z.object({
  email: z.string().email('email_invalid').max(120),
  username: usernameSchema,
  displayName: z.string().min(1).max(48),
  password: passwordSchema,
  pronouns: z.string().max(40).optional().nullable(),
  identityTags: z.union([z.string(), z.array(z.string().max(24))]).transform(val => {
    if (typeof val === 'string') return [val];
    return val;
  }).optional(),
  locale: z.enum(['en', 'de']).optional(),
});

export const loginSchema = z.object({
  identifier: z.string().min(1).max(120), // email or username
  password: z.string().min(1).max(128),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(48).optional(),
  bio: z.string().max(500).optional().nullable(),
  pronouns: z.string().max(40).optional().nullable(),
  identityTags: z.array(z.string().max(24)).max(10).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  locale: z.enum(['en', 'de']).optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  status: z.enum(['online', 'idle', 'dnd', 'invisible']).optional(),
  customStatus: z.string().max(64).optional().nullable(),
  avatarUrl: z.string().url().or(z.string().startsWith('/')).optional().nullable(),
  bannerUrl: z.string().url().or(z.string().startsWith('/')).optional().nullable(),
  allowDownloads: z.boolean().optional(),
});

export const createServerSchema = z.object({
  name: z.string().min(2).max(48),
  iconUrl: z.string().optional().nullable(),
});

export const updateServerSchema = z.object({
  name: z.string().min(2).max(48).optional(),
  description: z.string().max(500).optional().nullable(),
  iconUrl: z.string().optional().nullable(),
  bannerUrl: z.string().optional().nullable(),
  vanityUrl: z.string().min(3).max(32).regex(/^[a-z0-9-]+$/).optional().nullable(),
  isPublic: z.boolean().optional(),
});

export const createChannelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[a-z0-9-]+$/i, 'channel_name_invalid'),
  type: z.enum(['TEXT', 'VOICE', 'CATEGORY']).default('TEXT'),
  topic: z.string().max(280).optional().nullable(),
  parentId: z.string().optional().nullable(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(48).regex(/^[a-z0-9-]+$/i).optional(),
  topic: z.string().max(280).optional().nullable(),
  position: z.number().int().min(0).max(9999).optional(),
  parentId: z.string().optional().nullable(),
  permissionOverrides: z.string().optional().nullable(),
});

export const reorderChannelsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        parentId: z.string().nullable(),
        position: z.number().int().min(0).max(9999),
      })
    )
    .min(1),
});

export const sendMessageSchema = z.object({
  content: z.string().min(0).max(4000),
  replyToId: z.string().optional().nullable(),
  attachmentIds: z.array(z.string()).max(10).optional(),
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(40),
});

export const friendRequestSchema = z.object({
  username: usernameSchema,
});

export const createInviteSchema = z.object({
  expiresInHours: z.number().int().min(0).max(24 * 30).optional(),
  maxUses: z.number().int().min(0).max(1000).optional(),
});

export const createDmSchema = z.object({
  userIds: z.array(z.string()).min(1).max(9),
  name: z.string().max(48).optional().nullable(),
});
