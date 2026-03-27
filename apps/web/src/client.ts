import { treaty } from '@elysiajs/eden'
import { env } from '~/env'

const isBinaryResponse = (response: Response) => {
	const contentType = response.headers.get('Content-Type')
	if (!contentType) return false
	const normalized = contentType.split(';')[0]?.trim().toLowerCase()
	if (!normalized) return false
	if (normalized === 'application/octet-stream') return true
	return normalized.startsWith('font/')
}

/**
 * Shape of the Eden treaty client for the Anubis API server.
 *
 * The full `App` type lives in `apps/server` and cannot be imported here
 * without pulling in Node.js dependencies that break the web build. This
 * lightweight interface describes the routes the web app actually uses so
 * the rest of the codebase gets type-safety without the coupling.
 *
 * TODO: Investigate bun version mismatch that causes elysia type incompatibility.
 */

interface EdenResponse<T> {
	data: T | null
	error: { value?: { message?: string } } | null
}

interface FontPreviewEndpoint {
	get(options?: { query?: { text?: string }; fetch?: { signal?: AbortSignal } }): Promise<EdenResponse<ArrayBuffer>>
}

interface FontByNameEndpoint {
	get(options?: { fetch?: { signal?: AbortSignal } }): Promise<EdenResponse<ArrayBuffer | string>>
	preview: FontPreviewEndpoint
}

interface FontBatchEndpoint {
	post(body: { names: string[] }): Promise<EdenResponse<Record<string, string>>>
}

interface FontsEndpoint {
	(params: { name: string }): FontByNameEndpoint
	get(): Promise<EdenResponse<Record<string, string>>>
	batch: FontBatchEndpoint
}

export interface ApiClient {
	fonts: FontsEndpoint
}

// Note: App type import removed to fix Docker build - server module has Node.js dependencies.
// The ApiClient interface above provides type-safety for the routes the web app uses.
const rawClient = treaty(env.apiOrigin, {
	onResponse: async (response) => {
		if (!isBinaryResponse(response)) return null
		return response.arrayBuffer()
	},
})

export const client = rawClient as unknown as ApiClient
