import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { LoginRequestSchema } from '@x-threadpick/shared';
import { db } from './db';
import { users } from './db/schema';

/** v1 账号管理：create-user / set-password（无注册页、无找回）。 */

function usage(): never {
  console.log('用法:');
  console.log('  pnpm cli create-user <email> <password>');
  console.log('  pnpm cli set-password <email> <password>');
  process.exit(1);
}

async function main(): Promise<void> {
  const [cmd, email, password] = process.argv.slice(2);
  if (cmd === undefined || email === undefined || password === undefined) usage();

  const creds = LoginRequestSchema.parse({ email, password });

  if (cmd === 'create-user') {
    const existing = db.select().from(users).where(eq(users.email, creds.email)).get();
    if (existing !== undefined) {
      db.update(users)
        .set({ passwordHash: await hash(creds.password) })
        .where(eq(users.email, creds.email))
        .run();
      console.log(`用户已存在，密码已重置: ${creds.email}`);
      return;
    }
    db.insert(users)
      .values({
        id: randomUUID(),
        email: creds.email,
        passwordHash: await hash(creds.password),
        createdAt: new Date().toISOString(),
      })
      .run();
    console.log(`已创建用户: ${creds.email}`);
    return;
  }

  if (cmd === 'set-password') {
    const existing = db.select().from(users).where(eq(users.email, creds.email)).get();
    if (existing === undefined) {
      console.error(`用户不存在: ${creds.email}`);
      process.exit(1);
    }
    db.update(users)
      .set({ passwordHash: await hash(creds.password) })
      .where(eq(users.email, creds.email))
      .run();
    console.log(`密码已更新: ${creds.email}`);
    return;
  }

  usage();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
