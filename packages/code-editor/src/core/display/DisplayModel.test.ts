import { describe, it, expect } from 'vitest'
import {
	computeLineVisualWidth,
	createDisplayModel,
	scanWidthBatch,
	resetWidthScan,
	needsWidthRescan,
	type DisplayModelState,
} from './DisplayModel'
import type { EditorCore } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal EditorCore stub for width scanning. */
const makeStubCore = (lines: string[]): EditorCore => {
	const lineIds = lines.map((_, i) => i + 100)
	return {
		getLineCount: () => lines.length,
		getLineText: (i: number) => lines[i] ?? '',
		getLineId: (i: number) => lineIds[i] ?? -1,
		getLineIndex: (id: number) => {
			const idx = lineIds.indexOf(id)
			if (idx === -1) throw new Error(`Unknown line ID ${id}`)
			return idx
		},
	} as unknown as EditorCore
}

// ---------------------------------------------------------------------------
// computeLineVisualWidth
// ---------------------------------------------------------------------------

describe('computeLineVisualWidth', () => {
	it('counts plain characters', () => {
		expect(computeLineVisualWidth('hello', 4)).toBe(5)
	})

	it('handles tabs with alignment', () => {
		// "a\t" at tabSize 4: 'a' = col 1, tab advances to col 4 → width = 4
		expect(computeLineVisualWidth('a\t', 4)).toBe(4)
		// "\t" at tabSize 4: advances to col 4 → width = 4
		expect(computeLineVisualWidth('\t', 4)).toBe(4)
		// "ab\t" at tabSize 4: 'a'=1, 'b'=2, tab to 4 → width = 4
		expect(computeLineVisualWidth('ab\t', 4)).toBe(4)
		// "abcd\t" at tabSize 4: 4 chars, tab to 8 → width = 8
		expect(computeLineVisualWidth('abcd\t', 4)).toBe(8)
	})

	it('handles empty string', () => {
		expect(computeLineVisualWidth('', 4)).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// Width scanning
// ---------------------------------------------------------------------------

describe('scanWidthBatch', () => {
	it('scans all lines in one batch', () => {
		const lines = ['short', 'a much longer line here', 'mid']
		const core = makeStubCore(lines)
		let state = createDisplayModel(core)

		state = scanWidthBatch(state, core, 4, 100)

		expect(state.widthScan.maxVisualColumns).toBe(23) // "a much longer line here"
		expect(state.widthScan.scanning).toBe(false)
		expect(state.widthScan.nextScanIndex).toBe(3)
	})

	it('scans in multiple batches', () => {
		const lines = ['short', 'a much longer line here', 'mid']
		const core = makeStubCore(lines)
		let state = createDisplayModel(core)

		state = scanWidthBatch(state, core, 4, 2)
		expect(state.widthScan.scanning).toBe(true)
		expect(state.widthScan.nextScanIndex).toBe(2)
		expect(state.widthScan.maxVisualColumns).toBe(23)

		state = scanWidthBatch(state, core, 4, 2)
		expect(state.widthScan.scanning).toBe(false)
		expect(state.widthScan.maxVisualColumns).toBe(23)
	})

	it('tracks the max-width owner line ID', () => {
		const lines = ['short', 'the longest line in the document right here', 'mid']
		const core = makeStubCore(lines)
		let state = createDisplayModel(core)

		state = scanWidthBatch(state, core, 4, 100)

		// Line index 1 → lineId 101
		expect(state.widthScan.maxWidthLineId).toBe(101)
	})
})

// ---------------------------------------------------------------------------
// Width shrink detection (the key Phase 6 test)
// ---------------------------------------------------------------------------

describe('needsWidthRescan', () => {
	it('returns true when max-width owner is null', () => {
		const core = makeStubCore(['hello'])
		const state = createDisplayModel(core)
		expect(needsWidthRescan(state, core, 4)).toBe(true)
	})

	it('returns false when max-width owner has same width', () => {
		const lines = ['short', 'the longest line']
		const core = makeStubCore(lines)
		let state = createDisplayModel(core)
		state = scanWidthBatch(state, core, 4, 100)

		expect(needsWidthRescan(state, core, 4)).toBe(false)
	})

	it('returns true when the longest line is shortened', () => {
		const lines = ['short', 'the longest line in the document']
		const core = makeStubCore(lines)
		let state = createDisplayModel(core)
		state = scanWidthBatch(state, core, 4, 100)

		expect(state.widthScan.maxVisualColumns).toBe(32)

		// Simulate the line being shortened
		const shortenedLines = ['short', 'shorter now']
		const shortenedCore = makeStubCore(shortenedLines)
		// Keep the same state but check against the shortened core
		// (lineId 101 still exists but is now shorter)
		expect(needsWidthRescan(state, shortenedCore, 4)).toBe(true)
	})

	it('returns true when the max-width owner line is deleted', () => {
		const lines = ['short', 'the longest line']
		const core = makeStubCore(lines)
		let state = createDisplayModel(core)
		state = scanWidthBatch(state, core, 4, 100)

		// Now create a core where lineId 101 does not exist
		const reducedCore = {
			...core,
			getLineIndex: (id: number) => {
				if (id === 101) throw new Error('Line deleted')
				return 0
			},
		} as unknown as EditorCore

		expect(needsWidthRescan(state, reducedCore, 4)).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// resetWidthScan
// ---------------------------------------------------------------------------

describe('resetWidthScan', () => {
	it('clears all scan state', () => {
		const lines = ['short', 'longer line here']
		const core = makeStubCore(lines)
		let state = createDisplayModel(core)
		state = scanWidthBatch(state, core, 4, 100)

		state = resetWidthScan(state)

		expect(state.widthScan.maxVisualColumns).toBe(0)
		expect(state.widthScan.maxWidthLineId).toBe(null)
		expect(state.widthScan.nextScanIndex).toBe(0)
		expect(state.widthScan.scanning).toBe(false)
	})
})
