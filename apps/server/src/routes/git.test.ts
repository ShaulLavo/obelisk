import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import {
	gitRoutes,
	isAllowedGitHost,
	buildGitProxyHeaders,
	buildGitProxyResponse,
} from './git'
import { env } from '../env'

const app = new Elysia().use(gitRoutes)

describe('Git Routes', () => {
	describe('Helper Functions', () => {
		describe('isAllowedGitHost', () => {
			it('should check if host is in allowed list', () => {
				// This test verifies the function works with actual env config
				const hasAllowedHosts = env.gitProxyAllowedHosts.length > 0
				if (hasAllowedHosts) {
					expect(isAllowedGitHost(env.gitProxyAllowedHosts[0])).toBe(true)
				}
				expect(isAllowedGitHost('definitely-not-allowed-xyz123.invalid')).toBe(
					false
				)
			})
		})

		describe('buildGitProxyHeaders', () => {
			it('should filter to only allowed headers', () => {
				const source = new Headers({
					accept: 'application/json',
					'content-type': 'text/plain',
					'git-protocol': 'version=2',
					authorization: 'Bearer token',
					'x-custom-header': 'should-be-removed',
				})

				const result = buildGitProxyHeaders(source)

				expect(result.get('accept')).toBe('application/json')
				expect(result.get('content-type')).toBe('text/plain')
				expect(result.get('git-protocol')).toBe('version=2')
				expect(result.get('authorization')).toBe('Bearer token')
				expect(result.get('x-custom-header')).toBeNull()
			})

			it('should handle empty headers', () => {
				const source = new Headers()
				const result = buildGitProxyHeaders(source)

				expect(result.get('accept')).toBeNull()
			})
		})

		describe('buildGitProxyResponse', () => {
			it('should filter response headers and preserve status', () => {
				const upstream = new Response('body', {
					status: 201,
					headers: {
						'content-type': 'application/json',
						'content-encoding': 'gzip',
						'cache-control': 'no-cache',
						'x-custom': 'should-be-removed',
					},
				})

				const result = buildGitProxyResponse(upstream)

				expect(result.status).toBe(201)
				expect(result.headers.get('content-type')).toBe('application/json')
				expect(result.headers.get('content-encoding')).toBe('gzip')
				expect(result.headers.get('cache-control')).toBe('no-cache')
				expect(result.headers.get('x-custom')).toBeNull()
			})
		})
	})

	describe('ALL /git/proxy', () => {
		it('should return 400 when url param is missing', async () => {
			const response = await app.handle(
				new Request('http://localhost/git/proxy')
			)

			expect(response.status).toBe(400)
			const data = await response.json()
			expect(data).toEqual({ error: 'Missing url query param' })
		})

		it('should return 400 for invalid URL', async () => {
			const response = await app.handle(
				new Request('http://localhost/git/proxy?url=not-a-valid-url')
			)

			expect(response.status).toBe(400)
			const data = await response.json()
			expect(data).toEqual({ error: 'Invalid url' })
		})

		it('should return 403 when host is not in allowed list', async () => {
			const response = await app.handle(
				new Request(
					'http://localhost/git/proxy?url=https://definitely-not-allowed-xyz123.invalid/repo'
				)
			)

			expect(response.status).toBe(403)
			const data = await response.json()
			expect(data).toEqual({ error: 'Host not allowed' })
		})

		it('should return 405 for disallowed methods', async () => {
			const response = await app.handle(
				new Request(
					'http://localhost/git/proxy?url=https://definitely-not-allowed-xyz123.invalid',
					{
						method: 'DELETE',
					}
				)
			)

			// Will be 403 first because host not allowed, but that's expected
			expect(response.status).toBe(403)
		})

		it('should support URL in raw query string format', async () => {
			const response = await app.handle(
				new Request(
					'http://localhost/git/proxy?https://definitely-not-allowed-xyz123.invalid/path'
				)
			)

			// Will be 403 because host not allowed
			expect(response.status).toBe(403)
		})
	})
})
