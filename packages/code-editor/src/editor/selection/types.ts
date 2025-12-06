import type { Accessor } from 'solid-js'
import type { VirtualItem } from '@tanstack/virtual-core'
import type { SelectionRange } from '../cursor'
import type { LineEntry } from '../'

export type SelectionLayerProps = {
	selections: Accessor<SelectionRange[]>
	lineEntries: Accessor<LineEntry[]>
	virtualItems: Accessor<VirtualItem[]>
	lineHeight: Accessor<number>
	lineNumberWidth: number
	paddingLeft: number
	charWidth: Accessor<number>
	tabSize: Accessor<number>
	getColumnOffset: (lineIndex: number, columnIndex: number) => number
	getLineY: (lineIndex: number) => number
}

export type SelectionRect = {
	x: number
	y: number
	width: number
	height: number
}

export type WhitespaceMarker = {
	key: string
	x: number
	y: number
	type: 'tab' | 'space'
	align: 'left' | 'center'
}

export type SelectionBounds = {
	start: number
	end: number
}
