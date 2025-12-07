type StringQuote = '"' | "'" | '`'

type StringRule = {
	quote: StringQuote
	multiline: boolean
}

const DEFAULT_STRING_RULES: Record<StringQuote, StringRule> = {
	'"': { quote: '"', multiline: false },
	"'": { quote: "'", multiline: false },
	'`': { quote: '`', multiline: true }
}

type BracketDescriptor = {
	open: boolean
	match: string
}

const BASE_BRACKET_LOOKUP: Record<string, BracketDescriptor> = {
	'(': { open: true, match: ')' },
	')': { open: false, match: '(' },
	'[': { open: true, match: ']' },
	']': { open: false, match: '[' },
	'{': { open: true, match: '}' },
	'}': { open: false, match: '{' }
}

export type BracketDepthMap = Record<number, number>

export type BracketScanOptions = {
	angleBrackets?: boolean
	stringRules?: Record<StringQuote, StringRule>
}

type StackItem = {
	char: string
	index: number
	match: string
}

const createBracketLookup = (angleBrackets?: boolean) => {
	if (!angleBrackets) {
		return BASE_BRACKET_LOOKUP
	}

	return {
		...BASE_BRACKET_LOOKUP,
		'<': { open: true, match: '>' },
		'>': { open: false, match: '<' }
	}
}

export const computeBracketDepths = (
	text: string,
	options?: BracketScanOptions
): BracketDepthMap => {
	const depthMap: BracketDepthMap = Object.create(null)

	if (!text || text.length === 0) {
		return depthMap
	}

	const bracketLookup = createBracketLookup(options?.angleBrackets)
	const stringRules = options?.stringRules ?? DEFAULT_STRING_RULES
	const stack: StackItem[] = []

	let stringState: (StringRule & { escaped: boolean; start: number }) | null =
		null

	for (let i = 0; i < text.length; i++) {
		const char = text[i]!

		if (stringState) {
			if (stringState.escaped) {
				stringState.escaped = false
				continue
			}

			if (char === '\\') {
				stringState.escaped = true
				continue
			}

			if (char === stringState.quote) {
				stringState = null
				continue
			}

			if (char === '\n' && !stringState.multiline) {
				stringState = null
			}

			continue
		}

		const stringRule = stringRules[char as StringQuote]
		if (stringRule) {
			stringState = {
				...stringRule,
				start: i,
				escaped: false
			}
			continue
		}

		const descriptor = bracketLookup[char]
		if (!descriptor) continue

		if (descriptor.open) {
			const depth = stack.length + 1
			stack.push({ char, index: i, match: descriptor.match })
			depthMap[i] = depth
			continue
		}

		const last = stack[stack.length - 1]
		if (last && last.char === descriptor.match) {
			stack.pop()
			const depth = stack.length + 1
			depthMap[last.index] = depth
			depthMap[i] = depth
		} else {
			// Unmatched closing bracket – treat as depth 1 and reset stack so it
			// doesn't poison subsequent characters.
			stack.length = 0
			depthMap[i] = 1
		}
	}

	return depthMap
}
