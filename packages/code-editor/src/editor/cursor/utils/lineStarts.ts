import { type PieceTableSnapshot } from '@repo/utils'

export const buildLineStartsFromText = (text: string): number[] => {
	const starts: number[] = [0]
	let index = text.indexOf('\n')

	while (index !== -1) {
		starts.push(index + 1)
		index = text.indexOf('\n', index + 1)
	}

	return starts
}

export const buildLineStartsFromSnapshot = (
	snapshot: PieceTableSnapshot
): number[] => {
	const starts: number[] = [0]
	if (snapshot.length === 0 || !snapshot.root) return starts

	type Node = NonNullable<typeof snapshot.root>

	const stack: Node[] = []
	let node: Node | null = snapshot.root
	let docOffset = 0

	while (node || stack.length > 0) {
		while (node) {
			stack.push(node)
			node = node.left
		}

		const current = stack.pop()
		if (!current) break

		const piece = current.piece
		const buffer =
			piece.buffer === 'original'
				? snapshot.buffers.original
				: snapshot.buffers.add
		const pieceStart = piece.start
		const pieceEnd = piece.start + piece.length

		let searchFrom = pieceStart
		while (searchFrom < pieceEnd) {
			const idx = buffer.indexOf('\n', searchFrom)
			if (idx === -1 || idx >= pieceEnd) break
			starts.push(docOffset + (idx - pieceStart) + 1)
			searchFrom = idx + 1
		}

		docOffset += piece.length
		node = current.right
	}

	return starts
}

/**
 * Fast-path for inserting a single newline with no deletion.
 * Common case: pressing Enter key.
 */
export const insertSingleNewlineToLineStarts = (
	lineStarts: number[],
	startIndex: number
): number[] => {
	const len = lineStarts.length
	const newLineStart = startIndex + 1

	// Binary search for insertion point
	let lo = 0
	let hi = len
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (lineStarts[mid]! <= startIndex) {
			lo = mid + 1
		} else {
			hi = mid
		}
	}
	const insertAt = lo

	// Pre-allocate and fill
	const result = new Array<number>(len + 1)
	for (let i = 0; i < insertAt; i++) {
		result[i] = lineStarts[i]!
	}
	result[insertAt] = newLineStart
	for (let i = insertAt; i < len; i++) {
		result[i + 1] = lineStarts[i]! + 1
	}
	return result
}

export const applyEditToLineStarts = (
	lineStarts: number[],
	startIndex: number,
	deletedText: string,
	insertedText: string
): number[] => {
	const len = lineStarts.length
	if (len === 0) return lineStarts

	// Fast path for single newline insertion (Enter key)
	if (insertedText === '\n' && deletedText.length === 0) {
		return insertSingleNewlineToLineStarts(lineStarts, startIndex)
	}

	const deletedLength = deletedText.length
	const insertedLength = insertedText.length
	const delta = insertedLength - deletedLength
	const oldEnd = startIndex + deletedLength

	// Binary search for startLineIndex (last line starting at or before startIndex)
	let low = 0
	let high = len - 1
	let startLineIndex = 0
	while (low <= high) {
		const mid = (low + high) >> 1
		if ((lineStarts[mid] ?? 0) <= startIndex) {
			startLineIndex = mid
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	// Binary search for firstAfterDeletion (first line starting after oldEnd)
	low = 0
	high = len
	let firstAfterDeletion = len
	while (low < high) {
		const mid = (low + high) >> 1
		if ((lineStarts[mid] ?? 0) > oldEnd) {
			firstAfterDeletion = mid
			high = mid
		} else {
			low = mid + 1
		}
	}

	// Count newlines in inserted text to pre-allocate
	let insertedNewlines = 0
	let searchPos = 0
	while ((searchPos = insertedText.indexOf('\n', searchPos)) !== -1) {
		insertedNewlines++
		searchPos++
	}

	// Calculate final array size and pre-allocate
	const keepCount = startLineIndex + 1
	const tailCount = len - firstAfterDeletion
	const resultLen = keepCount + insertedNewlines + tailCount
	const result = new Array<number>(resultLen)

	// Copy preserved prefix directly
	for (let i = 0; i < keepCount; i++) {
		result[i] = lineStarts[i]!
	}

	// Fill in new line starts from inserted text
	let writeIdx = keepCount
	let nlIdx = insertedText.indexOf('\n')
	while (nlIdx !== -1) {
		result[writeIdx++] = startIndex + nlIdx + 1
		nlIdx = insertedText.indexOf('\n', nlIdx + 1)
	}

	// Copy and adjust tail
	for (let i = firstAfterDeletion; i < len; i++) {
		result[writeIdx++] = (lineStarts[i] ?? 0) + delta
	}

	return result
}
