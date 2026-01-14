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

// TODO: Investigate why bun version mismatch keeps happening - causes elysia type incompatibility
// Note: App type import removed to fix Docker build - server module has Node.js dependencies
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const client = treaty<any>(env.apiOrigin, {
	onResponse: async (response) => {
		if (!isBinaryResponse(response)) return null
		return response.arrayBuffer()
	},
})
