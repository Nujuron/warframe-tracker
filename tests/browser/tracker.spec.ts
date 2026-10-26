import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }, info) => {
	if (!info.title.includes('tour'))
		await page.addInitScript(() => localStorage.setItem('tracker-tour-v1:guest', 'done'));
});
test('empty onboarding and private routes', async ({ page }) => {
	await page.goto('/tracker');
	await expect(page.getByRole('heading', { name: 'Your list starts here.' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Load equipment', exact: true })).toBeEnabled();
	await expect(page.getByRole('button', { name: 'All equipment 0', exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Farm focus 0' }).click();
	await expect(page).toHaveURL(/view=farm/);
	await expect(page.getByRole('heading', { name: 'Choose your next targets.' })).toBeVisible();
	await page.getByRole('link', { name: 'My equipment', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Your list starts here.' })).toBeVisible();
	await page.goto('/account');
	await expect(page).toHaveURL(/login\?next=\/account/);
	await page.getByRole('link', { name: 'Create an account', exact: true }).click();
	await expect(page.getByLabel('Display name')).toBeVisible();
	await page.getByRole('link', { name: 'Forgot password?' }).click();
	await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
	await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
});
test('catalogue search, categories, pagination and read-only Prime details', async ({ page }) => {
	await page.goto('/catalogue');
	await expect(page.getByRole('heading', { name: 'Catalogue', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Next →' })).toBeVisible();
	await page.getByRole('searchbox', { name: 'Search catalogue' }).fill('Akstiletto Prime');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.getByText('1 results', { exact: true })).toBeVisible();
	await page.getByText('Relics & parts', { exact: false }).click();
	await expect(page.getByRole('heading', { name: /Barrel.*0\/2 owned/ })).toBeVisible();
	await expect(page.getByLabel('Own Akstiletto Prime Barrel, copy 1 of 2')).toBeDisabled();
	await page.getByText('About drops & data', { exact: true }).click();
	await expect(page.getByText('Opening chances are per relic', { exact: false })).toBeVisible();
	await page.getByRole('searchbox', { name: 'Search catalogue' }).fill('');
	await page.getByLabel('Catalogue category').selectOption('Companions');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.getByLabel('Catalogue category')).toHaveValue('Companions');
	await expect(page.locator('article')).not.toHaveCount(0);
	await page.screenshot({
		path: `test-results/catalogue-${test.info().project.name}.png`,
		fullPage: true
	});
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('first-visit tour supports keyboard dismissal, replay and completion', async ({ page }) => {
	await page.goto('/tracker');
	const tour = page.getByRole('dialog', { name: 'Tracker tour' });
	await expect(tour).toBeVisible();
	await expect(tour.getByRole('heading', { name: 'Add your equipment' })).toBeVisible();
	await tour.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(tour.getByRole('heading', { name: 'Choose what to farm' })).toBeVisible();
	await tour.getByRole('button', { name: 'Back', exact: true }).click();
	await expect(tour.getByRole('heading', { name: 'Add your equipment' })).toBeVisible();
	await page.screenshot({ path: `test-results/tour-${test.info().project.name}.png` });
	await page.keyboard.press('Escape');
	await expect(tour).not.toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Load equipment', exact: true })).toBeEnabled();
	await expect(tour).not.toBeVisible();
	await page.locator('header summary').filter({ hasText: 'Help' }).click();
	const helpBounds = await page.locator('header .menuPanel').boundingBox();
	expect(helpBounds!.x).toBeGreaterThanOrEqual(0);
	expect(helpBounds!.x + helpBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
	await page.getByRole('button', { name: 'Show tour again', exact: true }).click();
	await expect(tour).toBeVisible();
	await tour.getByRole('button', { name: 'Next', exact: true }).click();
	await tour.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(tour.getByRole('heading', { name: 'Track what you collect' })).toBeVisible();
	await tour.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(tour).not.toBeVisible();
	await page.getByRole('link', { name: 'Farm focus 0' }).click();
	await expect(page.getByRole('region', { name: 'Your mastery progress' })).toHaveCount(0);
	await expect(page.getByText('Make room for your next mastery.', { exact: true })).toHaveCount(0);
	await page.screenshot({
		path: `test-results/clean-tracker-${test.info().project.name}.png`,
		fullPage: true
	});
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('unauthenticated writes, failed setup and malicious callbacks are handled', async ({
	request
}) => {
	const write = await request.post('/api/tracker', {
		headers: { origin: 'http://127.0.0.1:5177' },
		data: { name: 'Atlas', category: 'Warframes' }
	});
	expect(write.status()).toBe(401);
	const bulk = await request.post('/api/tracker/00000000-0000-4000-8000-000000000001/components', {
		headers: { origin: 'http://127.0.0.1:5177' },
		data: { revision: 1 }
	});
	expect(bulk.status()).toBe(401);
	const csrf = await request.post('/api/tracker', {
		headers: { origin: 'https://evil.test' },
		data: { name: 'Atlas', category: 'Warframes' }
	});
	expect(csrf.status()).toBe(403);
	const callback = await request.get('/auth/callback?next=//evil.test', { maxRedirects: 0 });
	expect(callback.status()).toBe(303);
	expect(callback.headers().location).toContain('/login');
	const mcp = await request.post('/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
	expect(mcp.status()).toBe(503);
});
