export type LoggerScope =
	| 'server'
	| 'web'
	| 'desktop'
	| 'app'
	| 'code-editor'
	| 'fs'
	| 'perf'
	| (string & {})

const DEFAULT_SCOPE: LoggerScope = 'app'

const buildTag = (scopes: readonly LoggerScope[]): string => {
	const normalized = scopes
		.map(scope => scope?.trim())
		.filter((scope): scope is string => Boolean(scope && scope.length))

	return (normalized.length ? normalized : [DEFAULT_SCOPE]).join(':')
}

export { DEFAULT_SCOPE, buildTag }
