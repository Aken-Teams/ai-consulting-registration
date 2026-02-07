import { Router } from 'express';
import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, notifications, pageViews } from '../db/schema.js';
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

// GET /api/auth/users — list assignable users (admin/consultant)
router.get('/users', requireAuth, async (_req, res) => {
  try {
    const result = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.isActive, true));
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/auth/notifications — list user notifications
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const data = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    const unreadCount = data.filter(n => !n.isRead).length;
    res.json({ success: true, data, unreadCount });
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// POST /api/auth/notifications/read-all — mark all as read
router.post('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// PATCH /api/auth/notifications/:id/read — mark single as read
router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const nId = parseInt(req.params.id);
    if (isNaN(nId)) {
      res.status(400).json({ success: false, message: '無效的通知 ID' });
      return;
    }
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, nId));
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// POST /api/auth/users — create new user (admin only)
router.post('/users', requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ success: false, message: '僅管理員可新增使用者' });
      return;
    }
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: '請填寫姓名、Email 和密碼' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ success: false, message: '密碼至少 6 個字元' });
      return;
    }
    // Check duplicate email
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      res.status(409).json({ success: false, message: '此 Email 已被使用' });
      return;
    }
    const passwordHash = await hashPassword(password);
    const [newUser] = await db.insert(users).values({
      name,
      email,
      passwordHash,
      role: role === 'admin' ? 'admin' : 'consultant',
    }).returning();
    res.json({
      success: true,
      data: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, isActive: newUser.isActive },
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// PATCH /api/auth/users/:id — update user (admin only)
router.patch('/users/:id', requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ success: false, message: '僅管理員可編輯使用者' });
      return;
    }
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      res.status(400).json({ success: false, message: '無效的使用者 ID' });
      return;
    }
    const { name, email, role, isActive, password } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    if (password && password.length >= 6) {
      updates.passwordHash = await hashPassword(password);
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ success: false, message: '沒有需要更新的欄位' });
      return;
    }
    const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
    if (!updated) {
      res.status(404).json({ success: false, message: '找不到使用者' });
      return;
    }
    res.json({
      success: true,
      data: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, isActive: updated.isActive },
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// GET /api/auth/pageview-stats — landing page analytics
router.get('/pageview-stats', requireAuth, async (_req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);

    const [totalResult] = await db.select({ count: sql<number>`count(*)::int` }).from(pageViews);
    const [todayResult] = await db.select({ count: sql<number>`count(*)::int` }).from(pageViews)
      .where(sql`${pageViews.createdAt} >= ${todayStart}`);
    const [weekResult] = await db.select({ count: sql<number>`count(*)::int` }).from(pageViews)
      .where(sql`${pageViews.createdAt} >= ${weekStart}`);

    // Unique IPs today
    const [uniqueResult] = await db.select({
      count: sql<number>`count(DISTINCT ${pageViews.ip})::int`,
    }).from(pageViews).where(sql`${pageViews.createdAt} >= ${todayStart}`);

    res.json({
      success: true,
      data: {
        total: totalResult.count,
        today: todayResult.count,
        thisWeek: weekResult.count,
        uniqueToday: uniqueResult.count,
      },
    });
  } catch (err) {
    console.error('Pageview stats error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

export default router;
