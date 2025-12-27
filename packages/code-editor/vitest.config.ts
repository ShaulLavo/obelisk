import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
	plugins: [solidPlugin()],
	publicDir: '../../apps/web/public',
	resolve: {
		// Use vdev condition to resolve vitest-browser-solid to source files
		conditions: ['vdev'],
	},
	optimizeDeps: {
		// Don't pre-bundle vitest-browser-solid - let vite-plugin-solid handle it
		exclude: ['vitest-browser-solid'],
		include: ['@repo/logger'],
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					include: ['src/**/*.test.ts'],
					exclude: [
						'**/*.browser.test.ts',
						'**/*.browser.bench.tsx',
						'**/node_modules/**',
					],
					name: 'unit',
					environment: 'node',
				},
			},
			{
				extends: true,
				test: {
					include: [
						'src/**/*.browser.test.{ts,tsx}',
						'src/**/*.browser.bench.tsx',
					],
					exclude: ['**/node_modules/**'],
					name: 'browser',
					browser: {
						enabled: true,
						headless: true,
						provider: playwright(),
						instances: [{ browser: 'chromium' }],
					},
				},
			},
		],
		server: {
			deps: {
				inline: ['@repo/logger', 'solid-js', 'vitest-browser-solid'],
			},
		},
	},
})
