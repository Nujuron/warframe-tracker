import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const url = process.env.PUBLIC_SUPABASE_URL!,
	key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
	auth: { persistSession: false, autoRefreshToken: false }
});
const password = `Acceptance-${randomUUID()}!`,
	users: { id: string; email: string }[] = [];
const origin = process.env.TRACKER_LIVE_BASE_URL || 'http://127.0.0.1:5178';
test.beforeEach(async ({ page }) => {
	page.on('pageerror', (error) => console.error('Browser application error:', error.message));
});
async function signin(page: Page, email: string) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/tracker$/);
}
test.beforeAll(async () => {
	for (const letter of ['a', 'b', 'mcp-a', 'mcp-b']) {
		const email = `tracker-acceptance-${letter}-${randomUUID()}@example.invalid`;
		const { data, error } = await admin.auth.admin.createUser({
			email,
			password,
			email_confirm: true,
			user_metadata: { display_name: `Acceptance ${letter}` }
		});
		if (error) throw Error(`Temporary test account could not be created: ${error.message}`);
		users.push({ id: data.user.id, email });
	}
});

test('real OAuth client: denial, approval, authenticated MCP, isolation and immediate revocation', async ({
	page
}) => {
	const callback = `${origin}/mcp-test-callback`;
	const { data: client, error } = await admin.auth.admin.oauth.createClient({
		client_name: `Tracker acceptance ${randomUUID()}`,
		redirect_uris: [callback],
		token_endpoint_auth_method: 'none'
	});
	if (error) throw Error(`Temporary OAuth client could not be created: ${error.message}`);
	const clientId = client!.client_id;
	try {
		// Follow the actual HTTP challenge as an MCP client does, rather than assuming its URL.
		const unauthenticated = await fetch(`${origin}/mcp`);
		expect(unauthenticated.status).toBe(401);
		const metadataUrl = unauthenticated.headers
			.get('www-authenticate')
			?.match(/resource_metadata="([^"]+)"/)?.[1];
		expect(metadataUrl).toBe(`${origin}/.well-known/oauth-protected-resource/mcp`);
		const metadataResponse = await fetch(metadataUrl!);
		expect(metadataResponse.status).toBe(200);
		expect(await metadataResponse.json()).toMatchObject({
			resource: `${origin}/mcp`,
			authorization_servers: [`${url}/auth/v1`]
		});
		await page.route('**/mcp-test-callback*', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<p>OAuth acceptance callback received.</p>'
			})
		);
		await signin(page, users[2].email);
		async function authorize() {
			const verifier = randomBytes(48).toString('base64url'),
				challenge = createHash('sha256').update(verifier).digest('base64url');
			const params = new URLSearchParams({
				response_type: 'code',
				client_id: clientId,
				redirect_uri: callback,
				code_challenge: challenge,
				code_challenge_method: 'S256',
				scope: 'openid email profile offline_access',
				resource: `${origin}/mcp`,
				state: randomUUID(),
				prompt: 'consent'
			});
			const response = await fetch(`${url}/auth/v1/oauth/authorize?${params}`, {
				redirect: 'manual'
			});
			expect(response.status, await response.text()).toBe(302);
			const location = response.headers.get('location')!;
			const consentUrl = new URL(location);
			expect(consentUrl.pathname).toBe('/oauth/consent');
			await page.goto(`${origin}${consentUrl.pathname}${consentUrl.search}`);
			await expect(page.getByRole('button', { name: 'Allow access' })).toBeVisible();
			return verifier;
		}
		await authorize();
		await page.getByRole('button', { name: 'Deny', exact: true }).click();
		await expect(page).toHaveURL(/mcp-test-callback.*error=access_denied/);
		const verifier = await authorize();
		await page.getByRole('button', { name: 'Allow access' }).click();
		await expect(page).toHaveURL(/mcp-test-callback.*code=/);
		const code = new URL(page.url()).searchParams.get('code')!;
		const tokenResponse = await fetch(`${url}/auth/v1/oauth/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				client_id: client.client_id,
				redirect_uri: callback,
				code_verifier: verifier,
				resource: `${origin}/mcp`,
				code
			})
		});
		expect(tokenResponse.status).toBe(200);
		const tokens = await tokenResponse.json();
		async function mcp(
			name: string,
			args: Record<string, unknown> = {},
			token = tokens.access_token
		) {
			const response = await fetch(`${origin}/mcp`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream'
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name, arguments: args }
				})
			});
			const text = await response.text();
			const rpc =
				text.startsWith('event:') || text.startsWith('data:')
					? JSON.parse(
							text
								.split('\n')
								.find((s) => s.startsWith('data:'))!
								.slice(5)
						)
					: JSON.parse(text);
			return { status: response.status, rpc };
		}
		const added = await mcp('add_equipment', { name: 'MCP test frame', category: 'Other' });
		expect(added.rpc.result.isError).not.toBe(true);
		const listed = await mcp('list_tracked_equipment', { limit: 1 });
		expect(listed.status).toBe(200);
		const list = JSON.parse(listed.rpc.result.content[0].text);
		expect(list.total).toBe(1);
		const saved = await mcp('update_equipment', {
			id: list.items[0].id,
			revision: list.items[0].revision,
			changes: { notes: 'MCP acceptance note' }
		});
		expect(saved.rpc.result.isError).not.toBe(true);
		const other = createClient(url, key, { auth: { persistSession: false } });
		await other.auth.signInWithPassword({ email: users[3].email, password });
		const { data: otherItem, error: otherError } = await other.rpc('save_equipment', {
			payload: { name: 'Account B private item', category: 'Other', identity_key: 'custom:other:b' }
		});
		expect(otherError).toBeNull();
		const forbidden = await mcp('get_equipment', { id: otherItem.id });
		expect(forbidden.rpc.result.isError).toBe(true);
		expect(JSON.parse(forbidden.rpc.result.content[0].text).error.code).toBe('NOT_FOUND');
		expect((await mcp('list_tracked_equipment', {}, 'invalid-token')).status).toBe(401);
		await page.goto('/connections');
		const connection = page
			.locator('form')
			.filter({ has: page.locator(`input[value="${client.client_id}"]`) });
		await connection.getByRole('button', { name: 'Revoke access' }).click();
		await expect(page.getByRole('status')).toContainText('Access revoked');
		expect((await mcp('list_tracked_equipment')).status).toBe(401);
	} finally {
		const { error: cleanupError } = await admin.auth.admin.oauth.deleteClient(client.client_id);
		if (cleanupError) throw Error('Temporary OAuth client cleanup failed.');
	}
});
test.afterAll(async () => {
	for (const user of users) {
		const { error } = await admin.auth.admin.deleteUser(user.id);
		if (error) throw Error('Temporary account cleanup failed.');
	}
});
test('two real accounts: web isolation, migration, persistence, conflicts, components, failed saves and export', async ({
	browser,
	page
}) => {
	await signin(page, users[0].email);
	await expect(page.getByRole('heading', { name: 'Your list starts here.' })).toBeVisible();
	await page.goto('/catalogue?q=Citrine+Prime');
	await page.getByRole('button', { name: 'Add to tracker' }).click();
	await expect(page.getByRole('status')).toContainText('Citrine Prime is in your tracker');
	await page.goto('/tracker');
	await expect(page.getByText('Citrine Prime', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Load equipment', exact: true }).click();
	await page
		.getByLabel('Equipment list to import')
		.fill(readFileSync('tests/fixtures/original-289.json', 'utf8'));
	await page.getByRole('button', { name: 'Preview import' }).click();
	await expect(page.getByRole('heading', { name: 'Review 289 equipment entries' })).toBeVisible();
	await page.getByRole('button', { name: 'Apply import' }).click();
	await expect(
		page.getByText('Imported 288 new entries; 0 updated; 1 existing entries preserved.', {
			exact: true
		})
	).toBeVisible();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	const get = await page.request.get('/api/tracker');
	expect(get.ok(), await get.text()).toBe(true);
	let state = await get.json();
	expect(state.items).toHaveLength(289);
	const item = state.items.find((i: { name: string }) => i.name === 'Citrine Prime');
	const changed = await page.request.patch(`/api/tracker/${item.id}`, {
		headers: { origin },
		data: {
			revision: item.revision,
			patch: { status: 'owned', priority: true, notes: 'live verification note' }
		}
	});
	expect(changed.ok()).toBe(true);
	const stale = await page.request.patch(`/api/tracker/${item.id}`, {
		headers: { origin },
		data: { revision: item.revision, patch: { notes: 'stale overwrite' } }
	});
	expect(stale.status()).toBe(409);
	const latest = await changed.json();
	const part = state.snapshot.equipment.citrineprime.parts[0];
	expect(
		(
			await page.request.post(`/api/tracker/${item.id}/component`, {
				headers: { origin },
				data: { revision: latest.revision, part: part.name, count: 1 }
			})
		).ok()
	).toBe(true);
	await page.reload();
	await page.getByLabel('Search equipment or notes').fill('Citrine Prime');
	await expect(page.getByLabel('Status for Citrine Prime')).toHaveValue('owned');
	await page.getByRole('button', { name: 'Edit note' }).click();
	await expect(page.getByLabel('Notes for Citrine Prime')).toHaveValue('live verification note');
	// A second browser session for the same account reads the saved cloud state.
	const second = await browser.newContext();
	const secondPage = await second.newPage();
	await signin(secondPage, users[0].email);
	const persisted = await (await secondPage.request.get('/api/tracker')).json();
	expect(persisted.items.find((i: { id: string }) => i.id === item.id)).toMatchObject({
		status: 'owned',
		priority: true,
		notes: 'live verification note',
		parts: { [part.name]: 1 }
	});
	await second.close();
	const other = await browser.newContext();
	const otherPage = await other.newPage();
	await signin(otherPage, users[1].email);
	await expect(otherPage.getByRole('heading', { name: 'Your list starts here.' })).toBeVisible();
	expect((await otherPage.request.get(`/api/tracker/${item.id}`)).status()).toBe(404);
	expect(
		(
			await otherPage.request.patch(`/api/tracker/${item.id}`, {
				headers: { origin },
				data: { revision: latest.revision, patch: { notes: 'account B hijack' } }
			})
		).status()
	).toBe(404);
	const ownDb = createClient(url, key, { auth: { persistSession: false } });
	const { error: signinError } = await ownDb.auth.signInWithPassword({
		email: users[1].email,
		password
	});
	expect(signinError).toBeNull();
	const foreign = await ownDb.from('user_equipment').select('*').eq('user_id', users[0].id);
	expect(foreign.error).toBeNull();
	expect(foreign.data).toEqual([]);
	await other.close();
	// Show a failed save without changing the database.
	await page.route('**/api/tracker/*', (route) =>
		route.request().method() === 'PATCH'
			? route.fulfill({
					status: 503,
					contentType: 'application/json',
					body: JSON.stringify({ error: { message: 'Test cloud save unavailable' } })
				})
			: route.continue()
	);
	await page.getByLabel('Status for Citrine Prime').selectOption('mastered');
	await expect(page.getByRole('status')).toContainText('Test cloud save unavailable');
	await expect(page.getByLabel('Status for Citrine Prime')).toHaveValue('owned');
	await page.unroute('**/api/tracker/*');
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export backup' }).click();
	const download = await downloadPromise;
	const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
	expect(exported.items).toHaveLength(289);
	expect(Object.values(exported.progress)).toContainEqual(
		expect.objectContaining({
			notes: 'live verification note',
			priority: true,
			parts: { [part.name]: 1 }
		})
	);
});

test('real confirmation and password recovery tokens work; invalid links fail safely', async ({
	page
}) => {
	const email = `tracker-confirmation-${randomUUID()}@example.invalid`;
	const { data: signup, error: signupError } = await admin.auth.admin.generateLink({
		type: 'signup',
		email,
		password
	});
	if (signupError || !signup?.user) throw Error('Confirmation test link could not be generated.');
	users.push({ id: signup.user.id, email });
	const unverified = createClient(url, key, { auth: { persistSession: false } });
	const first = await unverified.auth.signInWithPassword({ email, password });
	expect(first.error).not.toBeNull();
	await page.goto(
		`/auth/confirm?${new URLSearchParams({ token_hash: signup.properties.hashed_token, type: 'email' })}`
	);
	await expect(page).toHaveURL(/\/tracker$/);
	await expect(page.getByRole('heading', { name: 'Your list starts here.' })).toBeVisible();
	const { data: recovery, error: recoveryError } = await admin.auth.admin.generateLink({
		type: 'recovery',
		email
	});
	if (recoveryError || !recovery) throw Error('Recovery test link could not be generated.');
	await page.goto(
		`/auth/confirm?${new URLSearchParams({ token_hash: recovery.properties.hashed_token, type: 'recovery' })}`
	);
	await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
	const newPassword = `Recovered-${randomUUID()}!`;
	await page.getByLabel('New password', { exact: true }).fill(newPassword);
	await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
	await page.getByRole('button', { name: 'Update password' }).click();
	await expect(page.getByRole('status')).toContainText('Password updated');
	const updated = await unverified.auth.signInWithPassword({ email, password: newPassword });
	expect(updated.error).toBeNull();
	await page.goto('/auth/confirm?token_hash=invalid&type=recovery');
	await expect(page).toHaveURL(/login\?error=confirmation/);
});
