import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import devtools from 'solid-devtools/vite'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig(({ mode }) => {
	const appDir = path.resolve(__dirname)
	const repoRoot = path.resolve(appDir, '../..')

	const rootEnv = loadEnv(mode, repoRoot, '')
	const appEnv = loadEnv(mode, appDir, '')
	Object.assign(process.env, rootEnv, appEnv)

	const webPort = Number(process.env.VITE_WEB_PORT) || 3000
	return {
		envDir: appDir,
		plugins: [
			tailwindcss(),
			devtools({
				autoname: true,
			}),
			solidPlugin(),
		],
		resolve: {
			alias: {
				'~': path.resolve(__dirname, './src'),
				'@repo/theme': path.resolve(
					__dirname,
					'../../packages/theme/src/index.ts'
				),
			},
		},
		server: {
			port: webPort,
			headers: {
				'Cross-Origin-Opener-Policy': 'same-origin',
				'Cross-Origin-Embedder-Policy': 'require-corp',
			},
		},
		build: {
			target: 'esnext',
			modulePreload: {
				polyfill: false,
			},
		},
		optimizeDeps: {
			include: [
				'solid-devtools/setup',
				'web-tree-sitter',
				'js-base64',
				'@tree-sitter-grammars/tree-sitter-markdown',
			],
			exclude: [],
		},
		test: {
			projects: [
				{
					extends: true,
					test: {
						name: 'unit',
						environment: 'node',
						include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
						exclude: ['**/*.browser.test.*'],
					},
				},
				{
					extends: true,
					test: {
						name: 'browser',
						css: true,
						setupFiles: ['./src/setup-browser-tests.ts'],
						browser: {
							enabled: true,
							headless: true,
							provider: playwright(),
							instances: [{ browser: 'chromium' }],
						},
					},
				},
			],
		},
	}
})
