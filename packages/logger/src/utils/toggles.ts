import { defaultLoggerVisibility } from './definitions'

type LoggerToggleState = {
	enabled: boolean
}

const loggerToggleStates = new Map<string, LoggerToggleState>()

const seedDefaultLoggerStates = () => {
	for (const [tag, enabled] of defaultLoggerVisibility.entries()) {
		loggerToggleStates.set(tag, { enabled })
	}
}

seedDefaultLoggerStates()

const normalizeTag = (tag: string): string => {
	const normalized = tag.trim()
	if (!normalized) {
		throw new Error('Logger tag cannot be empty.')
	}
	return normalized
}

const getDefaultEnabledForTag = (tag: string): boolean => {
	const normalized = normalizeTag(tag)

	const explicitDefault = defaultLoggerVisibility.get(normalized)
	if (typeof explicitDefault === 'boolean') return explicitDefault

	const segments = normalized.split(':')
	while (segments.length > 1) {
		segments.pop()
		const parentTag = segments.join(':')
		const parentDefault = defaultLoggerVisibility.get(parentTag)
		if (typeof parentDefault === 'boolean') {
			return parentDefault
		}
	}

	throw new Error(
		`Unknown logger tag "${normalized}". Add it to LOGGER_TOGGLE_DEFAULTS in packages/logger/src/utils/toggleDefaults.ts.`
	)
}

const ensureLoggerToggleState = (tag: string): LoggerToggleState => {
	const normalized = normalizeTag(tag)

	const existing = loggerToggleStates.get(normalized)
	if (existing) return existing

	const state: LoggerToggleState = { enabled: getDefaultEnabledForTag(normalized) }
	loggerToggleStates.set(normalized, state)
	return state
}

const isLoggerEnabled = (tag: string): boolean => ensureLoggerToggleState(tag).enabled

type LoggerRegistryEntry = {
	tag: string
	enabled: boolean
}

const getRegisteredLoggers = (): LoggerRegistryEntry[] => {
	return Array.from(loggerToggleStates.entries())
		.map(([tag, state]) => ({
			tag,
			enabled: state.enabled
		}))
		.sort((a, b) => a.tag.localeCompare(b.tag))
}

const setLoggerEnabled = (
	tag: string,
	enabled: boolean,
	options?: { includeChildren?: boolean }
): void => {
	const state = ensureLoggerToggleState(tag)
	state.enabled = enabled

	if (!options?.includeChildren) return

	const prefix = `${tag}:`
	for (const [registeredTag, registeredState] of loggerToggleStates.entries()) {
		if (registeredTag.startsWith(prefix)) {
			registeredState.enabled = enabled
		}
	}
}

const configureLoggers = (config: Record<string, boolean>): void => {
	for (const [tag, enabled] of Object.entries(config)) {
		setLoggerEnabled(tag, enabled)
	}
}

export {
	configureLoggers,
	ensureLoggerToggleState,
	getRegisteredLoggers,
	isLoggerEnabled,
	setLoggerEnabled
}
export type { LoggerRegistryEntry }
