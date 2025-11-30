import { analyzeFileBytes, type TextHeuristicDecision } from './textHeuristics'

type NewlineKind = 'lf' | 'crlf' | 'cr' | 'mixed' | 'none'

type NewlineInfo = {
	kinds: Record<Exclude<NewlineKind, 'mixed'>, number>
	kind: NewlineKind
	normalized: boolean
}

type NormalizeResult = {
	text: string
	newline: NewlineInfo
	hadBom: boolean
}

export type LineInfo = {
	index: number
	start: number
	length: number
	indentSpaces: number
	indentTabs: number
	trailingWhitespace: number
	hasContent: boolean
}

type UnicodeIssueType =
	| 'loneHighSurrogate'
	| 'loneLowSurrogate'
	| 'nullByte'
	| 'controlCharacter'

type UnicodeIssue = {
	type: UnicodeIssueType
	index: number
}

type UnicodeReport = {
	hasNull: boolean
	invalidSurrogateCount: number
	controlCharacterCount: number
	issues: UnicodeIssue[]
}

type BinaryReport = {
	suspicious: boolean
	reason?: string
}

export type StringRegion = {
	start: number
	end: number
	quote: '"' | "'" | '`'
	terminated: boolean
	multiline: boolean
}

export type BracketType = 'paren' | 'brace' | 'bracket' | 'angle'

export type BracketPair = {
	type: BracketType
	open: number
	close: number
}

export type BracketToken = {
	type: BracketType
	index: number
	char: string
}

type BracketReport = {
	pairs: BracketPair[]
	unmatchedOpens: BracketToken[]
	unmatchedCloses: BracketToken[]
	maxDepth: number
	depthByIndex: Record<number, number>
}

type LanguageId =
	| 'typescript'
	| 'tsx'
	| 'javascript'
	| 'jsx'
	| 'json'
	| 'html'
	| 'css'
	| 'markdown'
	| 'shell'
	| 'python'
	| 'xml'
	| 'yaml'
	| 'dockerfile'
	| 'makefile'
	| 'cmake'
	| 'gitignore'
	| 'plaintext'
	| 'unknown'

type LanguageDetectionSource =
	| 'hint'
	| 'extension'
	| 'shebang'
	| 'doctype'
	| 'heuristic'
	| 'filename'
	| 'fallback'

type StringRule = {
	quote: '"' | "'" | '`'
	multiline: boolean
}

type LanguageRules = {
	angleBrackets: boolean
	strings: Record<StringRule['quote'], StringRule>
	displayName: string
}

export type LanguageInfo = {
	id: LanguageId
	source: LanguageDetectionSource
	displayName: string
	rules: LanguageRules
}

export type IndentationSummary = {
	style: 'spaces' | 'tabs' | 'mixed' | 'none'
	width: number | null
	spaceLines: number
	tabLines: number
	mixedLines: number
	blankLines: number
	trailingWhitespaceLines: number
	totalTrailingWhitespace: number
}

export type ParseOptions = {
	path?: string
	languageHint?: LanguageId
	enableAngleBracketScan?: boolean
	previewBytes?: Uint8Array
}

export type ParseResult = {
	text: string
	characterCount: number
	lineCount: number
	lineStarts: number[]
	lineInfo: LineInfo[]
	newline: NewlineInfo
	unicode: UnicodeReport
	binary: BinaryReport
	indentation: IndentationSummary
	strings: StringRegion[]
	brackets: BracketReport
	language: LanguageInfo
	contentKind: 'text' | 'binary'
	textHeuristic?: TextHeuristicDecision
}

const CONTROL_CHAR_MAX_RATIO = 0.02
const BINARY_FALLBACK_DISPLAY_LIMIT = 1024 * 64 // TODO remove this once we have virtualized rendering

const DEFAULT_STRING_RULES: Record<StringRule['quote'], StringRule> = {
	'"': { quote: '"', multiline: false },
	"'": { quote: "'", multiline: false },
	'`': { quote: '`', multiline: true }
}

const LANGUAGE_RULES: Record<LanguageId, LanguageRules> = {
	typescript: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: 'TypeScript'
	},
	tsx: {
		angleBrackets: true,
		strings: DEFAULT_STRING_RULES,
		displayName: 'TSX'
	},
	javascript: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: 'JavaScript'
	},
	jsx: {
		angleBrackets: true,
		strings: DEFAULT_STRING_RULES,
		displayName: 'JSX'
	},
	json: {
		angleBrackets: false,
		strings: {
			'"': { quote: '"', multiline: false },
			"'": { quote: "'", multiline: false },
			'`': { quote: '`', multiline: false }
		},
		displayName: 'JSON'
	},
	html: {
		angleBrackets: true,
		strings: DEFAULT_STRING_RULES,
		displayName: 'HTML'
	},
	css: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: 'CSS'
	},
	markdown: {
		angleBrackets: true,
		strings: DEFAULT_STRING_RULES,
		displayName: 'Markdown'
	},
	shell: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: 'Shell'
	},
	python: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: 'Python'
	},
	xml: {
		angleBrackets: true,
		strings: DEFAULT_STRING_RULES,
		displayName: 'XML'
	},
	yaml: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: 'YAML'
	},
	dockerfile: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: 'Dockerfile'
	},
	makefile: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: 'Makefile'
	},
	cmake: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: 'CMake'
	},
	gitignore: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: '.gitignore'
	},
	plaintext: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: 'Plain Text'
	},
	unknown: {
		angleBrackets: false,
		strings: DEFAULT_STRING_RULES,
		displayName: 'Unknown'
	}
}

const EXTENSION_LANGUAGE_MAP: Record<string, LanguageId> = {
	ts: 'typescript',
	tsx: 'tsx',
	js: 'javascript',
	jsx: 'jsx',
	mjs: 'javascript',
	cjs: 'javascript',
	json: 'json',
	html: 'html',
	htm: 'html',
	css: 'css',
	md: 'markdown',
	mdx: 'markdown',
	sh: 'shell',
	bash: 'shell',
	zsh: 'shell',
	py: 'python',
	xml: 'xml',
	yml: 'yaml',
	yaml: 'yaml'
}

const SHEBANG_LANGUAGE_MAP: Record<string, LanguageId> = {
	node: 'javascript',
	'deno run': 'typescript',
	tsx: 'tsx',
	tsnode: 'typescript',
	python: 'python',
	python3: 'python',
	py: 'python',
	bash: 'shell',
	sh: 'shell',
	zsh: 'shell'
}
const SHEBANG_KEYS = Object.keys(SHEBANG_LANGUAGE_MAP).sort(
	(a, b) => b.length - a.length
)

export function parseFileBuffer(
	text: string,
	options: ParseOptions = {}
): ParseResult {
	const detection = options.previewBytes
		? analyzeFileBytes(options.path, options.previewBytes)
		: undefined

	if (detection && !detection.isText) {
		return createBinaryFallbackResult(text, detection)
	}

	const normalized = normalizeNewlines(text ?? '')
	const languageDetection = detectLanguage(
		normalized.text,
		options.path,
		options.languageHint
	)
	const languageRules = LANGUAGE_RULES[languageDetection.id]
	const angleBracketsEnabled =
		options.enableAngleBracketScan ?? languageRules.angleBrackets

	const lineStarts: number[] = [0]
	const lineInfo: LineInfo[] = []

	let lineStart = 0
	let currentLeadingSpaces = 0
	let currentLeadingTabs = 0
	let inIndent = true
	let lastNonWhitespace = -1
	let blankLines = 0
	let trailingWhitespaceLines = 0
	let totalTrailingWhitespace = 0
	const spaceIndentSamples: number[] = []
	let spaceIndentLines = 0
	let tabIndentLines = 0
	let mixedIndentLines = 0

	const stringRegions: StringRegion[] = []
	let stringState: (StringRule & { start: number; escaped: boolean }) | null =
		null
	let contentLines = 0

	type BracketDescriptor = {
		type: BracketType
		open: boolean
		match: string
	}

	const bracketLookup: Record<string, BracketDescriptor> = {
		'(': { type: 'paren', open: true, match: ')' },
		')': { type: 'paren', open: false, match: '(' },
		'[': { type: 'bracket', open: true, match: ']' },
		']': { type: 'bracket', open: false, match: '[' },
		'{': { type: 'brace', open: true, match: '}' },
		'}': { type: 'brace', open: false, match: '{' }
	}

	if (angleBracketsEnabled) {
		bracketLookup['<'] = { type: 'angle', open: true, match: '>' }
		bracketLookup['>'] = { type: 'angle', open: false, match: '<' }
	}

	const bracketStack: BracketToken[] = []
	const bracketPairs: BracketPair[] = []
	const unmatchedOpens: BracketToken[] = []
	const unmatchedCloses: BracketToken[] = []
	const bracketDepth: Record<number, number> = Object.create(null)
	let maxBracketDepth = 0

	const unicodeIssues: UnicodeIssue[] = []
	let hasNullByte = false
	let invalidSurrogateCount = 0
	let controlCharacterCount = 0

	const content = normalized.text
	const length = content.length

	const pushLine = (lineEnd: number) => {
		const index = lineInfo.length
		const lengthValue = lineEnd - lineStart
		const hasContent = lastNonWhitespace >= lineStart
		const contentLength = hasContent ? lastNonWhitespace - lineStart + 1 : 0
		const trailingWhitespace = Math.max(0, lengthValue - contentLength)
		const info: LineInfo = {
			index,
			start: lineStart,
			length: lengthValue,
			indentSpaces: currentLeadingSpaces,
			indentTabs: currentLeadingTabs,
			trailingWhitespace,
			hasContent
		}

		lineInfo.push(info)

		if (hasContent) {
			contentLines++
			if (currentLeadingSpaces > 0 && currentLeadingTabs === 0) {
				spaceIndentSamples.push(currentLeadingSpaces)
				spaceIndentLines++
			} else if (currentLeadingTabs > 0 && currentLeadingSpaces === 0) {
				tabIndentLines++
			} else if (currentLeadingSpaces > 0 && currentLeadingTabs > 0) {
				mixedIndentLines++
			}
		} else {
			blankLines++
		}

		if (trailingWhitespace > 0) {
			trailingWhitespaceLines++
			totalTrailingWhitespace += trailingWhitespace
		}
	}

	for (let i = 0; i < length; i++) {
		const char = content[i]!
		const codePoint = content.charCodeAt(i)
		const isWhitespace = char === ' ' || char === '\t'
		const skipBracketForChar = Boolean(stringState)

		// Unicode validation
		if (codePoint === 0) {
			hasNullByte = true
			unicodeIssues.push({ type: 'nullByte', index: i })
		} else if (codePoint < 32 && char !== '\n' && char !== '\t') {
			controlCharacterCount++
			unicodeIssues.push({ type: 'controlCharacter', index: i })
		}

		if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
			const next = content.charCodeAt(i + 1)
			if (next < 0xdc00 || next > 0xdfff) {
				invalidSurrogateCount++
				unicodeIssues.push({ type: 'loneHighSurrogate', index: i })
			}
		} else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
			const prev = content.charCodeAt(i - 1)
			if (prev < 0xd800 || prev > 0xdbff) {
				invalidSurrogateCount++
				unicodeIssues.push({ type: 'loneLowSurrogate', index: i })
			}
		}

		// Leading indentation tracking
		if (inIndent && char === ' ') {
			currentLeadingSpaces++
		} else if (inIndent && char === '\t') {
			currentLeadingTabs++
		} else if (inIndent && char !== '\n') {
			inIndent = false
		}

		// String detection
		if (stringState) {
			if (stringState.escaped) {
				stringState.escaped = false
			} else if (char === '\\') {
				stringState.escaped = true
			} else if (char === stringState.quote) {
				stringRegions.push({
					start: stringState.start,
					end: i + 1,
					quote: stringState.quote,
					terminated: true,
					multiline: stringState.multiline
				})
				stringState = null
			} else if (char === '\n' && !stringState.multiline) {
				stringRegions.push({
					start: stringState.start,
					end: i,
					quote: stringState.quote,
					terminated: false,
					multiline: false
				})
				stringState = null
			}
		} else if (languageRules.strings[char as '"' | "'" | '`']) {
			const rule = languageRules.strings[char as '"' | "'" | '`']
			stringState = {
				...rule,
				start: i,
				escaped: false
			}
		}

		// Update trailing whitespace tracking
		if (!isWhitespace && char !== '\n') {
			lastNonWhitespace = i
		}

		// Newline handling
		if (char === '\n') {
			pushLine(i)
			lineStart = i + 1
			lineStarts.push(lineStart)
			inIndent = true
			currentLeadingSpaces = 0
			currentLeadingTabs = 0
			lastNonWhitespace = lineStart - 1
			if (stringState && !stringState.multiline) {
				stringState = null
			}
			continue
		}

		// Bracket handling (skip when inside strings)
		if (!skipBracketForChar) {
			const bracket = bracketLookup[char]
			if (bracket) {
				if (bracket.open) {
					const depth = bracketStack.length + 1
					bracketStack.push({
						type: bracket.type,
						index: i,
						char
					})
					bracketDepth[i] = depth
					if (depth > maxBracketDepth) {
						maxBracketDepth = depth
					}
				} else {
					const last = bracketStack[bracketStack.length - 1]
					if (last && last.char === bracket.match) {
						bracketStack.pop()
						const depth = bracketStack.length + 1
						bracketPairs.push({
							type: bracket.type,
							open: last.index,
							close: i
						})
						bracketDepth[last.index] = depth
						bracketDepth[i] = depth
					} else {
						unmatchedCloses.push({
							type: bracket.type,
							index: i,
							char
						})
					}
				}
			}
		}
	}

	pushLine(length)

	while (bracketStack.length) {
		const open = bracketStack.pop()!
		unmatchedOpens.push(open)
	}

	if (stringState) {
		stringRegions.push({
			start: stringState.start,
			end: length,
			quote: stringState.quote,
			terminated: false,
			multiline: stringState.multiline
		})
	}

	const indentation: IndentationSummary = {
		style: resolveIndentStyle(
			spaceIndentLines,
			tabIndentLines,
			mixedIndentLines,
			contentLines
		),
		width: guessIndentWidth(spaceIndentSamples),
		spaceLines: spaceIndentLines,
		tabLines: tabIndentLines,
		mixedLines: mixedIndentLines,
		blankLines,
		trailingWhitespaceLines,
		totalTrailingWhitespace
	}

	const binary: BinaryReport = {
		suspicious:
			hasNullByte ||
			(length > 0 && controlCharacterCount / length > CONTROL_CHAR_MAX_RATIO),
		reason: undefined
	}

	if (binary.suspicious) {
		if (hasNullByte) {
			binary.reason = 'null-byte'
		} else if (
			length > 0 &&
			controlCharacterCount / length > CONTROL_CHAR_MAX_RATIO
		) {
			binary.reason = 'control-chars'
		}
	}

	const unicode: UnicodeReport = {
		hasNull: hasNullByte,
		invalidSurrogateCount,
		controlCharacterCount,
		issues: unicodeIssues
	}

	return {
		text: content,
		characterCount: length,
		lineCount: lineInfo.length,
		lineStarts,
		lineInfo,
		newline: normalized.newline,
		unicode,
		binary,
		indentation,
		strings: stringRegions,
		brackets: {
			pairs: bracketPairs,
			unmatchedOpens,
			unmatchedCloses,
			maxDepth: maxBracketDepth,
			depthByIndex: bracketDepth
		},
		language: languageDetection,
		contentKind: 'text',
		textHeuristic: detection
	}
}

const createBinaryFallbackResult = (
	text: string,
	detection?: TextHeuristicDecision
): ParseResult => {
	const previewLength = Math.min(BINARY_FALLBACK_DISPLAY_LIMIT, text.length)

	return {
		text,
		characterCount: 0,
		lineCount: 0,
		lineStarts: [],
		lineInfo: [
			{
				index: 0,
				start: 0,
				length: previewLength,
				indentSpaces: 0,
				indentTabs: 0,
				trailingWhitespace: 0,
				hasContent: previewLength > 0
			}
		],
		newline: {
			kind: 'none',
			kinds: { none: 0, lf: 0, cr: 0, crlf: 0 },
			normalized: false
		},
		unicode: {
			hasNull: false,
			invalidSurrogateCount: 0,
			controlCharacterCount: 0,
			issues: []
		},
		binary: {
			suspicious: true,
			reason: detection?.reason
				? formatBinaryDetectionReason(detection)
				: 'binary-fallback'
		},
		indentation: {
			style: 'none',
			width: 0,
			spaceLines: 0,
			tabLines: 0,
			mixedLines: 0,
			blankLines: 0,
			trailingWhitespaceLines: 0,
			totalTrailingWhitespace: 0
		},
		strings: [],
		brackets: {
			pairs: [],
			unmatchedOpens: [],
			unmatchedCloses: [],
			maxDepth: 0,
			depthByIndex: {}
		},
		language: {
			id: 'unknown',
			source: 'fallback',
			displayName: 'Plain Text',
			rules: LANGUAGE_RULES.plaintext
		},
		contentKind: 'binary',
		textHeuristic: detection
	}
}

const formatBinaryDetectionReason = (
	detection: TextHeuristicDecision
): string | undefined => {
	if (!detection.reason) return undefined
	const reason = detection.reason
	const fallbackKind = reason.kind
	switch (reason.kind) {
		case 'binary-extension':
			return `binary-extension:${reason.extension}`
		case 'magic-number':
			return `magic-number:${reason.signature}`
		case 'null-bytes':
			return `null-bytes:${reason.ratio.toFixed(4)}`
		case 'invalid-utf8':
			return 'invalid-utf8'
		default:
			return fallbackKind
	}
}

const resolveIndentStyle = (
	spaceLines: number,
	tabLines: number,
	mixedLines: number,
	contentLines: number
): IndentationSummary['style'] => {
	if (contentLines === 0) return 'none'
	if (mixedLines > 0 || (spaceLines > 0 && tabLines > 0)) return 'mixed'
	if (spaceLines > 0) return 'spaces'
	if (tabLines > 0) return 'tabs'
	return 'none'
}

const normalizeNewlines = (rawText: string): NormalizeResult => {
	let text = rawText
	let hadBom = false
	if (text.charCodeAt(0) === 0xfeff) {
		text = text.slice(1)
		hadBom = true
	}

	const counts: Record<Exclude<NewlineKind, 'mixed'>, number> = {
		lf: 0,
		crlf: 0,
		cr: 0,
		none: 0
	}

	let normalized = ''
	let needsNormalization = false
	let lastIdx = 0

	for (let i = 0; i < text.length; i++) {
		const char = text.charCodeAt(i)
		if (char === 13) {
			needsNormalization = true
			normalized += text.slice(lastIdx, i)
			if (text.charCodeAt(i + 1) === 10) {
				counts.crlf++
				i++
			} else {
				counts.cr++
			}
			normalized += '\n'
			lastIdx = i + 1
		} else if (char === 10) {
			counts.lf++
		}
	}

	if (needsNormalization) {
		normalized += text.slice(lastIdx)
	} else {
		normalized = text
	}

	if (counts.lf + counts.crlf + counts.cr === 0) {
		counts.none = 1
	}

	const kind: NewlineKind =
		counts.crlf > 0 && counts.lf === 0 && counts.cr === 0
			? 'crlf'
			: counts.lf > 0 && counts.crlf === 0 && counts.cr === 0
				? 'lf'
				: counts.cr > 0 && counts.lf === 0 && counts.crlf === 0
					? 'cr'
					: counts.crlf + counts.cr + counts.lf === 0
						? 'none'
						: 'mixed'

	return {
		text: normalized,
		hadBom,
		newline: {
			kinds: counts,
			kind,
			normalized: needsNormalization
		}
	}
}

const detectLanguage = (
	text: string,
	path?: string,
	langHint?: LanguageId
): LanguageInfo => {
	if (langHint) {
		return {
			id: langHint,
			source: 'hint',
			displayName: LANGUAGE_RULES[langHint].displayName,
			rules: LANGUAGE_RULES[langHint]
		}
	}

	const shebang = extractShebang(text)
	if (shebang) {
		const lang = SHEBANG_LANGUAGE_MAP[shebang]
		if (lang) {
			return {
				id: lang,
				source: 'shebang',
				displayName: LANGUAGE_RULES[lang].displayName,
				rules: LANGUAGE_RULES[lang]
			}
		}
	}

	if (path) {
		const special = detectSpecialFilenameLanguage(path)
		if (special) {
			return {
				id: special,
				source: 'filename',
				displayName: LANGUAGE_RULES[special].displayName,
				rules: LANGUAGE_RULES[special]
			}
		}

		const ext = extractExtension(path)
		if (ext && EXTENSION_LANGUAGE_MAP[ext]) {
			const lang = EXTENSION_LANGUAGE_MAP[ext]
			return {
				id: lang,
				source: 'extension',
				displayName: LANGUAGE_RULES[lang].displayName,
				rules: LANGUAGE_RULES[lang]
			}
		}
	}

	const doctypeLang = detectDoctypeLanguage(text)
	if (doctypeLang) {
		return {
			id: doctypeLang,
			source: 'doctype',
			displayName: LANGUAGE_RULES[doctypeLang].displayName,
			rules: LANGUAGE_RULES[doctypeLang]
		}
	}

	const heuristic = heuristicLanguage(text)
	if (heuristic) {
		return {
			id: heuristic,
			source: 'heuristic',
			displayName: LANGUAGE_RULES[heuristic].displayName,
			rules: LANGUAGE_RULES[heuristic]
		}
	}

	return {
		id: 'plaintext',
		source: 'fallback',
		displayName: LANGUAGE_RULES.plaintext.displayName,
		rules: LANGUAGE_RULES.plaintext
	}
}

const extractShebang = (text: string): string | undefined => {
	if (!text.startsWith('#!')) return undefined
	const firstLineEnd = text.indexOf('\n')
	const firstLine =
		firstLineEnd === -1 ? text.slice(2) : text.slice(2, firstLineEnd)
	const cmd = firstLine.trim().toLowerCase()
	for (const key of SHEBANG_KEYS) {
		if (cmd.includes(key)) {
			return key
		}
	}
	return undefined
}

const detectSpecialFilenameLanguage = (
	path: string
): LanguageId | undefined => {
	const basename = path.split(/[/\\]/).pop() ?? path
	const lower = basename.toLowerCase()

	if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) {
		return 'dockerfile'
	}

	if (lower === 'makefile' || lower.startsWith('makefile.')) {
		return 'makefile'
	}

	if (lower === 'cmakelists.txt') {
		return 'cmake'
	}

	if (lower === '.gitignore' || lower === '.dockerignore') {
		return 'gitignore'
	}

	return undefined
}

const extractExtension = (path: string): string | undefined => {
	const basename = path.split(/[/\\]/).pop() ?? path
	if (!basename.includes('.')) return undefined
	const parts = basename.toLowerCase().split('.')
	return parts.pop()
}

const detectDoctypeLanguage = (text: string): LanguageId | undefined => {
	const trimmed = text.trimStart().slice(0, 128).toLowerCase()
	if (trimmed.startsWith('<!doctype html')) return 'html'
	if (trimmed.startsWith('<?xml')) return 'xml'
	return undefined
}

const heuristicLanguage = (text: string): LanguageId | undefined => {
	const trimmed = text.trimStart()
	if (!trimmed) return undefined
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
	if (trimmed.startsWith('<')) return 'html'
	const firstLine = trimmed.split('\n', 1)[0]?.trim() ?? ''
	if (firstLine.startsWith('---')) {
		return 'markdown'
	}
	// '#' alone is ambiguous (could be markdown header or shell/python comment)
	return undefined
}
// greatest common divisor
const gcd = (a: number, b: number): number => {
	let x = Math.abs(a)
	let y = Math.abs(b)
	while (y !== 0) {
		const temp = y
		y = x % y
		x = temp
	}
	return x
}

const guessIndentWidth = (samples: number[]): number | null => {
	const filtered = samples.filter(value => value > 0).slice(0, 512)
	if (filtered.length === 0) return null
	let value = filtered[0]!
	for (let i = 1; i < filtered.length; i++) {
		value = gcd(value, filtered[i]!)
		if (value === 1) break
	}
	if (value >= 2) return value
	filtered.sort((a, b) => a - b)
	for (const sample of filtered) {
		if (sample >= 2) {
			return sample
		}
	}
	return null
}
