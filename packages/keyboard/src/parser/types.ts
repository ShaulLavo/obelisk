export type Modifier = 'ctrl' | 'shift' | 'alt' | 'meta'

export type Platform = 'mac' | 'windows' | 'linux'

export type LetterKey =
	| 'a'
	| 'b'
	| 'c'
	| 'd'
	| 'e'
	| 'f'
	| 'g'
	| 'h'
	| 'i'
	| 'j'
	| 'k'
	| 'l'
	| 'm'
	| 'n'
	| 'o'
	| 'p'
	| 'q'
	| 'r'
	| 's'
	| 't'
	| 'u'
	| 'v'
	| 'w'
	| 'x'
	| 'y'
	| 'z'

export type DigitKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

export type SpecialKey =
	| 'space'
	| 'tab'
	| 'enter'
	| 'esc'
	| 'delete'
	| '['
	| ']'
	| '-'
	| '='
	| '+'
	| ';'
	| '<'
	| '>'
	| '"'
	| '`'
	| '|'
	| '?'
	| '↑'
	| '↓'
	| '←'
	| '→'
	| 'capsLock'
	| 'backquote'
	| 'contextMenu'

export type ContentKey = LetterKey | DigitKey | SpecialKey | 'unknown' | ''

export type KeyCombo = {
	key: ContentKey
	modifiers: Set<Modifier>
}

export type ShortcutSequence = KeyCombo[]

export type FormatOptions = {
	platform?: Platform
	useSymbols?: boolean
	delimiter?: string
	treatEqualAsDistinct?: boolean
}

export type MatchOptions = {
	platform?: Platform
	ignoreRepeat?: boolean
	treatEqualAsDistinct?: boolean
}

export type ShortcutSequenceMatcherOptions = {
	platform?: Platform
	timeoutMs?: number
	ignoreRepeat?: boolean
	treatEqualAsDistinct?: boolean
	allowSubsequence?: boolean
}

export type ShortcutSequenceMatcher = {
	handleEvent(e: KeyboardEvent): boolean
	reset(): void
}

export type SequenceMatcherOptions = ShortcutSequenceMatcherOptions
