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

const { data: regions } = await c.from('regions').select('id').like('name', 'i_test_%');
const ids = regions?.map(r => r.id) ?? [];

if (ids.length) {
  console.log('Deleting trails in test regions:', ids);
  await c.from('trails').delete().in('region_id', ids);

  const { data: regionProfiles } = await c.from('profiles').select('id, auth_user_id').in('region_id', ids);
  if (regionProfiles?.length) {
    await c.from('profiles').delete().in('id', regionProfiles.map(p => p.id));
    await Promise.all(regionProfiles.map(p => c.auth.admin.deleteUser(p.auth_user_id).catch(() => {})));
    console.log('Deleted', regionProfiles.length, 'profiles in test regions');
  }
}

const { data: namedProfiles } = await c.from('profiles').select('id, auth_user_id').like('name', 'i_test_%');
if (namedProfiles?.length) {
  await c.from('profiles').delete().in('id', namedProfiles.map(p => p.id));
  await Promise.all(namedProfiles.map(p => c.auth.admin.deleteUser(p.auth_user_id).catch(() => {})));
  console.log('Deleted', namedProfiles.length, 'i_test_ named profiles');
}

if (ids.length) {
  const { error } = await c.from('regions').delete().like('name', 'i_test_%');
  if (error) console.error('Error deleting regions:', error.message);
  else console.log('Purged', ids.length, 'test regions');
} else {
  console.log('No test regions to purge');
}
