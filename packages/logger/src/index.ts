import consola, { type ConsolaInstance } from 'consola'

const DEFAULT_LEVEL =
	typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
		? 3
		: 4

if (typeof consola.level === 'number') {
	consola.level = DEFAULT_LEVEL
}

export type LoggerScope =
	| 'server'
	| 'web'
	| 'desktop'
	| 'app'
	| (string & {})

const DEFAULT_SCOPE: LoggerScope = 'app'
const instances = new Map<string, ConsolaInstance>()

const buildTag = (scopes: readonly LoggerScope[]): string => {
	const normalized = scopes
		.map(scope => scope?.trim())
		.filter((scope): scope is string => Boolean(scope && scope.length))

	return (normalized.length ? normalized : [DEFAULT_SCOPE]).join(':')
}

export const createLogger = (...scopes: LoggerScope[]): ConsolaInstance => {
	const tag = buildTag(scopes)

	if (!instances.has(tag)) {
		instances.set(tag, consola.withTag(tag))
	}

	return instances.get(tag)!
}

export const createLoggerFactory = (
	...baseScopes: LoggerScope[]
): ((...scopes: LoggerScope[]) => ConsolaInstance) => {
	return (...scopes: LoggerScope[]) => createLogger(...baseScopes, ...scopes)
}

export const logger = createLogger()
export type Logger = ConsolaInstance
