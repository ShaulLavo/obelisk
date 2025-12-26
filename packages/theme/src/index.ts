// Types
export type {
	ThemeMode,
	ThemePalette,
	EditorColors,
	SyntaxColors,
	TerminalColors,
} from './types'

// Palettes
export { DARK_THEME, LIGHT_THEME } from './palettes'

// CSS vars
export { syncToCssVars } from './cssVars'

// Context
export { ThemeProvider, useTheme } from './context'
