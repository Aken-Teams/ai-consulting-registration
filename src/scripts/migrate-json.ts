import 'dotenv/config';
import { readFile, existsSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { leads, cases } from '../db/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '../../data/registrations.json');

async function migrate() {
  console.log('Reading registrations.json...');

  let data: Array<{
    id: string;
    company: string;
    contactName: string;
    title?: string;
    email: string;
    phone: string;
    companySize: string;
    needTypes: string[];
    description?: string;
    submittedAt: string;
  }>;

  try {
    const raw = await readFileAsync(DATA_FILE, 'utf-8');
    data = JSON.parse(raw);
  } catch {
    console.log('No registrations.json found or empty. Nothing to migrate.');
    process.exit(0);
  }

  if (data.length === 0) {
    console.log('No registrations to migrate.');
    process.exit(0);
  }

  console.log(`Found ${data.length} registrations to migrate.`);

  for (const reg of data) {
    const [lead] = await db.insert(leads).values({
      company: reg.company,
      contactName: reg.contactName,
      title: reg.title || null,
      email: reg.email,
      phone: reg.phone,
      companySize: reg.companySize,
      needTypes: reg.needTypes,
      description: reg.description || null,
      createdAt: new Date(reg.submittedAt),
      updatedAt: new Date(reg.submittedAt),
    }).returning({ id: leads.id });

    await db.insert(cases).values({
      leadId: lead.id,
      status: 'new',
      title: `${reg.company} — AI 輔能諮詢`,
      createdAt: new Date(reg.submittedAt),
      updatedAt: new Date(reg.submittedAt),
    });

    console.log(`  Migrated: ${reg.company} (${reg.contactName}) → lead #${lead.id}`);
  }

  console.log('Migration complete!');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
