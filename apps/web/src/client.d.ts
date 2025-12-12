export declare const client: {
	get: (
		options?:
			| {
					headers?: Record<string, unknown> | undefined
					query?: Record<string, unknown> | undefined
					fetch?: RequestInit | undefined
			  }
			| undefined
	) => Promise<
		import('@elysiajs/eden').Treaty.TreatyResponse<{
			200: string
		}>
	>
	id: ((params: { id: string | number }) => {
		get: (
			options?:
				| {
						headers?: Record<string, unknown> | undefined
						query?: Record<string, unknown> | undefined
						fetch?: RequestInit | undefined
				  }
				| undefined
		) => Promise<
			import('@elysiajs/eden').Treaty.TreatyResponse<{
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
			}>
		>
	}) & {}
	mirror: {
		post: (
			body: {
				id: number
				name: string
			},
			options?:
				| {
						headers?: Record<string, unknown> | undefined
						query?: Record<string, unknown> | undefined
						fetch?: RequestInit | undefined
				  }
				| undefined
		) => Promise<
			import('@elysiajs/eden').Treaty.TreatyResponse<{
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
			}>
		>
	}
}
//# sourceMappingURL=client.d.ts.map
