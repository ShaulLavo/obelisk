import { z } from 'zod'

type EnvRecord = Record<string, string | undefined>

const getProcessEnv = (): EnvRecord => {
	if (typeof globalThis === 'undefined') return {}
	const maybeProcess = (globalThis as { process?: { env?: EnvRecord } }).process
	return maybeProcess?.env ?? {}
}

const getImportMetaEnv = (): EnvRecord => {
	try {
		return import.meta.env ?? {}
	} catch {
		return {}
	}
}

const parseLevel = (value: unknown): number | undefined => {
	if (typeof value === 'number') return value
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number.parseInt(value, 10)
		return Number.isNaN(parsed) ? undefined : parsed
	}
	return undefined
}

const envSchema = z.object({
	LOGGER_LEVEL: z
		.preprocess(parseLevel, z.number().int().min(0).max(5))
		.optional(),
	NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
	VITE_NODE_ENV: z.enum(['development', 'production', 'test']).optional()
})

const envData = envSchema.parse({
	...getImportMetaEnv(),
	...getProcessEnv()
})

const nodeEnv = envData.NODE_ENV ?? envData.VITE_NODE_ENV ?? 'development'

export const loggerEnv = {
	nodeEnv,
	isDev: nodeEnv === 'development',
	loggerLevel: envData.LOGGER_LEVEL
}

export type LoggerEnv = typeof loggerEnv
