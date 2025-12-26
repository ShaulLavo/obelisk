export type ThemeMode = 'light' | 'dark'

export type EditorColors = {
	background: string
	foreground: string
	lineNumber: string
	lineNumberActive: string
	selection: string
	cursor: string
	cursorLine: string
	whitespaceMarker: string
	gutterBackground: string
	scrollbarThumb: string
	scrollbarTrack: string
}

export type SyntaxColors = {
	comment: string
	keyword: string
	keywordDeclaration: string
	keywordImport: string
	keywordType: string
	keywordControl: string
	keywordOperator: string
	type: string
	typeBuiltin: string
	typeParameter: string
	typeDefinition: string
	function: string
	method: string
	string: string
	number: string
	operator: string
	punctuation: string
	punctuationBracket: string
	variable: string
	variableParameter: string
	variableBuiltin: string
	constant: string
	property: string
	attribute: string
	namespace: string
	error: string
	missing: string
}

export type TerminalColors = {
	background: string
	foreground: string
	cursor: string
	black: string
	red: string
	green: string
	yellow: string
	blue: string
	magenta: string
	cyan: string
	white: string
	brightBlack: string
	brightRed: string
	brightGreen: string
	brightYellow: string
	brightBlue: string
	brightMagenta: string
	brightCyan: string
	brightWhite: string
}

export type ThemePalette = {
	editor: EditorColors
	syntax: SyntaxColors
	brackets: string[]
	terminal: TerminalColors
}
