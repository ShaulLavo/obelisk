const BRACKET_DEPTH_COLOR_CLASSES = [
	{ text: 'text-emerald-300', border: 'border-emerald-300' },
	{ text: 'text-violet-400', border: 'border-violet-400' },
	{ text: 'text-sky-400', border: 'border-sky-400' },
	{ text: 'text-rose-400', border: 'border-rose-400' },
	{ text: 'text-amber-300', border: 'border-amber-300' },
	{ text: 'text-lime-300', border: 'border-lime-300' }
] as const

const normalizeDepthIndex = (depth: number) => {
	const normalized = Math.max(depth - 1, 0)
	return normalized % BRACKET_DEPTH_COLOR_CLASSES.length
}

type BracketDepthColorVariant = (typeof BRACKET_DEPTH_COLOR_CLASSES)[number]

const resolveVariant = (depth: number): BracketDepthColorVariant => {
	return BRACKET_DEPTH_COLOR_CLASSES[normalizeDepthIndex(depth)]!
}

export const getBracketDepthTextClass = (depth: number) => {
	return resolveVariant(depth).text
}

export const getBracketDepthBorderClass = (depth: number) => {
	return resolveVariant(depth).border
}
