import { Elysia, t } from 'elysia'
import {
	getBatchFonts,
	getExtractedFont,
	getNerdFontLinks,
	getPreviewSubset,
} from '../fonts'

export const fontsRoutes = new Elysia({ prefix: '/fonts' })
	.get(
		'/',
		async () => {
			const links = await getNerdFontLinks()
			return links
		},
		{
			detail: {
				summary: 'List all Nerd Fonts',
				description: 'Returns a map of font names to their download URLs',
				tags: ['Fonts'],
			},
		}
	)
	.get(
		'/:name/preview',
		async ({ params: { name }, query, set }) => {
			const text = query.text || 'The quick brown fox jumps 0123'
			const subset = await getPreviewSubset(name, text)

			if (!subset) {
				set.status = 404
				return { error: 'Font not found' }
			}

			return new Response(new Uint8Array(subset), {
				headers: {
					'Content-Type': 'font/woff2',
					'Cache-Control': 'public, max-age=86400', // 24h cache
				},
			})
		},
		{
			query: t.Object({
				text: t.Optional(t.String()),
			}),
			detail: {
				summary: 'Get font preview subset',
				description:
					'Returns a lightweight WOFF2 subset containing only the preview characters',
				tags: ['Fonts'],
			},
		}
	)
	.get(
		'/:name',
		async ({ params: { name }, set }) => {
			const font = await getExtractedFont(name)
			if (!font) {
				set.status = 404
				return { error: 'Font not found' }
			}
			return new Response(font, {
				headers: {
					'Content-Type': 'font/ttf',
					'Cache-Control': 'public, max-age=31536000, immutable',
				},
			})
		},
		{
			detail: {
				summary: 'Download font',
				description: 'Downloads and caches the full Nerd Font TTF file',
				tags: ['Fonts'],
			},
		}
	)
	.post(
		'/batch',
		async ({ body }) => {
			const results = await getBatchFonts(body.names)

			// Return JSON with base64-encoded fonts for easy client handling
			const encoded = Object.fromEntries(
				Object.entries(results).map(([name, data]) => [
					name,
					data ? Buffer.from(data as ArrayBuffer).toString('base64') : null,
				])
			)
			return encoded
		},

		{
			body: t.Object({
				names: t.Array(t.String(), { minItems: 1, maxItems: 20 }),
			}),
			detail: {
				summary: 'Batch download fonts',
				description:
					'Download multiple fonts at once. Returns base64-encoded font data.',
				tags: ['Fonts'],
			},
		}
	)
