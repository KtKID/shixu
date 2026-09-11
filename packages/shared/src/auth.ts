import { z } from 'zod';

/** 注册密码规则：英文+数字组合，长度 >5 位（feat09 场景2）。 */
export const PasswordSchema = z
  .string()
  .min(6)
  .max(128)
  .regex(/[A-Za-z]/, '密码需包含英文')
  .regex(/[0-9]/, '密码需包含数字');

/** 账号密码登录；注册开放后密码下限对齐为 6 位，否则 6-7 位密码注册后无法登录。 */
export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(6).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  email: z.email(),
  password: PasswordSchema,
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/** access token 30 天，v1 不做 refresh 轮换。 */
export const LoginResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string().min(1),
});
