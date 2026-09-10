import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from './health';

describe('HealthResponseSchema（feat01 场景1：测试连接展示服务版本）', () => {
  it('ok + version + serverTime 解析通过', () => {
    expect(
      HealthResponseSchema.safeParse({
        ok: true,
        version: 'v0.0.1',
        serverTime: '2026-09-10T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('ok 非 true 或缺 version 被拒', () => {
    expect(
      HealthResponseSchema.safeParse({
        ok: false,
        version: 'v0.0.1',
        serverTime: '2026-09-10T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      HealthResponseSchema.safeParse({ ok: true, serverTime: '2026-09-10T00:00:00.000Z' }).success,
    ).toBe(false);
  });
});
