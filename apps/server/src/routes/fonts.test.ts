import { describe, expect, it, beforeAll } from 'bun:test'
import { Elysia } from 'elysia'
import { fontsRoutes } from './fonts'

const app = new Elysia().use(fontsRoutes)

describe('Fonts Routes', () => {
	describe('GET /fonts', () => {
		it('should return a list of font links', async () => {
			const response = await app.handle(new Request('http://localhost/fonts'))

			expect(response.status).toBe(200)

			const data = await response.json()
			expect(typeof data).toBe('object')
			const keys = Object.keys(data)
			expect(keys.length).toBeGreaterThan(0)
		})
	})

	describe('GET /fonts/:name', () => {
		it('should return 404 for non-existent font', async () => {
			const response = await app.handle(
				new Request('http://localhost/fonts/NonExistentFontXYZ123')
			)

			expect(response.status).toBe(404)
			const text = await response.text()
			expect(text).toBe('Font not found')
		})

		// Note: Testing actual font download would require network access
		// and could be slow. Consider mocking getNerdFontLinks/getExtractedFont
		// for faster unit tests.
	})

	describe('GET /fonts/:name/preview', () => {
		it('should return 404 for non-existent font preview', async () => {
			const response = await app.handle(
				new Request('http://localhost/fonts/NonExistentFontXYZ123/preview')
			)

			expect(response.status).toBe(404)
			const text = await response.text()
			expect(text).toBe('Font not found')
		})

		it('should accept custom preview text query param', async () => {
			const response = await app.handle(
				new Request(
					'http://localhost/fonts/NonExistentFontXYZ123/preview?text=ABC'
				)
			)

			// Still 404 because font doesn't exist, but request was valid
			expect(response.status).toBe(404)
		})
	})

	describe('POST /fonts/batch', () => {
		it('should return 422 when body is invalid', async () => {
			const response = await app.handle(
				new Request('http://localhost/fonts/batch', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({}),
				})
			)
			expect(response.status).toBe(422)
		})

		it('should return 422 when names array is empty', async () => {
			const response = await app.handle(
				new Request('http://localhost/fonts/batch', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ names: [] }),
				})
			)
			expect(response.status).toBe(422)
		})
	})
})
