import { consola, type ConsolaInstance } from './consola'
import { LOGGER_DEFINITIONS, type LoggerName } from './definitions'
import { createForwardingProxy } from './forwarding'
import { buildTag, type LoggerScope } from './tags'
import { ensureLoggerToggleState } from './toggles'

const instances = new Map<string, ConsolaInstance>()

const getLoggerInstance = (tag: string): ConsolaInstance => {
	ensureLoggerToggleState(tag)

	const existing = instances.get(tag)
	if (existing) return existing

	const raw = consola.withTag(tag)
	const proxied = createForwardingProxy(raw, tag, getLoggerInstance)
	instances.set(tag, proxied)
	return proxied
}

const createLogger = (...scopes: LoggerScope[]): ConsolaInstance => {
	const tag = buildTag(scopes)

	return getLoggerInstance(tag)
}

type Logger = ConsolaInstance

const instantiateScopedLoggers = (): Record<LoggerName, Logger> => {
	const keys = Object.keys(LOGGER_DEFINITIONS) as LoggerName[]

	return keys.reduce((acc, key) => {
		acc[key] = createLogger(...LOGGER_DEFINITIONS[key].scopes)
		return acc
	}, {} as Record<LoggerName, Logger>)
}

const scopedLoggers = instantiateScopedLoggers()

const loggers = Object.freeze(scopedLoggers) as Readonly<Record<LoggerName, Logger>>

type LoggerMap = typeof loggers
type LoggerKey = LoggerName

const getLogger = (key: LoggerKey): Logger => loggers[key]

const logger = loggers.app

export { createLogger, getLogger, loggers, logger }
export type { Logger, LoggerKey, LoggerMap }
