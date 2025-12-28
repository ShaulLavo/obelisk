import {
	createEffect,
	createSignal,
	on,
	onCleanup,
	type Accessor,
} from 'solid-js'
import type {
	VirtualItem2D,
	LineEntry,
	LineHighlightSegment,
	LineBracketDepthMap,
} from '../types'
import type {
	VisibleContentSnapshot,
	CachedLineRender,
} from '../types/visibleContentCache'
import {
	buildTextRuns,
	normalizeHighlightSegments,
} from '../line/utils/textRuns'

export type UseVisibleContentCacheOptions = {
	/** File path for the current document */
	filePath: Accessor<string | undefined>
	/** Current scroll element for dimensions */
	scrollElement: Accessor<HTMLElement | null>
	/** Virtual items representing visible rows */
	virtualItems: Accessor<VirtualItem2D[]>
	/** Resolve a virtual row to the actual line index */
	resolveLineIndex?: (item: VirtualItem2D) => number
	/** Get line entry for a given line index */
	getLineEntry: (lineIndex: number) => LineEntry | null
	/** Get bracket depths for a line entry */
	getLineBracketDepths: (entry: LineEntry) => LineBracketDepthMap | undefined
	/** Get highlight segments for a line entry */
	getLineHighlights: (entry: LineEntry) => LineHighlightSegment[] | undefined
	/** Initial visible content snapshot to restore */
	initialVisibleContent?: Accessor<VisibleContentSnapshot | undefined>
	/** Callback to save visible content on tab switch */
	onCaptureVisibleContent?: (snapshot: VisibleContentSnapshot) => void
}

/**
 * Captures visible content TextRuns when switching away from a file,
 * and provides the cached content for instant initial rendering.
 */
export const useVisibleContentCache = (
	options: UseVisibleContentCacheOptions
) => {
	// Use a signal so that changes trigger reactive updates
	const [hasLiveContent, setHasLiveContent] = createSignal(false)

	/**
	 * Capture the current visible content as a snapshot.
	 */
	const captureVisibleContent = (): VisibleContentSnapshot | undefined => {
		const element = options.scrollElement()
		const items = options.virtualItems()

		if (!element || items.length === 0) {
			return undefined
		}

		const lines: CachedLineRender[] = []

		for (const item of items) {
			const lineIndex = options.resolveLineIndex
				? options.resolveLineIndex(item)
				: item.index
			const entry = options.getLineEntry(lineIndex)
			if (!entry) continue

			const bracketDepths = options.getLineBracketDepths(entry)
			const highlightSegments = options.getLineHighlights(entry)
			const normalizedHighlights = normalizeHighlightSegments(
				highlightSegments,
				entry.text.length
			)

			const runs = buildTextRuns(
				entry.text,
				bracketDepths,
				normalizedHighlights,
				item.columnStart,
				item.columnEnd
			)

			lines.push({
				lineId: entry.lineId,
				lineIndex,
				columnStart: item.columnStart,
				columnEnd: item.columnEnd,
				runs,
			})
		}

		return {
			scrollTop: element.scrollTop,
			scrollLeft: element.scrollLeft,
			viewportHeight: element.clientHeight,
			viewportWidth: element.clientWidth,
			lines,
		}
	}

	/**
	 * Called when we have live content and should mark the cache as stale.
	 */
	const markLiveContentAvailable = () => {
		setHasLiveContent(true)
	}

	// Capture visible content when switching away from a file
	createEffect(
		on(
			() => options.filePath(),
			(currentPath, previousPath) => {
				// When path changes, capture the previous file's content
				if (previousPath && previousPath !== currentPath && hasLiveContent()) {
					const snapshot = captureVisibleContent()
					if (snapshot && options.onCaptureVisibleContent) {
						options.onCaptureVisibleContent(snapshot)
					}
				}

				// Reset state for new file
				setHasLiveContent(false)
			}
		)
	)

	// Capture on unmount
	onCleanup(() => {
		const path = options.filePath()
		if (path && hasLiveContent() && options.onCaptureVisibleContent) {
			const snapshot = captureVisibleContent()
			if (snapshot) {
				options.onCaptureVisibleContent(snapshot)
			}
		}
	})
	/**
	 * Get cached TextRuns for a specific line if available.
	 * Returns undefined if:
	 * - Not in cache
	 * - Cache doesn't match the column range
	 * - Live content is available (highlights have loaded)
	 */
	const getCachedRuns = (
		lineIndex: number,
		columnStart: number,
		columnEnd: number,
		lineId?: number
	) => {
		// Once live content (highlights) is available, stop using cached runs
		// This ensures freshly computed highlights are used instead of stale cache
		if (hasLiveContent()) return undefined

		const cache = options.initialVisibleContent?.()
		if (!cache) return undefined

		const cached = cache.lines.find((line) => {
			if (lineId && lineId > 0 && line.lineId === lineId) {
				return (
					line.columnStart === columnStart && line.columnEnd === columnEnd
				)
			}

			return (
				line.lineIndex === lineIndex &&
				line.columnStart === columnStart &&
				line.columnEnd === columnEnd
			)
		})
		return cached?.runs
	}

	return {
		captureVisibleContent,
		markLiveContentAvailable,
		getCachedRuns,
		/** Get initial visible content for the current file */
		getInitialVisibleContent: () => options.initialVisibleContent?.(),
	}
}
