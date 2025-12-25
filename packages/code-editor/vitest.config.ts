import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
	plugins: [solidPlugin()],
	optimizeDeps: {
		include: ['vitest-browser-solid'],
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
