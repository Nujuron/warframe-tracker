import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
	testDir: 'tests/browser',
	fullyParallel: true,
	use: { baseURL: 'http://127.0.0.1:5177', trace: 'retain-on-failure' },
	projects: [
		{
			name: 'desktop',
			use: { ...devices['Desktop Edge'], channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }
		},
		{
			name: 'mobile',
			use: {
				...devices['iPhone 13'],
				defaultBrowserType: 'chromium',
				channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge'
			}
		}
	],
	webServer: {
		command: 'node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 5177 --strictPort',
		url: 'http://127.0.0.1:5177',
		reuseExistingServer: !process.env.CI,
		timeout: 60000,
		env: { PUBLIC_SUPABASE_URL: '', PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }
	}
});
