import { LOGGER_TOGGLE_DEFAULTS } from './toggleDefaults'
import {
	LOGGER_DEFINITIONS,
	definitionEntries,
	type LoggerDefinition,
	type LoggerName
} from './loggerDefinitions'
import { buildTag } from './tags'

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
