import fs from 'node:fs'
import path from 'node:path'
import { parse as parseEnvFile } from 'dotenv'
import { z } from 'zod'

const envMode = process.env.NODE_ENV ?? 'development'
const envFiles = [
	{ name: 'vite.env', allowOverride: false },
	{ name: 'vite.env.local', allowOverride: true },
	{ name: `vite.env.${envMode}`, allowOverride: true },
	{ name: `vite.env.${envMode}.local`, allowOverride: true },
]

// Determine directories to look for env files
// This file is executing from apps/web/vite-env.ts
const appDir = __dirname
const repoRoot = path.resolve(appDir, '../..')

const envDirectories = [
	{ dir: repoRoot, allowDirOverride: false },
	{ dir: appDir, allowDirOverride: true },
]

const originalEnvKeys = new Set(Object.keys(process.env))

const applyEnvFile = (filePath: string, shouldOverride: boolean) => {
	if (!fs.existsSync(filePath)) return
	const parsed = parseEnvFile(fs.readFileSync(filePath))
	for (const [key, value] of Object.entries(parsed)) {
		const hasKey = Object.prototype.hasOwnProperty.call(process.env, key)
		if (!hasKey) {
			process.env[key] = value
			continue
		}
		if (shouldOverride && !originalEnvKeys.has(key)) {
			process.env[key] = value
		}
	}
}

for (const { dir, allowDirOverride } of envDirectories) {
	for (const { name, allowOverride } of envFiles) {
		const filePath = path.join(dir, name)
		const shouldOverride = allowOverride || allowDirOverride
		applyEnvFile(filePath, shouldOverride)
	}
}

const envSchema = z.object({
	VITE_WEB_PORT: z.coerce.number().int().positive().default(3000),
	VITE_SERVER_PORT: z.coerce.number().int().positive().default(3001),
	NODE_ENV: z
		.enum(['development', 'production', 'test'])
		.default('development'),
})

let envData: z.infer<typeof envSchema>
try {
	envData = envSchema.parse(process.env)
} catch (error) {
	if (error instanceof z.ZodError) {
		throw new Error(`Invalid environment variables:\n${z.prettifyError(error)}`)
	}
	throw error
}

export const env = envData
