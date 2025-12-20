/**
 * Generate large content for benchmarking purposes
 */

import { loggers } from '@repo/logger'

const CHAR_SET =
	'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-=+[]{}();:\'",.<>/?\t'

export type ContentGeneratorOptions = {
	lines: number
	// Must exceed line number width when includeLineNumbers is true.
	charsPerLine: number
	includeLineNumbers?: boolean
}

/**
 * Generate large text content at runtime
 * Uses deterministic pattern for consistent benchmarks
 */
export const generateContent = (options: ContentGeneratorOptions): string => {
	const log = loggers.codeEditor.withTag('benchmark-content')
	const { lines, charsPerLine, includeLineNumbers = true } = options
	const lineNumberWidth = includeLineNumbers ? String(lines).length + 2 : 0
	const contentWidth = charsPerLine - lineNumberWidth

	if (charsPerLine < 1) {
		log.error('Benchmark content requires charsPerLine >= 1', {
			charsPerLine,
		})
		throw new Error(
			`generateContent requires charsPerLine >= 1 (received ${charsPerLine}).`
		)
	}

	if (includeLineNumbers && contentWidth < 1) {
		log.error(
			'Benchmark content requires charsPerLine to exceed line number width',
			{ charsPerLine, lineNumberWidth, lines }
		)
		throw new Error(
			`generateContent requires charsPerLine (${charsPerLine}) to exceed lineNumberWidth (${lineNumberWidth}) when includeLineNumbers is true.`
		)
	}

	const result: string[] = []

	for (let i = 0; i < lines; i++) {
		let line = ''

		if (includeLineNumbers) {
			line = `${String(i + 1).padStart(lineNumberWidth - 2, '0')}: `
		}

		// Generate deterministic content
		for (let j = 0; j < contentWidth; j++) {
			line += CHAR_SET[(i + j) % CHAR_SET.length]
		}

		result.push(line)
	}

	return result.join('\n')
}

/**
 * Preset configurations for common benchmark scenarios
 */
export const BENCHMARK_PRESETS = {
	/** Normal code file - typical line length */
	normal: {
		lines: 10000,
		charsPerLine: 80,
	},

	/** Wide file - triggers horizontal virtualization (> 500 chars) */
	wide: {
		lines: 5000,
		charsPerLine: 3000,
	},

	/** Very wide file - extreme horizontal virtualization */
	veryWide: {
		lines: 1000,
		charsPerLine: 10000,
	},

	/** Huge file - stress test vertical virtualization */
	huge: {
		lines: 100000,
		charsPerLine: 100,
	},

	/** Small file - baseline comparison */
	small: {
		lines: 100,
		charsPerLine: 80,
	},
} as const

export type BenchmarkPreset = keyof typeof BENCHMARK_PRESETS

/**
 * Generate content using a preset configuration
 */
export const generatePresetContent = (preset: BenchmarkPreset): string => {
	return generateContent(BENCHMARK_PRESETS[preset])
}
