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

export const createPieceTableSnapshot = (
	original: string
): PieceTableSnapshot => ({
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
