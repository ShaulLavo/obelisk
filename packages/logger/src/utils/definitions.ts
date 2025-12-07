import { buildTag, type LoggerScope } from './tags'

// Edit this map to hardcode which loggers start enabled/disabled.
const LOGGER_TOGGLE_DEFAULTS = {
	app: false,
	web: false,
	server: false,
	desktop: false,
	fs: false,
	'code-editor': false,
	perf: false
} as const satisfies Record<string, boolean>

type LoggerDefinition = {
	scopes: readonly LoggerScope[]
	enabled?: boolean
}

const LOGGER_DEFINITIONS = {
	app: {
		scopes: []
	},
	web: {
		scopes: ['web']
	},
	server: {
		scopes: ['server']
	},
	desktop: {
		scopes: ['desktop']
	},
	fs: {
		scopes: ['fs']
	},
	codeEditor: {
		scopes: ['code-editor']
	},
	perf: {
		scopes: ['perf']
	}
} as const satisfies Record<string, LoggerDefinition>

type LoggerName = keyof typeof LOGGER_DEFINITIONS

const definitionEntries = Object.entries(LOGGER_DEFINITIONS) as [
	LoggerName,
	LoggerDefinition
][]

const defaultLoggerVisibility = new Map<string, boolean>(
	Object.entries(LOGGER_TOGGLE_DEFAULTS)
)

for (const [, definition] of definitionEntries) {
	const tag = buildTag(definition.scopes)
	if (!defaultLoggerVisibility.has(tag)) {
		throw new Error(
			`Logger scope "${tag}" is missing from LOGGER_TOGGLE_DEFAULTS. Add it to the map to continue.`
		)
	}
}

export {
	LOGGER_DEFINITIONS,
	definitionEntries,
	defaultLoggerVisibility,
	LOGGER_TOGGLE_DEFAULTS
}
export type { LoggerDefinition, LoggerName }
