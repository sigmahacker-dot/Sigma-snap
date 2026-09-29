import { z } from 'zod';

export const USERNAME_REGEX = /^[a-z0-9._]{3,24}$/;

export const usernameSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(USERNAME_REGEX, 'Username must be 3-24 chars: lowercase letters, numbers, . and _');

export const registerSchema = z.object({
  email: z.string().email().max(254),
  username: usernameSchema,
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(60),
});

export const loginSchema = z.object({
  emailOrUsername: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const oauthProviderSchema = z.object({
  provider: z.string().min(1).max(32),
});
