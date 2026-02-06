import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { verifyPassword, signToken, hashPassword } from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { loginSchema } from '../lib/validators.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, message: '請輸入 Email 和密碼' });
    return;
  }

  const { email, password } = result.data;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
    return;
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  res.json({
    success: true,
    data: {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    },
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: req.user });
});

// PATCH /api/auth/password
router.patch('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: '請輸入目前密碼和新密碼' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ success: false, message: '新密碼至少 6 個字元' });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
    if (!user) {
      res.status(404).json({ success: false, message: '找不到使用者' });
      return;
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, message: '目前密碼錯誤' });
      return;
    }

    const newHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));

    res.json({ success: true, message: '密碼已更新' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

export default router;
