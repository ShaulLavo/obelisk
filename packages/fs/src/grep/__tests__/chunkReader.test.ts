import { describe, it, expect } from 'vitest'
import { streamChunksWithOverlap } from '../chunkReader'

describe('chunkReader', () => {
	it('should process chunks with overlap correctly', async () => {
		const chunkSize = 10
		const overlapSize = 5
		const data = new Uint8Array(20).map((_, i) => i)

		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(data)
				controller.close()
			},
		})

		const chunks = []
		for await (const chunk of streamChunksWithOverlap(
			stream,
			chunkSize,
			overlapSize
		)) {
			chunks.push(chunk)
		}

		// Expected behavior:
		// 1. Chunk 0-9 (first chunk, advance 10)
		// 2. Chunk 10-19 (next chunk, advance 5)
		// 3. Chunk 15-19 (remainder)
		expect(chunks.length).toBe(3)
		expect(chunks[0]!.chunk).toEqual(
			new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
		)
		expect(chunks[1]!.chunk).toEqual(
			new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
		)
		expect(chunks[2]!.chunk).toEqual(new Uint8Array([15, 16, 17, 18, 19]))
	})

	it('should prevent infinite loop by clamping overlapSize', async () => {
		// This test ensures that if overlapSize >= chunkSize, it doesn't hang.
		const chunkSize = 10
		const overlapSize = 10 // Invalid: >= chunkSize
		const data = new Uint8Array(20).map((_, i) => i)

		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(data)
				controller.close()
			},
		})

		const chunks = []
		// If the fix is not working, this loop will hang indefinitely
		// We add a simplified timeout capability by limiting iterations if needed,
		// but typically vitest will timeout the test.
		let count = 0
		for await (const chunk of streamChunksWithOverlap(
			stream,
			chunkSize,
			overlapSize
		)) {
			chunks.push(chunk)
			count++
			if (count > 100) throw new Error('Infinite loop detected')
		}

		// With clamping overlapSize becomes 9.
		// 1. Chunk 0-9. Advance 10. Buffer 10-19.
		// 2. Chunk 10-19. Advance 10-9 = 1. Buffer 11-19.
		// 3. Remainder 11-19.
		expect(chunks.length).toBe(3)
		expect(chunks[0]!.chunk).toEqual(
			new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
		)
		expect(chunks[1]!.chunk).toEqual(
			new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
		)
		expect(chunks[2]!.chunk).toEqual(
			new Uint8Array([11, 12, 13, 14, 15, 16, 17, 18, 19])
		)
	})
})
