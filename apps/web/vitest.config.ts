import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
	plugins: [solidPlugin()],
	resolve: {
		// Use vdev condition to resolve vitest-browser-solid to source files
		conditions: ['vdev'],
		alias: {
			'~': path.resolve(__dirname, './src'),
		},
	},
	optimizeDeps: {
		// Don't pre-bundle vitest-browser-solid - let vite-plugin-solid handle it
		exclude: ['vitest-browser-solid'],
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					include: ['src/**/*.test.{ts,tsx}'],
					exclude: [
						'**/*.browser.test.{ts,tsx}',
						'**/node_modules/**',
					],
					name: 'unit',
					environment: 'jsdom',
					globals: true,
					setupFiles: ['./vitest.setup.ts'],
				},
			},
			{
				extends: true,
				test: {
					include: ['src/**/*.browser.test.{ts,tsx}'],
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
				inline: ['solid-js', 'vitest-browser-solid'],
			},
		},
	},
	define: {
		'import.meta.env.MODE': '"test"',
		'import.meta.env.DEV': 'false',
		'import.meta.env.VITE_API_ORIGIN': 'undefined',
		'import.meta.env.VITE_SERVER_PORT': '3001',
	},
})