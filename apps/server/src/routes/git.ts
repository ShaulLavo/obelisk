import { Elysia } from 'elysia'
import { env } from '../env'

const isAllowedGitHost = (host: string) => {
	if (env.gitProxyAllowedHosts.length === 0) return false
	return env.gitProxyAllowedHosts.some(
		(allowed) => host === allowed || host.endsWith(`.${allowed}`)
	)
}

const buildGitProxyHeaders = (source: Headers) => {
	const headers = new Headers()
	const allowed = ['accept', 'content-type', 'git-protocol', 'authorization']
	for (const name of allowed) {
		const value = source.get(name)
		if (value) headers.set(name, value)
	}
	return headers
}

const buildGitProxyResponse = (upstream: Response) => {
	const headers = new Headers()
	const allowed = ['content-type', 'content-encoding', 'cache-control']
	for (const name of allowed) {
		const value = upstream.headers.get(name)
		if (value) headers.set(name, value)
	}
	return new Response(upstream.body, {
		status: upstream.status,
		headers,
	})
}

export const gitRoutes = new Elysia({ prefix: '/git' }).all(
	'/proxy',
	async ({ request, set }) => {
		const requestUrl = new URL(request.url)
		const urlParam = requestUrl.searchParams.get('url')
		const rawSearch = requestUrl.search
		const proxiedUrl =
			urlParam ??
			(rawSearch && rawSearch.startsWith('?') && !rawSearch.startsWith('?url=')
				? decodeURIComponent(rawSearch.slice(1))
				: undefined)
		if (!proxiedUrl) {
			set.status = 400
			return 'Missing url query param'
		}

		let target: URL
		try {
			target = new URL(proxiedUrl)
		} catch {
			set.status = 400
			return 'Invalid url'
		}

		if (!isAllowedGitHost(target.host)) {
			set.status = 403
			return 'Host not allowed'
		}

		const method = request.method.toUpperCase()
		const allowedMethods = ['GET', 'POST', 'HEAD']
		if (!allowedMethods.includes(method)) {
			set.status = 405
			return 'Method not allowed'
		}

		console.log(
			'[git-proxy] request',
			JSON.stringify({ method, url: target.toString() }, null, 2)
		)

		const upstream = await fetch(target.toString(), {
			method,
			headers: buildGitProxyHeaders(request.headers),
			body:
				method === 'GET' || method === 'HEAD'
					? undefined
					: (request.body ?? undefined),
		})
		console.log(
			'[git-proxy] response',
			JSON.stringify(
				{ status: upstream.status, url: target.toString() },
				null,
				2
			)
		)

		return buildGitProxyResponse(upstream)
	},
	{
		detail: {
			summary: 'Git CORS proxy',
			description:
				'Proxies Git HTTP requests to bypass CORS restrictions. Only allows configured hosts.',
			tags: ['Git'],
		},
	}
)

export { isAllowedGitHost, buildGitProxyHeaders, buildGitProxyResponse }
