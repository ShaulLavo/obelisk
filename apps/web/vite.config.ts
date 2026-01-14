import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import devtools from 'solid-devtools/vite'
import { devtools as tanstackDevtools } from '@tanstack/devtools-vite'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'
import { build } from 'vite'
import { env } from './vite-env'

/**
 * Plugin to build the service worker as a separate bundle
 */
function serviceWorkerPlugin(): Plugin {
	return {
		name: 'service-worker',
		apply: 'build',
		async writeBundle() {
			await build({
				configFile: false,
				build: {
					emptyOutDir: false,
					lib: {
						entry: path.resolve(__dirname, 'src/sw.ts'),
						formats: ['es'],
						fileName: () => 'sw.js',
					},
					outDir: path.resolve(__dirname, 'dist'),
					rollupOptions: {
						output: {
							entryFileNames: 'sw.js',
						},
					},
				},
			})
		},
	}
}

/**
 * Plugin to serve the service worker in dev mode
 */
function serviceWorkerDevPlugin(): Plugin {
	return {
		name: 'service-worker-dev',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				if (req.url === '/sw.js') {
					const result = await server.transformRequest('/src/sw.ts')
					if (result) {
						res.setHeader('Content-Type', 'application/javascript')
						res.end(result.code)
						return
					}
				}
				next()
			})
		},
	}
}

export default defineConfig(({ mode }) => {
	const webPort = env.VITE_WEB_PORT
	const isProd = mode === 'production'

	return {
		// Point envDir to a directory that contains no .env files to prevent Vite
		// from trying to load them again (which causes crashes in dotenv-expand).
		// We already loaded and validated them in vite-env.ts.
		envDir: path.resolve(__dirname, 'src/shims'),
		plugins: [
			// Only include devtools in development - they cause issues in Docker builds
			...(!isProd
				? [
						tanstackDevtools({
							eventBusConfig: {
								port: 4206,
								debug: false,
							},
							removeDevtoolsOnBuild: true,
							enhancedLogs: { enabled: false },
						}),
						devtools({
							autoname: true,
						}),
					]
				: []),
			tailwindcss(),
			solidPlugin(),
			// Disable service worker plugins temporarily for debugging Docker build
			// serviceWorkerPlugin(),
			// serviceWorkerDevPlugin(),
		],
		resolve: {
			alias: [
				{
					find: /^isomorphic-git$/,
					// Use require.resolve to find the package in hoisted or local node_modules
					replacement: (() => {
						try {
							return require.resolve('isomorphic-git')
						} catch {
							return path.resolve(__dirname, './node_modules/isomorphic-git/index.js')
						}
					})(),
				},
				{
					find: 'node:zlib',
					replacement: path.resolve(__dirname, './src/shims/zlib.ts'),
				},
				{
					find: /^zlib$/,
					replacement: path.resolve(__dirname, './src/shims/zlib.ts'),
				},
				{ find: '~', replacement: path.resolve(__dirname, './src') },
				{
					find: '@repo/theme',
					replacement: path.resolve(
						__dirname,
						'../../packages/theme/src/index.ts'
					),
				},
				// Handle @repo/ui .ts files explicitly before the catch-all .tsx pattern
				{
					find: '@repo/ui/utils',
					replacement: path.resolve(
						__dirname,
						'../../packages/ui/src/utils.ts'
					),
				},
				{
					find: '@repo/ui/anchor',
					replacement: path.resolve(
						__dirname,
						'../../packages/ui/src/anchor.ts'
					),
				},
				{
					find: '@repo/ui/settings',
					replacement: path.resolve(
						__dirname,
						'../../packages/ui/src/settings/index.ts'
					),
				},
				{
					find: /^@repo\/ui\/(.+)$/,
					replacement: path.resolve(
						__dirname,
						'../../packages/ui/src/$1.tsx'
					),
				},
				{
					find: /^@repo\/icons\/([a-z]+)\/(.+)$/,
					replacement: path.resolve(
						__dirname,
						'../../packages/icons/dist/$1/$2.js'
					),
				},
				{
					find: /^@repo\/icons\/([a-z]+)$/,
					replacement: path.resolve(
						__dirname,
						'../../packages/icons/dist/$1/index.js'
					),
				},
			],
			dedupe: ['@solidjs/router', 'solid-js'],
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
				'web-tree-sitter',
				'js-base64',
				'@tree-sitter-grammars/tree-sitter-markdown',
				'minimatch',
			],
			// Exclude packages used in workers - Vite's pre-bundling breaks worker imports
			// See: https://github.com/vitejs/vite/issues/20859
			exclude: ['up-fetch'],
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
