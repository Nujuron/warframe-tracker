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
			user_metadata: { display_name: `Acceptance ${letter}`, tracker_tour_version: 1 }
		});
		if (error) throw Error(`Temporary test account could not be created: ${error.message}`);
		users.push({ id: data.user.id, email });
	}
});

test('dynamic OAuth registration: denial, approval, authenticated MCP, isolation and immediate revocation', async ({
	page
}) => {
	const callback = `${origin}/mcp-test-callback`;
	const discoveryResponse = await fetch(`${url}/.well-known/oauth-authorization-server/auth/v1`);
	expect(discoveryResponse.status).toBe(200);
	const discovery = await discoveryResponse.json();
	expect(discovery.issuer).toBe(`${url}/auth/v1`);
	expect(discovery.registration_endpoint).toBe(`${url}/auth/v1/oauth/clients/register`);
	// Register as an ordinary MCP assistant: no API key, session or admin credentials.
	const registration = await fetch(discovery.registration_endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_name: `Tracker acceptance ${randomUUID()}`,
			redirect_uris: [callback],
			token_endpoint_auth_method: 'none',
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code']
		})
	});
	expect(registration.status).toBe(201);
	const client = await registration.json();
	const clientId = client.client_id;
	if (typeof clientId !== 'string' || !clientId)
		throw Error('Dynamic registration did not return a client ID.');
	try {
		expect(client.token_endpoint_auth_method).toBe('none');
		expect(Boolean(client.client_secret)).toBe(false);
		expect(client.redirect_uris).toEqual([callback]);
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
		const emptyFocus = await mcp('list_tracked_equipment', { focus: true });
		expect(JSON.parse(emptyFocus.rpc.result.content[0].text).total).toBe(0);
		const saved = await mcp('update_equipment', {
			id: list.items[0].id,
			revision: list.items[0].revision,
			changes: { notes: 'MCP acceptance note', priority: true }
		});
		expect(saved.rpc.result.isError).not.toBe(true);
		const focused = await mcp('list_tracked_equipment', { focus: true });
		expect(JSON.parse(focused.rpc.result.content[0].text).items[0]).toMatchObject({
			priority: true,
			notes: 'MCP acceptance note'
		});
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
	await page.locator('summary').filter({ hasText: 'More' }).click();
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

test('farm focus: saved stars, shared relics, collected copies, stages, failures and mobile persistence', async ({
	page,
	browser
}) => {
	const email = `tracker-focus-${randomUUID()}@example.invalid`;
	const { data: account, error } = await admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
		user_metadata: { tracker_tour_version: 1 }
	});
	if (error) throw Error('Could not create a disposable farming test account.');
	users.push({ id: account.user.id, email });
	await signin(page, email);
	await page.getByRole('link', { name: 'Farm focus 0' }).click();
	await expect(page.getByRole('heading', { name: 'Choose your next targets.' })).toBeVisible();
	const catalogue = JSON.parse(readFileSync('src/lib/data/snapshot.json', 'utf8')).catalogue as {
		id: string;
		name: string;
		category: string;
	}[];
	for (const name of ['Afentis Prime', 'Caliban Prime', 'Akstiletto Prime', 'Acceltra']) {
		const item = catalogue.find((i) => i.name === name)!;
		const response = await page.request.post('/api/tracker', {
			headers: { origin },
			data: { name, category: item.category, catalogue_id: item.id }
		});
		expect(response.ok()).toBe(true);
	}
	await page.goto('/tracker');
	for (const name of ['Afentis Prime', 'Caliban Prime', 'Akstiletto Prime']) {
		await page.getByRole('button', { name: `Prioritize ${name}`, exact: true }).click();
		await expect(
			page.getByRole('button', { name: `Remove priority from ${name}`, exact: true })
		).toBeEnabled();
	}
	await expect(page.getByRole('status')).toHaveText('Saved.');
	await page.getByRole('link', { name: 'Farm focus 3' }).click();
	const target = (name: string) =>
		page.getByRole('group', { name: `Farming target: ${name}`, exact: true });
	await expect(target('Afentis Prime')).toBeVisible();
	await expect(target('Acceltra')).toHaveCount(0);
	const shared = page
		.locator('.focusRelic')
		.filter({ has: page.locator('summary').filter({ hasText: 'Neo C10' }) });
	await expect(shared.locator('summary')).toContainText('2 targets');
	await shared.locator('summary').click();
	await expect(shared.getByText('Afentis Prime Barrel', { exact: true })).toBeVisible();
	await expect(shared.getByText(/Opening: Intact/)).not.toHaveCount(0);
	await expect(shared.getByText(/chance to receive this relic/)).toBeVisible();
	await page.getByRole('checkbox', { name: 'Listed mission drops only' }).check();
	await expect(
		page.locator('.focusRelic summary').filter({ hasText: 'No mission source listed' })
	).toHaveCount(0);
	await page.getByRole('checkbox', { name: 'Listed mission drops only' }).uncheck();
	// Save failure must leave owned quantities and the relic plan untouched.
	await page.route('**/api/tracker/*/component', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({ error: { message: 'Test farming save unavailable' } })
		})
	);
	const collectBarrel = page.getByRole('button', {
		name: 'Collect one Akstiletto Prime Barrel',
		exact: true
	});
	await collectBarrel.click();
	await expect(page.getByRole('status')).toContainText('Test farming save unavailable');
	const akNeeds = target('Akstiletto Prime').getByRole('list', {
		name: 'Missing components for Akstiletto Prime'
	});
	await expect(akNeeds.getByText('2 still needed · 0/2 owned', { exact: true })).not.toHaveCount(0);
	await page.unroute('**/api/tracker/*/component');
	await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Data refreshed.');
	await collectBarrel.click();
	await expect(akNeeds.getByText('1 still needed · 1/2 owned', { exact: true })).toBeVisible();
	await collectBarrel.click();
	await expect(collectBarrel).toHaveCount(0);
	// Removing a completed component from focus does not alter the actual recipe/status.
	for (const part of ['Barrel', 'Blade', 'Blueprint', 'Handle']) {
		const button = page.getByRole('button', {
			name: `Collect one Afentis Prime ${part}`,
			exact: true
		});
		await button.click();
		await expect(button).toHaveCount(0);
	}
	await expect(
		page
			.getByRole('region', { name: 'Components ready', exact: true })
			.getByRole('group', { name: 'Farming target: Afentis Prime', exact: true })
	).toBeVisible();
	await expect(target('Afentis Prime').getByLabel('Status for Afentis Prime')).toHaveValue(
		'missing'
	);
	await page.screenshot({ path: 'test-results/farm-focus-desktop.png', fullPage: true });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await target('Afentis Prime').getByLabel('Status for Afentis Prime').selectOption('building');
	await expect(
		page
			.getByRole('region', { name: 'In the Foundry', exact: true })
			.getByRole('group', { name: 'Farming target: Afentis Prime', exact: true })
	).toBeVisible();
	await target('Afentis Prime').getByLabel('Status for Afentis Prime').selectOption('owned');
	await expect(
		page
			.getByRole('region', { name: 'Ready to level', exact: true })
			.getByRole('group', { name: 'Farming target: Afentis Prime', exact: true })
	).toBeVisible();
	await target('Afentis Prime').getByLabel('Status for Afentis Prime').selectOption('mastered');
	await expect(target('Afentis Prime')).toHaveCount(0);
	await page
		.getByRole('button', { name: 'Remove priority from Caliban Prime', exact: true })
		.click();
	await expect(target('Caliban Prime')).toHaveCount(0);
	await expect(page.getByRole('status')).toHaveText('Saved.');
	await page.reload();
	await expect(page.getByRole('link', { name: 'Farm focus 1' })).toBeVisible();
	// A separate browser session reads the same stars/quantities, including on a narrow viewport.
	const mobile = await browser.newContext({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true
	});
	try {
		const mobilePage = await mobile.newPage();
		await signin(mobilePage, email);
		await mobilePage.goto(`${origin}/tracker?view=farm`);
		await expect(
			mobilePage.getByRole('group', { name: 'Farming target: Akstiletto Prime', exact: true })
		).toBeVisible();
		await expect(
			mobilePage.getByRole('button', { name: 'Collect one Akstiletto Prime Barrel', exact: true })
		).toHaveCount(0);
		await expect(mobilePage.getByRole('link', { name: 'Farm focus 1' })).toBeVisible();
		await mobilePage.screenshot({ path: 'test-results/farm-focus-mobile.png', fullPage: true });
		expect(
			await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
	} finally {
		await mobile.close();
	}
});

test('first-visit tour: failure fallback, account persistence, replay and account isolation', async ({
	page,
	browser
}) => {
	const tourAccounts: { id: string; email: string }[] = [];
	for (const suffix of ['a', 'b']) {
		const email = `tracker-tour-${suffix}-${randomUUID()}@example.invalid`;
		const { data, error } = await admin.auth.admin.createUser({
			email,
			password,
			email_confirm: true,
			user_metadata: { display_name: 'Tour test' }
		});
		if (error) throw Error('Could not create disposable tour test account.');
		const account = { id: data.user.id, email };
		users.push(account);
		tourAccounts.push(account);
	}
	await signin(page, tourAccounts[0].email);
	const tour = page.getByRole('dialog', { name: 'Tracker tour' });
	await expect(tour).toBeVisible();
	await page.route('**/api/account/tour', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({ error: { message: 'Unavailable' } })
		})
	);
	await tour.getByRole('button', { name: 'Skip tour', exact: true }).click();
	await expect(tour).not.toBeVisible();
	await expect(page.getByRole('alert')).toContainText(
		'Could not save this preference across devices'
	);
	await page.unroute('**/api/account/tour');
	await page.reload();
	await expect(page.getByRole('button', { name: 'Load equipment', exact: true })).toBeEnabled();
	await expect(tour).not.toBeVisible();
	await page.locator('header summary').filter({ hasText: 'Help' }).click();
	await page.getByRole('button', { name: 'Show tour again', exact: true }).click();
	await expect(tour.getByRole('heading', { name: 'Add your equipment' })).toBeVisible();
	await tour.getByRole('button', { name: 'Next', exact: true }).click();
	await tour.getByRole('button', { name: 'Next', exact: true }).click();
	const saved = page.waitForResponse(
		(r) => r.url().endsWith('/api/account/tour') && r.request().method() === 'POST'
	);
	await tour.getByRole('button', { name: 'Done', exact: true }).click();
	expect((await saved).status()).toBe(200);
	const { data: updated } = await admin.auth.admin.getUserById(tourAccounts[0].id);
	expect(updated.user?.user_metadata).toMatchObject({
		tracker_tour_version: 1,
		display_name: 'Tour test'
	});
	const otherDevice = await browser.newContext();
	try {
		const second = await otherDevice.newPage();
		await signin(second, tourAccounts[0].email);
		await expect(second.getByRole('button', { name: 'Load equipment', exact: true })).toBeEnabled();
		await expect(second.getByRole('dialog', { name: 'Tracker tour' })).not.toBeVisible();
	} finally {
		await otherDevice.close();
	}
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await signin(page, tourAccounts[1].email);
	await expect(tour).toBeVisible();
	const secondSave = page.waitForResponse(
		(r) => r.url().endsWith('/api/account/tour') && r.request().method() === 'POST'
	);
	await tour.getByRole('button', { name: 'Skip tour', exact: true }).click();
	await expect(tour).not.toBeVisible();
	expect((await secondSave).status()).toBe(200);
});

test('guest deployment: catalogue, focus and component progress need no account API', async ({
	page
}) => {
	await page.addInitScript(() => localStorage.setItem('tracker-tour-v1:guest', 'done'));
	const privateCalls: string[] = [];
	page.on('request', (request) => {
		if (/\/api\/(tracker|import|account)/.test(request.url())) privateCalls.push(request.url());
	});
	await page.goto('/catalogue?q=Akstiletto+Prime');
	await page.getByRole('button', { name: 'Add to tracker', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('guest tracker');
	await page.goto('/tracker');
	await expect(page.getByRole('complementary', { name: 'Guest mode' })).toBeVisible();
	await page.getByRole('button', { name: 'Prioritize Akstiletto Prime', exact: true }).click();
	await expect(page.getByRole('link', { name: 'Farm focus 1' })).toBeVisible();
	await page.getByRole('link', { name: 'Farm focus 1' }).click();
	await page
		.getByRole('button', { name: 'Collect one Akstiletto Prime Barrel', exact: true })
		.click();
	await expect(page.getByText('1 still needed · 1/2 owned', { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText('1 still needed · 1/2 owned', { exact: true })).toBeVisible();
	expect(privateCalls).toEqual([]);
});
