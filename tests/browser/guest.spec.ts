import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('tracker-tour-v1:guest', 'done'));
});

test('effort sorting counts missing copies, ignores priority until ties, and updates in both views', async ({
	page
}) => {
	await page.goto('/tracker');
	await page.getByRole('button', { name: 'Load equipment', exact: true }).click();
	await page.getByLabel('Equipment list to import').fill(
		JSON.stringify([
			{
				name: 'Akstiletto Prime',
				category: 'Secondary weapons',
				priority: true,
				parts: { 'Akstiletto Prime Blueprint': 1, 'Akstiletto Prime Link': 1 }
			},
			{
				name: 'Baza Prime',
				category: 'Primary weapons',
				priority: true,
				parts: { 'Baza Prime Blueprint': 1, 'Baza Prime Barrel': 1, 'Baza Prime Receiver': 1 }
			},
			{ name: 'My custom frame', category: 'Warframes', priority: true }
		])
	);
	await page.getByRole('button', { name: 'Preview import', exact: true }).click();
	await page.getByRole('button', { name: 'Apply import', exact: true }).click();
	await expect(page.locator('article.equipment')).toHaveCount(3);
	await page.getByLabel('Sort equipment').selectOption('effort');
	await expect(page.locator('article.equipment .itemName')).toHaveText([
		'Baza Prime',
		'Akstiletto Prime',
		'My custom frame'
	]);
	await expect(page.locator('article.equipment .effortCount')).toHaveText([
		'1 part missing',
		'4 parts missing',
		'No component data'
	]);
	await page.getByLabel('Filter progress').selectOption('priority');
	await page.getByRole('searchbox', { name: 'Search equipment or notes' }).fill('Baza');
	await expect(page.locator('article.equipment')).toHaveCount(1);
	await page.getByRole('searchbox', { name: 'Search equipment or notes' }).fill('');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({
		path: `test-results/effort-equipment-${test.info().project.name}.png`,
		fullPage: true
	});
	await page.getByRole('link', { name: 'Farm focus 3', exact: true }).click();
	await page.getByLabel('Sort equipment').selectOption('effort');
	await expect(page.locator('article.equipment .itemName')).toHaveText([
		'Baza Prime',
		'Akstiletto Prime',
		'My custom frame'
	]);
	await page.getByLabel('Collect one Baza Prime Stock', { exact: true }).click();
	await expect(
		page.getByRole('region', { name: 'Components ready', exact: true }).locator('.itemName')
	).toHaveText('Baza Prime');
	await expect(page.locator('article.equipment .effortCount')).toHaveText([
		'4 parts missing',
		'No component data',
		'Parts ready'
	]);
	await page.getByLabel('Sort equipment').selectOption('name');
	await expect(page.locator('article.equipment .effortCount')).toHaveCount(0);
	await page.getByLabel('Sort equipment').selectOption('effort');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({
		path: `test-results/effort-farm-${test.info().project.name}.png`,
		fullPage: true
	});
});

test('guest catalogue additions, components, focus and notes persist without personal API calls', async ({
	page
}) => {
	const personalRequests: string[] = [];
	page.on('request', (request) => {
		if (/\/api\/(tracker|import)/.test(request.url())) personalRequests.push(request.url());
	});
	await page.goto('/catalogue?q=Akstiletto+Prime');
	await page.getByRole('button', { name: 'Add to tracker', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('guest tracker on this browser');
	await page.getByRole('button', { name: 'Add to tracker', exact: true }).click();
	await page.goto('/tracker');
	await expect(page.getByRole('complementary', { name: 'Guest mode' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'All equipment 1', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Prioritize Akstiletto Prime', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Remove priority from Akstiletto Prime', exact: true })
	).toBeVisible();
	await page.getByRole('button', { name: 'Add note', exact: true }).click();
	await page.getByLabel('Notes for Akstiletto Prime').fill('Guest farming note');
	await page.getByLabel('Notes for Akstiletto Prime').press('Tab');
	await expect(page.getByRole('status')).toContainText('Saved.');
	await page.getByText('Relics & parts', { exact: false }).click();
	await page.getByLabel('Own Akstiletto Prime Barrel, copy 2 of 2').click();
	await expect(page.getByLabel('Own Akstiletto Prime Barrel, copy 1 of 2')).toBeChecked();
	await page.reload();
	await page.getByRole('button', { name: 'Edit note', exact: true }).click();
	await expect(page.getByLabel('Notes for Akstiletto Prime')).toHaveValue('Guest farming note');
	await page.getByRole('link', { name: 'Farm focus 1', exact: true }).click();
	await expect(page.getByText('Akstiletto Prime', { exact: true }).first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Relic plan', exact: true })).toBeVisible();
	expect(
		await page.evaluate(
			() =>
				JSON.parse(localStorage.getItem('warframe-tracker:guest:v1')!).items[0].parts[
					'Akstiletto Prime Barrel'
				]
		)
	).toBe(2);
	expect(personalRequests).toEqual([]);
});

test('guest imports preview, deduplicate and preserve progress across browser reloads', async ({
	page
}) => {
	await page.goto('/tracker');
	await page.getByRole('button', { name: 'Load equipment', exact: true }).click();
	await page
		.getByLabel('Equipment list to import')
		.fill('## Warframes\n- [ ] Atlas\n- [x] Citrine Prime\n- [ ] Atlas\n- [ ] My custom frame');
	await page.getByRole('button', { name: 'Preview import', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Review 3 equipment entries' })).toBeVisible();
	await expect(page.getByText('1 duplicate entries were removed', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'Apply import', exact: true }).click();
	await expect(
		page.getByText('Imported 3 new entries; 0 updated; 0 existing entries preserved.', {
			exact: true
		})
	).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'All equipment 3', exact: true })).toBeVisible();
	await page.getByLabel('Filter progress').selectOption('all');
	await expect(page.getByLabel('Status for Citrine Prime')).toHaveValue('mastered');
	await expect(page.getByText('My custom frame', { exact: true })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('failed browser saves stay visible and do not change stored progress', async ({ page }) => {
	await page.goto('/catalogue?q=Atlas');
	const atlas = page.locator('article').filter({ has: page.getByText('Atlas', { exact: true }) });
	await atlas.getByRole('button', { name: 'Add to tracker', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('guest tracker');
	await page.goto('/tracker');
	await page.evaluate(() => {
		Storage.prototype.setItem = () => {
			throw new DOMException('Storage full', 'QuotaExceededError');
		};
	});
	await page.getByLabel('Status for Atlas').selectOption('owned');
	await expect(page.getByRole('status')).toContainText('could not be saved');
	await expect(page.getByLabel('Status for Atlas')).toHaveValue('missing');
	expect(
		await page.evaluate(
			() => JSON.parse(localStorage.getItem('warframe-tracker:guest:v1')!).items[0].status
		)
	).toBe('missing');
});
