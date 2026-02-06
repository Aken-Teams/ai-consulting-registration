import express from 'express';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Registration, ApiResponse } from './shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_FILE = join(ROOT, 'data', 'registrations.json');
const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(join(ROOT, 'public')));
app.use('/dist', express.static(join(ROOT, 'dist')));

// --- Helpers ---

async function ensureDataFile(): Promise<void> {
  const dir = dirname(DATA_FILE);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  if (!existsSync(DATA_FILE)) {
    await writeFile(DATA_FILE, '[]', 'utf-8');
  }
}

async function readRegistrations(): Promise<Registration[]> {
  await ensureDataFile();
  const raw = await readFile(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

async function saveRegistration(reg: Registration): Promise<void> {
  const list = await readRegistrations();
  list.push(reg);
  await writeFile(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone: string): boolean {
  return /^[\d\-+() ]{7,20}$/.test(phone);
}

// --- Routes ---

app.post('/api/register', async (req, res) => {
  try {
    const { company, contactName, title, email, phone, companySize, needTypes, description } = req.body;

    // Validation
    const errors: string[] = [];
    if (!company || typeof company !== 'string' || company.trim().length < 1) {
      errors.push('請填寫公司名稱');
    }
    if (!contactName || typeof contactName !== 'string' || contactName.trim().length < 1) {
      errors.push('請填寫聯絡人姓名');
    }
    if (!email || typeof email !== 'string' || !validateEmail(email.trim())) {
      errors.push('請填寫有效的 Email');
    }
    if (!phone || typeof phone !== 'string' || !validatePhone(phone.trim())) {
      errors.push('請填寫有效的電話號碼');
    }
    if (!companySize || typeof companySize !== 'string') {
      errors.push('請選擇公司規模');
    }
    if (!Array.isArray(needTypes) || needTypes.length === 0) {
      errors.push('請至少選擇一項需求類型');
    }

    if (errors.length > 0) {
      const response: ApiResponse = { success: false, message: errors.join('；') };
      res.status(422).json(response);
      return;
    }

    const registration: Registration = {
      id: randomUUID(),
      company: company.trim(),
      contactName: contactName.trim(),
      title: (title || '').trim(),
      email: email.trim(),
      phone: phone.trim(),
      companySize,
      needTypes,
      description: (description || '').trim(),
      submittedAt: new Date().toISOString(),
    };

    await saveRegistration(registration);

    const response: ApiResponse<{ id: string }> = {
      success: true,
      message: '報名成功！我們將盡快與您聯繫安排訪談。',
      data: { id: registration.id },
    };
    res.status(201).json(response);
  } catch (err) {
    console.error('Registration error:', err);
    const response: ApiResponse = { success: false, message: '伺服器錯誤，請稍後再試。' };
    res.status(500).json(response);
  }
});

app.get('/api/registrations', async (_req, res) => {
  try {
    const list = await readRegistrations();
    res.json({ success: true, data: list });
  } catch (err) {
    console.error('Read registrations error:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
