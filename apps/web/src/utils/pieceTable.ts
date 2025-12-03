import { trackMicro } from '~/perf'

export type PieceBufferId = 'original' | 'add'

export type Piece = {
	buffer: PieceBufferId
	start: number
	length: number
}

export type PieceTableSnapshot = {
	buffers: {
		original: string
		add: string
	}
	pieces: Piece[]
}

const _createPieceTableSnapshot = (original: string): PieceTableSnapshot => ({
	buffers: {
		original,
		add: ''
	},
	pieces: original.length
		? [
				{
					buffer: 'original',
					start: 0,
					length: original.length
				}
			]
		: []
})

export const getPieceTableLength = (snapshot: PieceTableSnapshot): number =>
	snapshot.pieces.reduce((sum, piece) => sum + piece.length, 0)

const bufferFor = (snapshot: PieceTableSnapshot, piece: Piece): string =>
	piece.buffer === 'original' ? snapshot.buffers.original : snapshot.buffers.add

const _getPieceTableText = (
	snapshot: PieceTableSnapshot,
	start = 0,
	end?: number
): string => {
	const length = getPieceTableLength(snapshot)
	const effectiveEnd = end ?? length
	if (start < 0 || effectiveEnd < start || effectiveEnd > length) {
		throw new RangeError('invalid range')
	}

	let result = ''
	let pos = 0

	for (const piece of snapshot.pieces) {
		const pieceEnd = pos + piece.length

		if (pieceEnd <= start) {
			pos = pieceEnd
			continue
		}

		if (pos >= effectiveEnd) break

		const pieceLocalStart = Math.max(0, start - pos)
		const pieceLocalEnd = Math.min(piece.length, effectiveEnd - pos)
		const buf = bufferFor(snapshot, piece)

		result += buf.slice(
			piece.start + pieceLocalStart,
			piece.start + pieceLocalEnd
		)

		pos = pieceEnd
	}

	return result
}

type PieceLocation = { index: number; innerOffset: number }

const findPiece = (
	snapshot: PieceTableSnapshot,
	offset: number
): PieceLocation => {
	let pos = 0

	for (let i = 0; i < snapshot.pieces.length; i++) {
		const piece = snapshot.pieces[i]!
		if (offset <= pos + piece.length) {
			return { index: i, innerOffset: offset - pos }
		}
		pos += piece.length
	}

	return { index: snapshot.pieces.length, innerOffset: 0 }
}

const _insertIntoPieceTable = (
	snapshot: PieceTableSnapshot,
	offset: number,
	text: string
): PieceTableSnapshot => {
	if (text.length === 0) return snapshot

	const length = getPieceTableLength(snapshot)
	if (offset < 0 || offset > length) {
		throw new RangeError('invalid offset')
	}

	const addStart = snapshot.buffers.add.length
	const nextAdd = snapshot.buffers.add + text

	const newPiece: Piece = {
		buffer: 'add',
		start: addStart,
		length: text.length
	}

	if (snapshot.pieces.length === 0) {
		return {
			buffers: {
				original: snapshot.buffers.original,
				add: nextAdd
			},
			pieces: [newPiece]
		}
	}

	if (offset === length) {
		return {
			buffers: {
				original: snapshot.buffers.original,
				add: nextAdd
			},
			pieces: [...snapshot.pieces, newPiece]
		}
	}

	const { index, innerOffset } = findPiece(snapshot, offset)
	const target = snapshot.pieces[index]

	const newPieces: Piece[] = []

	for (let i = 0; i < index; i++) {
		newPieces.push(snapshot.pieces[i]!)
	}

	if (target) {
		if (innerOffset > 0) {
			newPieces.push({
				buffer: target.buffer,
				start: target.start,
				length: innerOffset
			})
		}

		newPieces.push(newPiece)

		const rightLen = target.length - innerOffset
		if (rightLen > 0) {
			newPieces.push({
				buffer: target.buffer,
				start: target.start + innerOffset,
				length: rightLen
			})
		}

		for (let i = index + 1; i < snapshot.pieces.length; i++) {
			newPieces.push(snapshot.pieces[i]!)
		}
	} else {
		newPieces.push(newPiece)
	}

	return {
		buffers: {
			original: snapshot.buffers.original,
			add: nextAdd
		},
		pieces: newPieces
	}
}

const _deleteFromPieceTable = (
	snapshot: PieceTableSnapshot,
	offset: number,
	length: number
): PieceTableSnapshot => {
	if (length <= 0) return snapshot

	const totalLength = getPieceTableLength(snapshot)
	if (offset < 0 || offset + length > totalLength) {
		throw new RangeError('invalid range')
	}

	const newPieces: Piece[] = []
	let pos = 0
	const delStart = offset
	const delEnd = offset + length

	for (const piece of snapshot.pieces) {
		const pieceStart = pos
		const pieceEnd = pos + piece.length

		if (pieceEnd <= delStart || pieceStart >= delEnd) {
			newPieces.push(piece)
		} else {
			const leftKeep = Math.max(0, delStart - pieceStart)
			const rightKeep = Math.max(0, pieceEnd - delEnd)

			if (leftKeep > 0) {
				newPieces.push({
					buffer: piece.buffer,
					start: piece.start,
					length: leftKeep
				})
			}

			if (rightKeep > 0) {
				newPieces.push({
					buffer: piece.buffer,
					start: piece.start + piece.length - rightKeep,
					length: rightKeep
				})
			}
		}

		pos = pieceEnd
	}

	return {
		buffers: {
			original: snapshot.buffers.original,
			add: snapshot.buffers.add
		},
		pieces: newPieces
	}
}

export const debugPieceTable = (snapshot: PieceTableSnapshot) =>
	snapshot.pieces.map(piece => ({ ...piece }))

const PIECE_TABLE_TIMING_THRESHOLD = 1

export const createPieceTableSnapshot = (
	original: string
): PieceTableSnapshot =>
	trackMicro('pieceTable:create', () => _createPieceTableSnapshot(original), {
		metadata: { length: original.length },
		threshold: PIECE_TABLE_TIMING_THRESHOLD
	})

export const getPieceTableText = (
	snapshot: PieceTableSnapshot,
	start = 0,
	end?: number
): string =>
	trackMicro(
		'pieceTable:getText',
		() => _getPieceTableText(snapshot, start, end),
		{
			metadata: { pieces: snapshot.pieces.length },
			threshold: PIECE_TABLE_TIMING_THRESHOLD
		}
	)

export const insertIntoPieceTable = (
	snapshot: PieceTableSnapshot,
	offset: number,
	text: string
): PieceTableSnapshot =>
	trackMicro(
		'pieceTable:insert',
		() => _insertIntoPieceTable(snapshot, offset, text),
		{
			metadata: { insertLength: text.length },
			threshold: PIECE_TABLE_TIMING_THRESHOLD
		}
	)

export const deleteFromPieceTable = (
	snapshot: PieceTableSnapshot,
	offset: number,
	length: number
): PieceTableSnapshot =>
	trackMicro(
		'pieceTable:delete',
		() => _deleteFromPieceTable(snapshot, offset, length),
		{
			metadata: { deleteLength: length },
			threshold: PIECE_TABLE_TIMING_THRESHOLD
		}
	)
