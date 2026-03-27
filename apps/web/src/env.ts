import { z } from 'zod'

const envSchema = z.object({
	VITE_API_ORIGIN: z.url().optional(),
	VITE_SERVER_PORT: z.coerce.number().int().positive().optional().default(3001),
	PROD_API_ORIGIN: z.url().optional(),
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
const devApiOrigin = `http://localhost:${envData.VITE_SERVER_PORT}`

export const env = {
	apiOrigin: envData.VITE_API_ORIGIN ?? (isProd ? envData.PROD_API_ORIGIN : devApiOrigin) ?? devApiOrigin,
	mode: envData.MODE,
	isDev: envData.DEV,
}

