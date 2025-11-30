import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import devtools from 'solid-devtools/vite'
import tailwindcss from '@tailwindcss/vite'

const originalEnvKeys = new Set(Object.keys(process.env))
const managedEnvKeys = new Set<string>()

const resetManagedEnv = () => {
	for (const key of managedEnvKeys) {
		delete process.env[key]
	}
	managedEnvKeys.clear()
}

const mergeEnvIntoProcess = (
	source: Record<string, string>,
	{ override }: { override: boolean }
) => {
	for (const [key, value] of Object.entries(source)) {
		if (!key.startsWith('VITE_')) continue
		const hasKey = Object.prototype.hasOwnProperty.call(process.env, key)
		if (!hasKey || (override && !originalEnvKeys.has(key))) {
			process.env[key] = value
			managedEnvKeys.add(key)
		}
	}
}

export default defineConfig(({ mode }) => {
	resetManagedEnv()
	const envDir = path.resolve(__dirname)
	const rootEnvDir = path.resolve(__dirname, '..', '..')
	const rootEnv = loadEnv(mode, rootEnvDir, '')
	mergeEnvIntoProcess(rootEnv, { override: false })
	const localEnv = loadEnv(mode, envDir, '')
	mergeEnvIntoProcess(localEnv, { override: true })
	const mergedEnv = { ...rootEnv, ...localEnv }
	const webPort = Number(mergedEnv.VITE_WEB_PORT ?? mergedEnv.PORT) || 3000
	return {
		envDir,
		plugins: [tailwindcss(), devtools(), solidPlugin()],
		resolve: {
			alias: {
				'~': path.resolve(__dirname, './src')
			}
		},
		server: {
			port: webPort,
			headers: {
				'Cross-Origin-Opener-Policy': 'same-origin',
				'Cross-Origin-Embedder-Policy': 'require-corp'
			}
		},
		build: {
			target: 'esnext',
			modulePreload: {
				polyfill: false
			}
		},
		optimizeDeps: {
			exclude: []
		}
	}
})
