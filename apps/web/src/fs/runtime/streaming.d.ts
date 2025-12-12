import type { FsSource } from '../types'
export type SafeReadOptions = {
	sizeLimitBytes?: number
	chunkSize?: number
}
export type SafeReadResult = {
	text: string
	truncated: boolean
	totalSize?: number
}
export type FileTextStreamOptions = {
	chunkSize?: number
}
export type FileTextChunk = {
	done: boolean
	chunk?: string
	offset: number
	bytesRead: number
}
export type FileTextStream = {
	getSize(): Promise<number>
	readNext(): Promise<FileTextChunk>
	readAt(offset: number): Promise<FileTextChunk>
	close(): Promise<void>
}
export declare function resetStreamingState(): void
export declare function cancelOtherStreams(keepPath: string): void
export declare function readFileText(
	source: FsSource,
	path: string
): Promise<string>
export declare function readFileBuffer(
	source: FsSource,
	path: string
): Promise<ArrayBuffer>
export declare function getFileSize(
	source: FsSource,
	path: string
): Promise<number>
export declare function readFilePreviewBytes(
	source: FsSource,
	path: string,
	maxBytes?: number
): Promise<Uint8Array>
export declare function safeReadFileText(
	source: FsSource,
	path: string,
	options?: SafeReadOptions
): Promise<SafeReadResult>
export declare function createFileTextStream(
	source: FsSource,
	path: string,
	options?: FileTextStreamOptions
): Promise<FileTextStream>
export declare function streamFileText(
	source: FsSource,
	path: string,
	onChunk?: (text: string) => void
): Promise<string>
//# sourceMappingURL=streaming.d.ts.map
