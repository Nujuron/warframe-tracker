import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { CatalogueItem, TrackedItem } from '../../src/lib/types';

const origin = process.env.TRACKER_LIVE_BASE_URL || 'http://127.0.0.1:5178';
const admin = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
	auth: { persistSession: false, autoRefreshToken: false }
});
const catalogue = JSON.parse(readFileSync('src/lib/data/snapshot.json', 'utf8'))
	.catalogue as CatalogueItem[];
const accounts: string[] = [];
function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => (release = resolve));
	return { promise, release };
}
test.afterAll(async () => {
	for (const id of accounts) {
		const { error } = await admin.auth.admin.deleteUser(id);
		if (error) throw Error('Disposable optimistic test account cleanup failed.');
	}
});

test('slow cloud edits are immediate, serialize revisions, avoid reloads, reject stale refreshes and preserve failed drafts', async ({
	page
}) => {
	const email = `tracker-optimistic-${randomUUID()}@example.invalid`,
		password = `Test-${randomUUID()}!`;
	const { data, error } = await admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
		user_metadata: { tracker_tour_version: 1 }
	});
	if (error) throw error;
	accounts.push(data.user.id);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/tracker$/);
	const added: TrackedItem[] = [];
	for (const name of ['Akstiletto Prime', 'Baza Prime']) {
		const c = catalogue.find((c) => c.name === name)!;
		const r = await page.request.post('/api/tracker', {
			headers: { origin },
			data: { name, category: c.category, catalogue_id: c.id }
		});
		expect(r.ok()).toBe(true);
		added.push(await r.json());
	}
	await page.reload();
	const initialRead = await (await page.request.get('/api/tracker')).json();
	const [ak, baza] = added;
	const firstSave = gate(),
		reached = gate();
	let held = false,
		trackerReads = 0,
		pageReloads = 0;
	page.on('request', (r) => {
		if (r.method() === 'GET' && new URL(r.url()).pathname === '/api/tracker') trackerReads++;
		if (r.url().includes('__data.json')) pageReloads++;
	});
	await page.route(`**/api/tracker/${ak.id}`, async (route) => {
		if (route.request().method() === 'PATCH' && !held) {
			held = true;
			reached.release();
			await firstSave.promise;
		}
		await route.continue();
	});
	await page.getByRole('button', { name: 'Prioritize Akstiletto Prime', exact: true }).click();
	await reached.promise;
	await expect(
		page.getByRole('button', { name: 'Remove priority from Akstiletto Prime', exact: true })
	).toBeEnabled();
	const akCard = page
		.locator('article.equipment')
		.filter({ has: page.getByLabel('Status for Akstiletto Prime') });
	await expect(akCard.getByText('Saving…', { exact: true })).toBeVisible();
	await akCard.getByText('Relics & parts', { exact: false }).click();
	await page.getByLabel('Own Akstiletto Prime Barrel, copy 1 of 2', { exact: true }).check();
	await page.getByLabel('Own Akstiletto Prime Barrel, copy 2 of 2', { exact: true }).check();
	await expect(
		page.getByLabel('Own Akstiletto Prime Barrel, copy 2 of 2', { exact: true })
	).toBeChecked();
	await akCard.getByRole('button', { name: 'Add note', exact: true }).click();
	await page.getByLabel('Notes for Akstiletto Prime').fill('Rapid edit saved in order');
	await page.getByLabel('Notes for Akstiletto Prime').press('Tab');
	await page.getByRole('button', { name: 'Prioritize Baza Prime', exact: true }).click();
	const bazaCard = page
		.locator('article.equipment')
		.filter({ has: page.getByLabel('Status for Baza Prime') });
	await expect(
		page.getByRole('button', { name: 'Remove priority from Baza Prime', exact: true })
	).toBeEnabled();
	await expect(bazaCard.getByText('Saving…', { exact: true })).toHaveCount(0);
	await expect(akCard.getByText('Saving…', { exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Farm focus 2', exact: true }).click();
	await expect(page).toHaveURL(/\/tracker$/); // Internal navigation waits for pending writes.
	firstSave.release();
	await expect(page.getByRole('status')).toHaveText('Saved.', { timeout: 30000 });
	expect(trackerReads).toBe(0);
	expect(pageReloads).toBe(0);
	const saved = await (await page.request.get('/api/tracker')).json();
	expect(saved.items.find((i: TrackedItem) => i.id === ak.id)).toMatchObject({
		priority: true,
		notes: 'Rapid edit saved in order',
		parts: { 'Akstiletto Prime Barrel': 2 },
		revision: 5
	});
	expect(saved.revision).toBe(initialRead.revision + 5);
	await page.unroute(`**/api/tracker/${ak.id}`);

	// An old refresh response must not erase edits made after the refresh started.
	const refresh = gate(),
		refreshRead = gate();
	const refreshResponse = page.waitForResponse(
		(r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/tracker'
	);
	await page.route('**/api/tracker', async (route) => {
		if (route.request().method() !== 'GET') return route.continue();
		const response = await route.fetch();
		refreshRead.release();
		await refresh.promise;
		await route.fulfill({ response });
	});
	await page.getByLabel('Notes for Akstiletto Prime').press('Tab');
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await refreshRead.promise;
	await page.getByLabel('Status for Baza Prime').selectOption('owned');
	await expect(page.getByLabel('Status for Baza Prime')).toHaveValue('owned');
	await expect(page.getByRole('status')).toHaveText('Saved.');
	refresh.release();
	await refreshResponse;
	await page.unroute('**/api/tracker');
	await expect(page.getByLabel('Status for Baza Prime')).toHaveValue('owned');

	// A real revision conflict rolls back locally and leaves the unsaved note available.
	const beforeConflict = saved.items.find((i: TrackedItem) => i.id === ak.id);
	const external = await page.request.patch(`/api/tracker/${ak.id}`, {
		headers: { origin },
		data: { revision: beforeConflict.revision, patch: { notes: 'Newer edit from another device' } }
	});
	expect(external.ok()).toBe(true);
	await page.getByLabel('Notes for Akstiletto Prime').fill('Do not lose this unsaved draft');
	await page.getByLabel('Notes for Akstiletto Prime').press('Tab');
	await expect(page.getByRole('status')).toContainText('changed elsewhere');
	await expect(page.getByLabel('Notes for Akstiletto Prime')).toHaveValue(
		'Rapid edit saved in order'
	);
	await expect(page.getByLabel('Status for Akstiletto Prime')).toBeDisabled();
	await expect(page.getByLabel('Status for Baza Prime')).toBeEnabled();
	await page.getByText('Unsaved notes', { exact: true }).click();
	await expect(page.getByText('Do not lose this unsaved draft', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Data refreshed.');
	await expect(page.getByLabel('Notes for Akstiletto Prime')).toHaveValue(
		'Newer edit from another device'
	);
	await expect(page.getByText('Do not lose this unsaved draft', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Dismiss draft', exact: true }).click();
	await expect(page.getByText('Unsaved notes', { exact: true })).toHaveCount(0);
	await page.getByLabel('Status for Akstiletto Prime').selectOption('building');
	await expect(page.getByRole('status')).toHaveText('Saved.');
	await page.reload();
	await expect(page.getByLabel('Status for Akstiletto Prime')).toHaveValue('building');
	await expect(
		page.getByRole('button', { name: 'Remove priority from Baza Prime', exact: true })
	).toBeVisible();
});
