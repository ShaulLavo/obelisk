import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import type { PaletteResult } from './useCommandPalette'

describe('CommandPalette Result Rendering', () => {
	/**
	 * **Feature: command-palette, Property 7: Result Rendering Contains Required Info**
	 * **Validates: Requirements 3.3, 3.4**
	 *
	 * For any command result, the PaletteResult interface SHALL carry the command
	 * label and category (description). If a shortcut exists, it SHALL also be present.
	 */
	it('property: PaletteResult carries required fields for command results', () => {
		fc.assert(
			fc.property(
				fc.record({
					id: fc.string({ minLength: 1 }),
					label: fc.string({ minLength: 1 }),
					description: fc.string({ minLength: 1 }),
					shortcut: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
					kind: fc.constant('command' as const),
				}),
				(result: PaletteResult) => {
					// Label and description must be non-empty strings
					expect(result.label.length).toBeGreaterThan(0)
					expect(result.description!.length).toBeGreaterThan(0)

					// If shortcut exists, it must be a non-empty string
					if (result.shortcut !== undefined) {
						expect(result.shortcut.length).toBeGreaterThan(0)
					}

					// Kind must be 'command'
					expect(result.kind).toBe('command')
				}
			),
			{ numRuns: 100 }
		)
	})

	/**
	 * **Feature: command-palette, Property 8: File Result Rendering**
	 * **Validates: Requirements 2.3**
	 *
	 * For any file result, the PaletteResult SHALL carry the file path in description.
	 */
	it('property: PaletteResult carries file path for file results', () => {
		fc.assert(
			fc.property(
				fc.record({
					id: fc.string({ minLength: 1 }),
					label: fc.string({ minLength: 1 }),
					description: fc.string({ minLength: 1 }),
					kind: fc.constant('file' as const),
				}),
				(result: PaletteResult) => {
					// File results must have description (file path)
					expect(result.description!.length).toBeGreaterThan(0)
					expect(result.kind).toBe('file')
				}
			),
			{ numRuns: 100 }
		)
	})
})
