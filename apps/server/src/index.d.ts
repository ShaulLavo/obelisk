import { Elysia } from 'elysia'
declare const app: Elysia<
	'',
	{
		decorator: {}
		store: {}
		derive: {}
		resolve: {}
	},
	{
		typebox: {}
		error: {}
	} & {
		typebox: {}
		error: {}
	},
	{
		schema: {}
		standaloneSchema: {}
		macro: {}
		macroFn: {}
		parser: {}
		response: {}
	} & {
		schema: {}
		standaloneSchema: {}
		macro: {}
		macroFn: {}
		parser: {}
		response: {}
	},
	{
		get: {
			body: unknown
			params: {}
			query: unknown
			headers: unknown
			response: {
				200: string
			}
		}
	} & {
		id: {
			':id': {
				get: {
					body: unknown
					params: {
						id: string
					} & {}
					query: unknown
					headers: unknown
					response: {
						200: string
						422: {
							type: 'validation'
							on: string
							summary?: string
							message?: string
							found?: unknown
							property?: string
							expected?: string
						}
					}
				}
			}
		}
	} & {
		mirror: {
			post: {
				body: {
					id: number
					name: string
				}
				params: {}
				query: unknown
				headers: unknown
				response: {
					200: {
						id: number
						name: string
					}
					422: {
						type: 'validation'
						on: string
						summary?: string
						message?: string
						found?: unknown
						property?: string
						expected?: string
					}
				}
			}
		}
	},
	{
		derive: {}
		resolve: {}
		schema: {}
		standaloneSchema: {}
		response: {}
	},
	{
		derive: {}
		resolve: {}
		schema: {}
		standaloneSchema: {}
		response: {}
	} & {
		derive: {}
		resolve: {}
		schema: {}
		standaloneSchema: {}
		response: {}
	}
>
export type App = typeof app
export {}
//# sourceMappingURL=index.d.ts.map
