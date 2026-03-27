import { expose } from 'comlink'
import {
	findPatternInChunk,
	findPatternInChunkCaseInsensitive,
	countByte,
	findByteForward,
	findByteBackward,
} from './byteSearch'
import { streamChunksWithOverlap } from './chunkReader'
import { extractLine, isBinaryChunk } from './lineExtractor'
import type { GrepFileTask, GrepFileResult, GrepMatch } from './types'

const NEWLINE = 0x0a

async function grepFile(task: GrepFileTask): Promise<GrepFileResult> {
	const { fileHandle, path, patternBytes, chunkSize, options } = task
	const matches: GrepMatch[] = []
	let matchCount = 0
	let bytesScanned = 0

	try {
		const file = await fileHandle.getFile()
		if (file.size === 0) {
			return { path, matches, bytesScanned: 0, matchCount: 0 }
		}

		const searchFn = options.caseInsensitive
			? findPatternInChunkCaseInsensitive
			: findPatternInChunk

		const stream = file.stream()
		const overlapSize = Math.max(0, patternBytes.length - 1)
		const effectiveChunkSize = Math.max(chunkSize, patternBytes.length * 4)

		let isFirstChunk = true
		let prevChunkLineCount = 0

		for await (const { chunk, isLast } of streamChunksWithOverlap(
			stream,
			effectiveChunkSize,
			overlapSize
		)) {
			if (isFirstChunk && isBinaryChunk(chunk)) {
				return {
					path,
					matches: [],
					bytesScanned: chunk.length,
					error: 'binary',
				}
			}

			const bytesToAdd = isFirstChunk
				? chunk.length
				: Math.max(0, chunk.length - overlapSize)
			bytesScanned += bytesToAdd

			const offsets = searchFn(chunk, patternBytes)
			const validOffsets: number[] = []

			for (const offset of offsets) {
				if (!isFirstChunk && offset + patternBytes.length <= overlapSize) {
					continue
				}

				if (options.wordRegexp) {
					if (offset > 0 && isWordByte(chunk[offset - 1]!)) continue
					const afterIdx = offset + patternBytes.length
					if (afterIdx < chunk.length && isWordByte(chunk[afterIdx]!)) continue
				}

				validOffsets.push(offset)
			}

			if (options.invertMatch) {
				const invertResult = collectInvertedMatches(
					chunk, validOffsets, prevChunkLineCount, isLast, path, options
				)
				matchCount += invertResult.countOnly
				matches.push(...invertResult.matches)
			} else {
				for (const offset of validOffsets) {
					if (options.count) { matchCount++; continue }
					if (options.filesWithMatches && matches.length > 0) break

					matches.push(buildMatch(chunk, offset, prevChunkLineCount, patternBytes, path, options))
				}
			}

			if (!isLast) {
				const countEnd = chunk.length - overlapSize
				prevChunkLineCount += countByte(chunk, NEWLINE, 0, countEnd)
			}

			isFirstChunk = false
		}

		return {
			path,
			matches,
			matchCount: options.count ? matchCount : matches.length,
			bytesScanned,
		}
	} catch (error) {
		return {
			path,
			matches: [],
			bytesScanned,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}

function lineOverlapsAnyOffset(offsets: number[], lineStart: number, lineEnd: number): boolean {
	for (const off of offsets) {
		if (off >= lineStart && off < lineEnd) return true
	}
	return false
}

function collectInvertedMatches(
	chunk: Uint8Array,
	validOffsets: number[],
	prevChunkLineCount: number,
	isLast: boolean,
	path: string,
	options: GrepFileTask['options']
): { countOnly: number; matches: GrepMatch[] } {
	const matches: GrepMatch[] = []
	let countOnly = 0
	let lineStart = 0
	let currentLineNum = prevChunkLineCount

	while (lineStart < chunk.length) {
		const lineEnd = findByteForward(chunk, NEWLINE, lineStart)
		if (lineEnd === chunk.length && !isLast) break

		if (!lineOverlapsAnyOffset(validOffsets, lineStart, lineEnd)) {
			if (options.count) {
				countOnly++
			} else {
				const contentBytes = chunk.slice(lineStart, lineEnd)
				const lineContent = new TextDecoder().decode(contentBytes)
				matches.push({
					path,
					lineNumber: currentLineNum + 1,
					lineContent: options.maxColumnsPreview
						? truncateLine(lineContent, options.maxColumnsPreview)
						: lineContent.trim(),
					matchStart: 0,
				})
			}
		}

		lineStart = lineEnd + 1
		currentLineNum++
	}

	return { countOnly, matches }
}

function buildMatch(
	chunk: Uint8Array,
	offset: number,
	prevChunkLineCount: number,
	patternBytes: Uint8Array,
	path: string,
	options: GrepFileTask['options']
): GrepMatch {
	const lineInfo = extractLine(chunk, offset, prevChunkLineCount)

	let context = undefined
	const ctxBefore = options.context ?? options.contextBefore ?? 0
	const ctxAfter = options.context ?? options.contextAfter ?? 0
	if (ctxBefore > 0 || ctxAfter > 0) {
		context = extractContext(chunk, lineInfo.lineNumber, offset, ctxBefore, ctxAfter)
	}

	let content = lineInfo.lineContent.trim()
	if (options.maxColumnsPreview && content.length > options.maxColumnsPreview) {
		content = truncateLine(content, options.maxColumnsPreview)
	}
	if (options.onlyMatching) {
		content = new TextDecoder().decode(chunk.slice(offset, offset + patternBytes.length))
	}

	return {
		path,
		lineNumber: lineInfo.lineNumber,
		lineContent: content,
		matchStart: lineInfo.columnOffset,
		context,
	}
}

function isWordByte(byte: number): boolean {
	return (
		(byte >= 48 && byte <= 57) ||
		(byte >= 65 && byte <= 90) ||
		(byte >= 97 && byte <= 122) ||
		byte === 95
	)
}

function extractContext(
	chunk: Uint8Array,
	matchLineNum: number,
	matchOffset: number,
	before: number,
	after: number
) {
	const beforeLines: { lineNumber: number; content: string }[] = []
	const afterLines: { lineNumber: number; content: string }[] = []
	const decoder = new TextDecoder()

	if (before > 0) {
		let curr = matchOffset
		for (let i = 0; i < before; i++) {
			const prevNl = findByteBackward(chunk, NEWLINE, curr - 1)
			if (prevNl === -1) break
			const lineStart = findByteBackward(chunk, NEWLINE, prevNl - 1) + 1
			const lineEnd = prevNl
			const content = decoder.decode(chunk.slice(lineStart, lineEnd)).trim()
			beforeLines.unshift({ lineNumber: matchLineNum - 1 - i, content })
			curr = lineStart
			if (lineStart === 0) break
		}
	}

	if (after > 0) {
		let curr = findByteForward(chunk, NEWLINE, matchOffset)
		if (curr < chunk.length) {
			curr++
			for (let i = 0; i < after; i++) {
				if (curr >= chunk.length) break
				const lineEnd = findByteForward(chunk, NEWLINE, curr)
				const content = decoder.decode(chunk.slice(curr, lineEnd)).trim()
				afterLines.push({ lineNumber: matchLineNum + 1 + i, content })
				curr = lineEnd + 1
			}
		}
	}

	return { before: beforeLines, after: afterLines }
}

function truncateLine(line: string, max: number): string {
	if (line.length <= max) return line
	return line.slice(0, max) + '...'
}

async function grepBatch(tasks: GrepFileTask[]): Promise<GrepFileResult[]> {
	const results: GrepFileResult[] = []

	for (const task of tasks) {
		const result = await grepFile(task)
		results.push(result)
	}

	return results
}

async function grepBatchParallel(
	tasks: GrepFileTask[]
): Promise<GrepFileResult[]> {
	return Promise.all(tasks.map(grepFile))
}

export const workerApi = {
	grepFile,
	grepBatch,
	grepBatchParallel,
}

export type GrepWorkerApi = typeof workerApi

expose(workerApi)
