import { defineConfig, devices } from '@playwright/test';
process.loadEnvFile('.env');
if (process.env.PUBLIC_SUPABASE_URL !== 'https://ipncpeqkycjoxlthkdmv.supabase.co')
	throw Error('Live acceptance checks are restricted to the tracker project.');
const remote = process.env.TRACKER_LIVE_BASE_URL;
if (remote && remote !== 'https://warframe-tracker-sepia.vercel.app')
	throw Error('Use the verified tracker production domain for deployed checks.');
export default defineConfig({
	testDir: 'tests/live',
	outputDir: 'test-results/live',
	workers: 1,
	timeout: 120000,
	use: {
		...devices['Desktop Edge'],
		channel: 'msedge',
		baseURL: remote || 'http://127.0.0.1:5178',
		trace: 'off'
	},
	webServer: remote
		? undefined
		: {
				command: 'node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 5178 --strictPort',
				url: 'http://127.0.0.1:5178',
				reuseExistingServer: false,
				timeout: 60000,
				env: { PUBLIC_SITE_URL: 'http://127.0.0.1:5178' }
			}
});
