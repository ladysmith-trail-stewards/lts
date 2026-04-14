import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readDotEnv() {
  try {
    return Object.fromEntries(
      readFileSync(resolve(__dirname, '../.env'), 'utf8')
        .split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('='))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch { return {}; }
}
const env = readDotEnv();
const SUPABASE_URL = process.env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.VITE_SUPABASE_SECRET_KEY;
if (!SERVICE_KEY) { console.error('Missing service-role key in .env'); process.exit(1); }

const c = createClient(SUPABASE_URL, SERVICE_KEY);

const { data: usersResult } = await c.auth.admin.listUsers({ perPage: 200 });
const testUsers = usersResult.users.filter(u => u.email && u.email.includes('test-fixture.invalid'));
console.log('test auth users:', testUsers.length);

// Find orphaned auth users (no profile row)
const orphans = [];
for (const u of testUsers) {
  const { data: p } = await c.from('profiles').select('id').eq('auth_user_id', u.id).maybeSingle();
  if (!p) {
    orphans.push(u);
    console.log('orphan auth user:', u.email, u.id);
  }
}

// Delete orphaned auth users
for (const u of orphans) {
  await c.auth.admin.deleteUser(u.id);
  console.log('deleted orphan:', u.email);
}

console.log('done');
