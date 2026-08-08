/**
 * Line ID allocation — monotonic, never recycled.
 *
 * Line IDs are the stable identity for rows and decorations.
 * They survive edits that shift line positions but don't destroy the line.
 * Undo/redo creates fresh IDs for resurrected lines.
 */

/**
 * Creates a line ID generator with monotonic allocation.
 * IDs start at `startId` and increment forever.
 */
export const createLineIdAllocator = (startId = 1) => {
	let nextId = startId

	return {
		/** Allocate `count` new sequential line IDs. */
		allocate(count: number): number[] {
			const ids = new Array<number>(Math.max(0, count))
			for (let i = 0; i < ids.length; i++) {
				ids[i] = nextId++
			}
			return ids
		},

		/** Allocate a single line ID. */
		allocateOne(): number {
			return nextId++
		},

		/** Current next ID (for serialization/debugging). */
		peek(): number {
			return nextId
		},
	}
}

export type LineIdAllocator = ReturnType<typeof createLineIdAllocator>

/**
 * Build a line index-by-ID map for fast reverse lookups.
 */
export const buildLineIndexById = (
	lineIds: number[]
): Map<number, number> => {
	const map = new Map<number, number>()
	for (let i = 0; i < lineIds.length; i++) {
		const id = lineIds[i]
		if (typeof id === 'number') {
			map.set(id, i)
		}
	}
	return map
}

/**
 * Compute new line IDs after an edit that changes line count.
 *
 * - The start line keeps its ID (preserved)
 * - Deleted lines lose their IDs
 * - Inserted lines get fresh IDs
 */
export const computeLineIdsForEdit = (
	prevLineIds: number[],
	startLine: number,
	endLine: number,
	lineDelta: number,
	allocator: LineIdAllocator
): number[] => {
	const expectedCount = Math.max(0, prevLineIds.length + lineDelta)
	if (expectedCount === 0) return []
	if (prevLineIds.length === 0) return allocator.allocate(expectedCount)

	const maxIndex = prevLineIds.length - 1
	const safeStart = Math.max(0, Math.min(startLine, maxIndex))
	const safeEnd = Math.max(safeStart, Math.min(endLine, maxIndex))
	const replacedCount = safeEnd - safeStart + 1
	const nextSegmentCount = Math.max(0, replacedCount + lineDelta)

	const before = prevLineIds.slice(0, safeStart)
	const after = prevLineIds.slice(safeEnd + 1)

	if (nextSegmentCount === 0) {
		const result = [...before, ...after]
		return result.length === expectedCount
			? result
			: allocator.allocate(expectedCount)
	}

	const preservedId = prevLineIds[safeStart] ?? allocator.allocateOne()
	const extraCount = Math.max(0, nextSegmentCount - 1)
	const addedIds = extraCount > 0 ? allocator.allocate(extraCount) : []
	const nextIds = [...before, preservedId, ...addedIds, ...after]

	return nextIds.length === expectedCount
		? nextIds
		: allocator.allocate(expectedCount)
}
