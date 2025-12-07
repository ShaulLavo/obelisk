import type { VirtualItem, Virtualizer } from '@tanstack/virtual-core'
import type { Accessor } from 'solid-js'
import type { ParseResult } from '@repo/utils/parse'
import type { PieceTableSnapshot } from '@repo/utils'

export type CursorMode = 'regular' | 'terminal'

export type EditorAreaRegistration = (
	resolver: () => HTMLElement | null
) => (() => void) | void

export type TextEditorDocument = {
	filePath: Accessor<string | undefined>
	content: Accessor<string>
	pieceTable: Accessor<PieceTableSnapshot | undefined>
	updatePieceTable: (
		updater: (
			current: PieceTableSnapshot | undefined
		) => PieceTableSnapshot | undefined
	) => void
	isEditable: Accessor<boolean>
}

export type EditorProps = {
	document: TextEditorDocument
	isFileSelected: Accessor<boolean>
	stats: Accessor<ParseResult | undefined>
	fontSize: Accessor<number>
	fontFamily: Accessor<string>
	cursorMode: Accessor<CursorMode>
	tabSize?: Accessor<number>
	registerEditorArea?: EditorAreaRegistration
	previewBytes?: Accessor<Uint8Array | undefined>
	activeScopes?: Accessor<string[]>
}

export type LineEntry = {
	index: number
	start: number
	length: number
	text: string
}

export type LineProps = {
	rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
	virtualRow: VirtualItem
	entry: LineEntry
	lineHeight: number
	contentWidth: number
	charWidth: number
	tabSize: number
	onRowClick: (entry: LineEntry) => void
	onPreciseClick: (lineIndex: number, column: number, shiftKey?: boolean) => void
	onMouseDown?: (
		event: MouseEvent,
		lineIndex: number,
		column: number,
		textElement: HTMLElement | null
	) => void
	isActive: boolean
}

export type LinesProps = {
	rows: Accessor<VirtualItem[]>
	contentWidth: Accessor<number>
	rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
	lineHeight: Accessor<number>
	charWidth: Accessor<number>
	tabSize: Accessor<number>
	onRowClick: (entry: LineEntry) => void
	onPreciseClick: (lineIndex: number, column: number, shiftKey?: boolean) => void
	onMouseDown?: (
		event: MouseEvent,
		lineIndex: number,
		column: number,
		textElement: HTMLElement | null
	) => void
	activeLineIndex: Accessor<number | null>
}

export type LineGuttersProps = {
	rows: Accessor<VirtualItem[]>
	lineHeight: Accessor<number>
	onRowClick: (entry: LineEntry) => void
	activeLineIndex: Accessor<number | null>
}

export type TextFileEditorProps = EditorProps
