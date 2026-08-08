/**
 * Deterministic canary typing trace for the editor pipeline rewrite.
 *
 * This trace replays the same edit sequence on every run, producing
 * comparable metrics across phases. The sequence covers the common
 * editing operations: typing, newlines, backspace, and navigation.
 *
 * The trace is designed to run against any fixture class.
 */

export type CanaryStep =
	| { type: 'type'; text: string }
	| { type: 'newline' }
	| { type: 'backspace'; count: number }
	| { type: 'wait-frames'; count: number }

/**
 * The canonical canary edit sequence.
 *
 * This sequence is intentionally fixed and must not change between
 * phases so that results remain comparable.
 */
export const CANARY_TRACE: readonly CanaryStep[] = [
	// Phase 1: Type a function declaration
	{ type: 'type', text: 'function canary() {' },
	{ type: 'newline' },

	// Phase 2: Type a variable assignment
	{ type: 'type', text: '\tconst result = [];' },
	{ type: 'newline' },

	// Phase 3: Type a for loop
	{ type: 'type', text: '\tfor (let i = 0; i < 10; i++) {' },
	{ type: 'newline' },
	{ type: 'type', text: '\t\tresult.push(i * 2);' },
	{ type: 'newline' },
	{ type: 'type', text: '\t}' },
	{ type: 'newline' },

	// Phase 4: Correct a mistake — delete and retype
	{ type: 'backspace', count: 1 }, // remove the newline
	{ type: 'newline' },

	// Phase 5: Type the return and closing brace
	{ type: 'type', text: '\treturn result;' },
	{ type: 'newline' },
	{ type: 'type', text: '}' },

	// Phase 6: Wait for paint to settle
	{ type: 'wait-frames', count: 3 },

	// Phase 7: Burst typing — fast sequence without pauses
	{ type: 'newline' },
	{ type: 'newline' },
	{ type: 'type', text: '// canary sentinel: abcdefghijklmnop' },

	// Final settle
	{ type: 'wait-frames', count: 3 },
] as const

/** Total number of individual keystrokes in the canary trace. */
export const CANARY_KEYSTROKE_COUNT = CANARY_TRACE.reduce((sum, step) => {
	switch (step.type) {
		case 'type':
			return sum + step.text.length
		case 'newline':
			return sum + 1
		case 'backspace':
			return sum + step.count
		case 'wait-frames':
			return sum
	}
}, 0)
