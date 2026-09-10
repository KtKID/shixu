import { z } from 'zod';

/** v1 只有账号密码登录；无注册 / 找回，账号由 server CLI 创建。 */
export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** access token 30 天，v1 不做 refresh 轮换。 */
export const LoginResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string().min(1),
});
