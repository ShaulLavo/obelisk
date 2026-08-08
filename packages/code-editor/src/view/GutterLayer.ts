/**
 * GutterLayer — imperative DOM layer for line numbers and gutter decorations.
 *
 * Part of the same bounded visible-range renderer as TextLayer.
 * Not a separately reactive component tree.
 */

import type { EditorMetrics } from './domMetrics'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GutterRow = {
	element: HTMLElement
	lineIndex: number | null
	isActive: boolean
}

export type GutterLayerState = {
	container: HTMLElement
	rows: GutterRow[]
	gutterWidth: number
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createGutterLayer = (parent: HTMLElement): GutterLayerState => {
	const container = document.createElement('div')
	container.className = 'editor-gutter-layer'
	container.style.position = 'absolute'
	container.style.left = '0'
	container.style.top = '0'
	container.style.bottom = '0'
	container.style.overflow = 'hidden'
	container.style.userSelect = 'none'
	parent.appendChild(container)

	return { container, rows: [], gutterWidth: 0 }
}

// ---------------------------------------------------------------------------
// Compute gutter width from line count
// ---------------------------------------------------------------------------

export const computeGutterWidth = (lineCount: number, charWidth: number): number => {
	const digits = Math.max(2, String(lineCount).length)
	// padding: 1ch left, 2ch right
	return (digits + 3) * charWidth
}

// ---------------------------------------------------------------------------
// Ensure pool
// ---------------------------------------------------------------------------

const ensurePoolSize = (state: GutterLayerState, poolSize: number): void => {
	while (state.rows.length < poolSize) {
		const el = document.createElement('div')
		el.className = 'editor-gutter-row'
		el.style.position = 'absolute'
		el.style.left = '0'
		el.style.right = '0'
		el.style.textAlign = 'right'
		el.style.paddingRight = '1em'
		el.style.whiteSpace = 'pre'
		el.style.display = 'none'
		state.container.appendChild(el)
		state.rows.push({ element: el, lineIndex: null, isActive: false })
	}

	for (let i = poolSize; i < state.rows.length; i++) {
		state.rows[i]!.element.style.display = 'none'
		state.rows[i]!.lineIndex = null
	}
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export type GutterUpdateResult = {
	gutterUpdated: boolean
}

export const updateGutterLayer = (
	state: GutterLayerState,
	startLine: number,
	endLine: number,
	activeLine: number,
	totalLines: number,
	metrics: EditorMetrics
): GutterUpdateResult => {
	const lineCount = endLine - startLine
	ensurePoolSize(state, lineCount)

	// Update gutter width
	const newWidth = computeGutterWidth(totalLines, metrics.charWidth)
	let gutterUpdated = false
	if (newWidth !== state.gutterWidth) {
		state.gutterWidth = newWidth
		state.container.style.width = `${newWidth}px`
		gutterUpdated = true
	}

	for (let i = 0; i < lineCount; i++) {
		const lineIndex = startLine + i
		const row = state.rows[i]!
		const isActive = lineIndex === activeLine

		if (row.lineIndex !== lineIndex || row.isActive !== isActive) {
			row.element.textContent = String(lineIndex + 1)
			row.lineIndex = lineIndex
			row.isActive = isActive
			gutterUpdated = true

			if (isActive) {
				row.element.classList.add('editor-gutter-active')
			} else {
				row.element.classList.remove('editor-gutter-active')
			}
		}

		const y = lineIndex * metrics.lineHeight
		row.element.style.transform = `translateY(${y}px)`
		row.element.style.height = `${metrics.lineHeight}px`
		row.element.style.display = ''
	}

	for (let i = lineCount; i < state.rows.length; i++) {
		state.rows[i]!.element.style.display = 'none'
		state.rows[i]!.lineIndex = null
	}

	return { gutterUpdated }
}

// ---------------------------------------------------------------------------
// Destroy
// ---------------------------------------------------------------------------

export const destroyGutterLayer = (state: GutterLayerState): void => {
	state.container.remove()
	state.rows.length = 0
}
