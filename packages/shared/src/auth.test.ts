import { describe, expect, it } from 'vitest';
import { LoginRequestSchema, RegisterRequestSchema } from './auth';

describe('RegisterRequestSchema（feat09）', () => {
  it('register_accept：英文+数字且大于 5 位的密码通过', () => {
    expect(RegisterRequestSchema.safeParse({ email: 'a@x.com', password: 'abc123' }).success).toBe(
      true,
    );
    expect(
      RegisterRequestSchema.safeParse({ email: 'a@x.com', password: 'a1b2c3d4' }).success,
    ).toBe(true);
  });

  it('register_short：长度不超过 5 位的密码被拒绝', () => {
    expect(RegisterRequestSchema.safeParse({ email: 'a@x.com', password: 'abc12' }).success).toBe(
      false,
    );
    expect(RegisterRequestSchema.safeParse({ email: 'a@x.com', password: 'ab12' }).success).toBe(
      false,
    );
  });

  it('register_no_digit：纯英文密码被拒绝', () => {
    expect(RegisterRequestSchema.safeParse({ email: 'a@x.com', password: 'abcdef' }).success).toBe(
      false,
    );
  });

  it('register_no_letter：纯数字密码被拒绝', () => {
    expect(RegisterRequestSchema.safeParse({ email: 'a@x.com', password: '123456' }).success).toBe(
      false,
    );
  });

  it('register_bad_email：非法邮箱被拒绝', () => {
    expect(
      RegisterRequestSchema.safeParse({ email: 'not-an-email', password: 'abc123' }).success,
    ).toBe(false);
  });
});

describe('LoginRequestSchema', () => {
  it('login_min6：接受 6 位密码（与注册规则对齐）', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@x.com', password: 'abc123' }).success).toBe(
      true,
    );
  });
});
