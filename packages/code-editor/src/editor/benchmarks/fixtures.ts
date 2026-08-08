/**
 * Benchmark fixture classes for the editor pipeline rewrite.
 *
 * Each fixture represents a distinct workload profile used to establish
 * baseline metrics and compare phase-to-phase during the rewrite.
 */

import { generateContent, type ContentGeneratorOptions } from './generateContent'
import highlightHeavyData from './data/highlight-heavy.json'
import bracketHeavyData from './data/bracket-heavy.json'
import type { EditorSyntaxHighlight, BracketInfo } from '../types'

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

export type FixtureClass =
	| 'small'
	| 'large'
	| 'highlight-heavy'
	| 'long-line'

export type BenchmarkFixture = {
	name: FixtureClass
	description: string
	content: string
	filePath: string
	highlights?: EditorSyntaxHighlight[]
	brackets?: BracketInfo[]
	generatorOptions: ContentGeneratorOptions
}

// ---------------------------------------------------------------------------
// Fixture definitions
// ---------------------------------------------------------------------------

const FIXTURE_CONFIGS: Record<
	FixtureClass,
	Omit<BenchmarkFixture, 'content'>
> = {
	small: {
		name: 'small',
		description: 'Small file (100 lines, 80 chars) — baseline comparison',
		filePath: 'fixture-small.ts',
		generatorOptions: { lines: 100, charsPerLine: 80 },
	},
	large: {
		name: 'large',
		description: 'Large file (10k lines, 80 chars) — vertical virtualization stress',
		filePath: 'fixture-large.ts',
		generatorOptions: { lines: 10000, charsPerLine: 80 },
	},
	'highlight-heavy': {
		name: 'highlight-heavy',
		description: 'Dense syntax highlighting — decoration pipeline stress',
		filePath: 'fixture-highlight-heavy.ts',
		generatorOptions: { lines: 500, charsPerLine: 80 },
	},
	'long-line': {
		name: 'long-line',
		description: 'Pathological long lines (200 lines, 5000 chars) — horizontal stress',
		filePath: 'fixture-long-line.ts',
		generatorOptions: { lines: 200, charsPerLine: 5000, includeLineNumbers: false },
	},
}

// Cache generated fixtures to avoid regenerating on each access
const fixtureCache = new Map<FixtureClass, BenchmarkFixture>()

/**
 * Get a benchmark fixture by class name.
 * Fixtures are cached after first generation.
 */
export const getFixture = (fixtureClass: FixtureClass): BenchmarkFixture => {
	const cached = fixtureCache.get(fixtureClass)
	if (cached) return cached

	const config = FIXTURE_CONFIGS[fixtureClass]
	let content: string
	let highlights: EditorSyntaxHighlight[] | undefined
	let brackets: BracketInfo[] | undefined

	if (fixtureClass === 'highlight-heavy') {
		content = highlightHeavyData.content
		highlights = highlightHeavyData.highlights as EditorSyntaxHighlight[]
	} else {
		content = generateContent(config.generatorOptions)
	}

	if (fixtureClass === 'small') {
		// Reuse bracket data for the small fixture for bracket depth testing
		brackets = bracketHeavyData.brackets as BracketInfo[]
	}

	const fixture: BenchmarkFixture = {
		...config,
		content,
		highlights,
		brackets,
	}

	fixtureCache.set(fixtureClass, fixture)
	return fixture
}

/** All fixture class names in recommended run order. */
export const ALL_FIXTURE_CLASSES: FixtureClass[] = [
	'small',
	'large',
	'highlight-heavy',
	'long-line',
]
