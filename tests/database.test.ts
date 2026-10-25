import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import snapshot from '../src/lib/data/snapshot.json';
const a = '00000000-0000-4000-8000-000000000001',
	b = '00000000-0000-4000-8000-000000000002';
let db: PGlite;
let itemId: string;
async function login(user = a, client?: string) {
	await db.exec('reset role');
	await db.query("select set_config('request.jwt.claims',$1,false)", [
		JSON.stringify({ sub: user, role: 'authenticated', ...(client ? { client_id: client } : {}) })
	]);
	await db.exec('set role authenticated');
}
async function save(payload: unknown, id: string | null = null, rev: number | null = null) {
	return (
		await db.query<{ id: string; revision: number; status: string; notes: string }>(
			`select * from public.save_equipment($1::jsonb,$2::uuid,$3::integer)`,
			[JSON.stringify(payload), id, rev]
		)
	).rows[0];
}
const input = {
	name: 'Atlas',
	category: 'Warframes',
	identity_key: 'custom:warframes:atlas',
	status: 'missing'
};
async function preview(payload: unknown[], revision: number) {
	return (
		await db.query<{ id: string }>(
			'insert into public.import_previews(user_id,payload,expected_revision) values(auth.uid(),$1::jsonb,$2) returning id',
			[JSON.stringify(payload), revision]
		)
	).rows[0].id;
}
async function revision() {
	return (
		(
			await db.query<{ revision: number }>(
				'select revision from public.tracker_state where user_id=auth.uid()'
			)
		).rows[0]?.revision || 0
	);
}
beforeAll(async () => {
	db = new PGlite();
	await db.exec(
		`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema auth,public to anon,authenticated,service_role; create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$; create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$; insert into auth.users values('${a}'),('${b}');`
	);
	await db.exec(readFileSync('supabase/migrations/20261025141724_tracker_foundation.sql', 'utf8'));
	await db.exec(readFileSync('supabase/migrations/20261025142000_tracker_hardening.sql', 'utf8'));
	await db.exec(readFileSync('supabase/migrations/20261025144500_policy_initplans.sql', 'utf8'));
	await login();
}, 30000);
afterAll(async () => {
	await db?.close();
});
describe.sequential('actual PostgreSQL migration and account policies', () => {
	it('starts empty and adds idempotently without replacing progress', async () => {
		expect((await db.query('select * from public.user_equipment')).rows).toHaveLength(0);
		const item = await save({ ...input, status: 'owned', notes: 'original' });
		itemId = item.id;
		const duplicate = await save({ ...input, status: 'mastered' });
		expect(duplicate.id).toBe(item.id);
		expect(duplicate.status).toBe('owned');
		expect(await revision()).toBe(1);
	});
	it('rejects stale updates and accepts a current revision', async () => {
		const item = await save({ notes: 'newer' }, itemId, 1);
		expect(item.revision).toBe(2);
		await expect(save({ notes: 'stale' }, itemId, 1)).rejects.toThrow('CONFLICT');
		expect(
			(await db.query<{ notes: string }>('select notes from public.user_equipment')).rows[0].notes
		).toBe('newer');
		const state = (
			await db.query<{ state: { revision: number; items: { id: string; notes: string }[] } }>(
				'select public.read_tracker() state'
			)
		).rows[0].state;
		expect(state.revision).toBe(await revision());
		expect(state.items[0]).toMatchObject({ id: itemId, notes: 'newer' });
	});
	it('isolates two users, blocks forged ownership and shared catalogue writes', async () => {
		await login(b);
		expect((await db.query('select * from public.user_equipment')).rows).toHaveLength(0);
		await expect(save({ notes: 'hijack' }, itemId, 2)).rejects.toThrow('NOT_FOUND');
		await expect(
			db.query(
				"insert into public.user_equipment(user_id,identity_key,name,category) values($1,'forged','X','Other')",
				[a]
			)
		).rejects.toThrow();
		await expect(
			db.exec("insert into public.equipment_catalogue values('x','X','Other','{}',false)")
		).rejects.toThrow('permission denied');
		await expect(db.query('select public.publish_catalogue($1::jsonb)', ['{}'])).rejects.toThrow(
			'permission denied'
		);
		await save({ ...input, notes: 'account B' });
		await login();
		expect((await db.query('select * from public.user_equipment')).rows).toHaveLength(1);
	});
	it('merges imports by default, is idempotent and replaces only when explicitly selected', async () => {
		const id = await preview(
			[
				{ ...input, status: 'mastered' },
				{ ...input, name: 'Citrine', identity_key: 'custom:warframes:citrine' }
			],
			await revision()
		);
		const first = (
			await db.query<{ result: unknown }>('select public.apply_equipment_import($1) result', [id])
		).rows[0].result;
		expect(first).toEqual({ added: 1, updated: 0, preserved: 1 });
		expect(
			(await db.query<{ result: unknown }>('select public.apply_equipment_import($1) result', [id]))
				.rows[0].result
		).toEqual(first);
		const id2 = await preview(
			[{ ...input, status: 'mastered', priority: true, parts: { Barrel: 2 } }],
			await revision()
		);
		await db.query('select public.apply_equipment_import($1,true)', [id2]);
		expect(
			(
				await db.query<{ status: string }>('select status from public.user_equipment where id=$1', [
					itemId
				])
			).rows[0].status
		).toBe('mastered');
	});
	it('rejects changed-list and expired previews and rolls back a partially invalid import', async () => {
		const id = await preview([input], await revision());
		const current = (
			await db.query<{ revision: number }>(
				'select revision from public.user_equipment where id=$1',
				[itemId]
			)
		).rows[0].revision;
		await save({ notes: 'changed after preview' }, itemId, current);
		await expect(db.query('select public.apply_equipment_import($1)', [id])).rejects.toThrow(
			'CONFLICT'
		);
		const expired = await preview([input], await revision());
		await db.query(
			"update public.import_previews set expires_at=now()-interval '1 second' where id=$1",
			[expired]
		);
		await expect(db.query('select public.apply_equipment_import($1)', [expired])).rejects.toThrow(
			'EXPIRED'
		);
		const invalid = await preview(
			[
				{ ...input, name: 'First', identity_key: 'custom:first' },
				{ ...input, name: 'Invalid', identity_key: 'custom:invalid', status: 'bad' }
			],
			await revision()
		);
		await expect(db.query('select public.apply_equipment_import($1)', [invalid])).rejects.toThrow();
		expect(
			(await db.query("select * from public.user_equipment where identity_key='custom:first'")).rows
		).toHaveLength(0);
	});
	it('requires OAuth approval, enforces the same ownership and revokes existing tokens', async () => {
		await login(a, 'assistant');
		await expect(save({ ...input, name: 'Unauthorised' })).rejects.toThrow('UNAUTHORIZED');
		await login();
		await db.query(
			"insert into public.oauth_client_grants(user_id,client_id) values(auth.uid(),'assistant')"
		);
		await login(a, 'assistant');
		expect((await db.query('select * from public.user_equipment')).rows.length).toBeGreaterThan(0);
		expect(
			(await db.query('select * from public.user_equipment where user_id=$1', [b])).rows
		).toHaveLength(0);
		await expect(db.query('select public.reset_tracker($1)', [await revision()])).rejects.toThrow(
			'UNAUTHORIZED'
		);
		await expect(
			db.exec('update public.oauth_client_grants set revoked_at=null')
		).resolves.toBeDefined(); // RLS updates zero rows for MCP.
		await login();
		await db.exec(
			"update public.oauth_client_grants set revoked_at=now() where client_id='assistant'"
		);
		await login(a, 'assistant');
		expect((await db.query('select * from public.user_equipment')).rows).toHaveLength(0);
		await expect(save(input)).rejects.toThrow('UNAUTHORIZED');
		await login();
	});
	it('blocks unauthenticated personal data and resets only the acting account with a current revision', async () => {
		await db.exec('reset role; set role anon');
		await expect(db.exec('select * from public.user_equipment')).rejects.toThrow(
			'permission denied'
		);
		await login();
		await expect(db.query('select public.reset_tracker($1)', [-1])).rejects.toThrow('CONFLICT');
		await db.query('select public.reset_tracker($1)', [await revision()]);
		expect((await db.query('select * from public.user_equipment')).rows).toHaveLength(0);
		await login(b);
		expect((await db.query('select * from public.user_equipment')).rows).toHaveLength(1);
	});
	it('publishes atomically and retains the last good snapshot after invalid data', async () => {
		await db.exec('reset role; set role service_role');
		await db.query('select public.publish_catalogue($1::jsonb)', [JSON.stringify(snapshot)]);
		const before = (
			await db.query<{ data: unknown; updated_at: unknown }>(
				"select data,updated_at from public.data_snapshots where id='current'"
			)
		).rows[0];
		const invalid = JSON.parse(JSON.stringify(snapshot));
		invalid.catalogue[100].name = null;
		await expect(
			db.query('select public.publish_catalogue($1::jsonb)', [JSON.stringify(invalid)])
		).rejects.toThrow();
		expect(
			(await db.query("select data,updated_at from public.data_snapshots where id='current'"))
				.rows[0]
		).toEqual(before);
		expect(
			(
				await db.query<{ count: number }>(
					'select count(*)::int count from public.equipment_catalogue where retired=false'
				)
			).rows[0].count
		).toBe(snapshot.catalogue.length);
		await expect(
			db.query('select public.publish_catalogue($1::jsonb)', ['{"catalogue":[]}'])
		).rejects.toThrow('INVALID_SNAPSHOT');
	});
});
