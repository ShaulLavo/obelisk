import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { staticPlugin } from '@elysiajs/static'
import { env } from './env'
import { routes } from './routes'

const app = new Elysia()
	.use(
		swagger({
			documentation: {
				info: {
					title: 'Vibe Server API',
					description: 'API documentation for Vibe development server',
					version: '1.0.0',
				},
				tags: [
					{ name: 'Fonts', description: 'Nerd Fonts proxy and preview' },
					{ name: 'Git', description: 'Git CORS proxy' },
				],
			},
		})
	)
	.use(staticPlugin())
	.use(
		cors({
			origin: env.webOrigin,
			methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
			allowedHeaders: ['authorization', 'content-type', 'git-protocol'],
			exposeHeaders: ['content-type', 'content-encoding', 'cache-control'],
			credentials: false,
			preflight: true,
		})
	)
	.use(routes)
	.listen(env.serverPort)

console.log(
	`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
)
console.log(`📚 Swagger docs at http://localhost:${env.serverPort}/swagger`)

export { app }
export type App = typeof app
