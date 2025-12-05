import { z } from 'zod'

const envSchema = z.object({
	VITE_API_ORIGIN: z.url().optional(),
	VITE_SERVER_PORT: z.coerce.number().int().positive(),
	VITE_PERF_TRACKING: z.coerce.boolean().optional().default(true)
})

const envData = envSchema.parse(import.meta.env)

export const env = {
	apiOrigin:
		envData.VITE_API_ORIGIN ?? `http://localhost:${envData.VITE_SERVER_PORT}`,
	perfTracking: envData.VITE_PERF_TRACKING
}

// Compile-time constant for tree-shaking - use this for perf tracking checks
export const PERF_TRACKING_ENABLED = env.perfTracking
