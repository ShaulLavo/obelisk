import { Elysia, t } from 'elysia'
import { cors } from '@elysiajs/cors'
import { env } from './env'
import { serverLogger } from './logger'

const app = new Elysia()
	.use(
		cors({
			origin: env.webOrigin
		})
	)
	.get('/', () => 'Hi Elysia')
	.get('/id/:id', ({ params: { id } }) => id)
	.post('/mirror', ({ body }) => body, {
		body: t.Object({
			id: t.Number(),
			name: t.String()
		})
	})
	.listen(env.serverPort)

serverLogger.ready(
	`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
)

export type App = typeof app
