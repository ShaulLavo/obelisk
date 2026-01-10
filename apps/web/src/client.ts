import { treaty } from '@elysiajs/eden'
import type { App } from '../../server/src/index'
import { env } from '~/env'

const isBinaryResponse = (response: Response) => {
	const contentType = response.headers.get('Content-Type')
	if (!contentType) return false
	const normalized = contentType.split(';')[0]?.trim().toLowerCase()
	if (!normalized) return false
	if (normalized === 'application/octet-stream') return true
	return normalized.startsWith('font/')
}

export const client = treaty<App>(env.apiOrigin, {
	onResponse: async (response) => {
		if (!isBinaryResponse(response)) return null
		return response.arrayBuffer()
	},
})
