import type { LoggerScope } from './tags'

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

export { LOGGER_DEFINITIONS, definitionEntries }
export type { LoggerDefinition, LoggerName }
