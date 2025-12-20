import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
	plugins: [solidPlugin()],
	test: {
		projects: [
			{
				extends: true, // inherit root config including plugins
				test: {
					include: ['src/**/*.test.ts'],
					exclude: ['**/*.browser.test.ts', '**/node_modules/**'],
					name: 'unit',
					environment: 'node',
				},
			},
			{
				extends: true, // inherit root config including plugins
				test: {
					include: ['src/**/*.browser.test.{ts,tsx}'],
					exclude: ['**/node_modules/**'],
					name: 'browser',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium' }],
					},
				},
			},
		],
		server: {
			deps: {
				inline: ['@repo/logger', 'solid-js'],
			},
		},
	},
})
