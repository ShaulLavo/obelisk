import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import devtools from 'solid-devtools/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
	const appDir = path.resolve(__dirname)
	const repoRoot = path.resolve(appDir, '../..')

	const rootEnv = loadEnv(mode, repoRoot, '')
	const appEnv = loadEnv(mode, appDir, '')
	Object.assign(process.env, rootEnv, appEnv)

	const webPort = Number(process.env.VITE_WEB_PORT) || 3000
	return {
		envDir: repoRoot,
		plugins: [tailwindcss(), devtools(), solidPlugin()],
		resolve: {
			alias: {
				'~': path.resolve(__dirname, './src'),
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
			exclude: [],
		},
	}
})
