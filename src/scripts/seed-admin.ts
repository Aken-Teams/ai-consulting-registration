import 'dotenv/config';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { hashPassword } from '../lib/auth.js';
import { eq } from 'drizzle-orm';

async function seed() {
  const adminEmail = 'admin@ai-consulting.com';
  const adminPassword = 'admin123';

  const existing = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existing.length > 0) {
    console.log(`Admin user already exists: ${adminEmail}`);
    process.exit(0);
  }

  const hash = await hashPassword(adminPassword);
  const [admin] = await db.insert(users).values({
    email: adminEmail,
    passwordHash: hash,
    name: '系統管理員',
    role: 'admin',
  }).returning();

  console.log(`Admin user created:`);
  console.log(`  Email: ${adminEmail}`);
  console.log(`  Password: ${adminPassword}`);
  console.log(`  ID: ${admin.id}`);
  console.log('\n⚠️  請在正式環境更改密碼！');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
