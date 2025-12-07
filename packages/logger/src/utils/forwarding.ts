import type { ConsolaInstance } from './consola'
import { isLoggerEnabled } from './toggles'

type LoggerFactory = (tag: string) => ConsolaInstance

const FORWARDED_METHODS = new Set([
	'trace',
	'debug',
	'info',
	'log',
	'success',
	'warn',
	'error',
	'fatal',
	'ready',
	'start',
	'box'
])

type LogForwarderEntry = {
	tag: string
	level: string
	args: unknown[]
}

type LogForwarder = (entry: LogForwarderEntry) => void

let logForwarder: LogForwarder | undefined

const createForwardingProxy = (
	instance: ConsolaInstance,
	tag: string,
	createOrGetLogger: LoggerFactory
): ConsolaInstance => {
	return new Proxy(instance, {
		get(target, prop, receiver) {
			if (prop === 'withTag') {
				return (childTag: unknown) => {
					if (typeof childTag !== 'string') {
						throw new Error(
							`logger.withTag expects a string, received "${typeof childTag}".`
						)
					}
					const normalizedChild = childTag.trim()
					if (!normalizedChild) {
						throw new Error('logger.withTag requires a non-empty tag.')
					}
					const combinedTag = `${tag}:${normalizedChild}`
					return createOrGetLogger(combinedTag)
				}
			}

			const value = Reflect.get(target, prop, receiver)
			if (
				typeof prop === 'string' &&
				typeof value === 'function' &&
				FORWARDED_METHODS.has(prop)
			) {
				return (...args: unknown[]) => {
					if (!isLoggerEnabled(tag)) {
						return receiver
					}

					if (logForwarder) {
						try {
							logForwarder({ tag, level: prop, args })
						} catch {
							// Swallow forwarding issues to avoid breaking logs
						}
					}

					return value.apply(target, args)
				}
			}

			return typeof value === 'function' ? value.bind(target) : value
		}
	})
}

const setLogForwarder = (forwarder?: LogForwarder) => {
	logForwarder = forwarder
}

export { createForwardingProxy, setLogForwarder }
export type { LogForwarderEntry }
