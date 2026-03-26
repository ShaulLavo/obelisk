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
// treaty<any> resolves to a union including a string literal, so cast to any for property access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const client: any = treaty<any>(env.apiOrigin, {
	onResponse: async (response) => {
		if (!isBinaryResponse(response)) return null
		return response.arrayBuffer()
	},
})
