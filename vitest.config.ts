import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			'$env/dynamic/public': fileURLToPath(new URL('./tests/public-env.ts', import.meta.url))
		}
	},
	test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 }
});
