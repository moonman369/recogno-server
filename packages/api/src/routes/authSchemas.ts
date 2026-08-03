/** Request and response shapes for authentication. */

import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../services/password.js';

export const emailSchema = z
  .email({ error: 'A valid email address is required' })
  .max(320)
  .transform((value) => value.trim().toLowerCase());

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH);

export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120).optional(),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const sessionResponseSchema = z.object({
  user: publicUserSchema,
  accessToken: z.string().meta({ description: 'Send as `Authorization: Bearer <token>`.' }),
  refreshToken: z.string().meta({
    description: 'Opaque. Exchange at POST /auth/refresh; it rotates on every use.',
  }),
  tokenType: z.literal('Bearer'),
  expiresIn: z.int().meta({ description: 'Access token lifetime in seconds.' }),
});

export const meResponseSchema = z.object({ user: publicUserSchema });

export const authProvidersResponseSchema = z.object({
  password: z.boolean().meta({ description: 'Email + password sign-in is always available.' }),
  google: z.boolean().meta({
    description: 'True only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured.',
  }),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
