import { z } from 'zod'

const envSchema = z.object({
	VITE_API_ORIGIN: z.url().optional(),
	VITE_SERVER_PORT: z.coerce.number().int().positive().optional().default(3001),
	MODE: z.string(),
	DEV: z.boolean(),
})

let envData: z.infer<typeof envSchema>
try {
	envData = envSchema.parse(import.meta.env)
} catch (error) {
	throw new Error(z.prettifyError(error as z.ZodError))
}

const isProd = envData.MODE === 'production' || !envData.DEV
const PROD_API_ORIGIN = 'https://api.anubis.my'
const DEV_API_ORIGIN = `http://localhost:${envData.VITE_SERVER_PORT}`

export const env = {
	apiOrigin: envData.VITE_API_ORIGIN ?? (isProd ? PROD_API_ORIGIN : DEV_API_ORIGIN),
	mode: envData.MODE,
	isDev: envData.DEV,
}

export const IS_DEV = env.isDev
export const BUILD_MODE = env.mode
