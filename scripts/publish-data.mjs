import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import { validateData } from './refresh-data.mjs';
const { PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!PUBLIC_SUPABASE_URL || !SUPABASE_SECRET_KEY)
	throw Error('Set the new tracker project URL and server-only secret in .env');
const data = validateData(JSON.parse(await fs.readFile('src/lib/data/snapshot.json', 'utf8')));
const db = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
	auth: { persistSession: false }
});
const { error } = await db.rpc('publish_catalogue', { payload: data });
if (error) throw error;
console.log(`Published ${data.catalogue.length} catalogue records and relic snapshot atomically.`);
