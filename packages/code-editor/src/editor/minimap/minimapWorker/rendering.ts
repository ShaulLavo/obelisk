import type { MinimapTokenSummary, MinimapLayout } from './types'
import { Constants } from './constants'
import {
	createFontAtlas,
	getActiveAtlas,
	getAtlasScale,
	hasAtlas,
	getCharIndex,
} from './fontAtlas'
import {
	findDirtyLinesInRange,
	clearLines,
	getCachedImageData,
	setCachedImageData,
	getCachedScrollY,
	setCachedScrollY,
	getCachedScale,
	setCachedScale,
	getPreviousTokens,
	getPreviousMaxChars,
	getPreviousLineCount,
	getPreviousVersion,
	setPreviousState,
} from './partialRepaint'

// ============================================================================
// Waiter System for Tree-sitter Ready Notifications
// ============================================================================

const readyWaiters = new Map<string, Set<() => void>>()
let renderNonce = 0

export const incrementRenderNonce = (): number => ++renderNonce

export const getCurrentNonce = (): number => renderNonce

export const wakeWaiters = (path: string): void => {
	const waiters = readyWaiters.get(path)
	if (!waiters) return
	for (const wake of [...waiters]) wake()
}

export const waitForMinimapReady = (path: string, nonce: number) =>
	new Promise<boolean>((resolve) => {
		if (nonce !== renderNonce) return resolve(false)

		let waiters = readyWaiters.get(path)
		if (!waiters) {
			waiters = new Set()
			readyWaiters.set(path, waiters)
		}

		const wake = () => {
			waiters?.delete(wake)
			if (waiters && waiters.size === 0) readyWaiters.delete(path)
			resolve(nonce === renderNonce)
		}

		waiters.add(wake)
	})

export const clearWaiters = (): void => {
	readyWaiters.clear()
}

// ============================================================================
// Line Rendering
// ============================================================================

/**
 * Blit a single font atlas glyph into the destination buffer.
 */
const blitGlyph = (
	fontAtlas: Uint8Array | Uint8ClampedArray,
	dest: Uint8ClampedArray,
	atlasOffset: number,
	xStart: number,
	yStart: number,
	charW: number,
	charH: number,
	destWidth: number,
	deviceWidth: number,
	deviceHeight: number,
	foregroundAlpha: number,
	deltaR: number,
	deltaG: number,
	deltaB: number,
	bgR: number,
	bgG: number,
	bgB: number
): void => {
	let sourceIdx = atlasOffset
	let rowStart = yStart * destWidth + xStart * Constants.RGBA_CHANNELS_CNT

	for (let dy = 0; dy < charH; dy++) {
		const py = yStart + dy
		if (py >= deviceHeight) break
		if (py < 0) { rowStart += destWidth; sourceIdx += charW; continue }

		let destIdx = rowStart
		for (let dx = 0; dx < charW; dx++) {
			if (xStart + dx >= deviceWidth) { sourceIdx++; break }

			const c = (fontAtlas[sourceIdx++]! / 255) * (foregroundAlpha / 255)
			if (c > 0.02) {
				dest[destIdx] = bgR + deltaR * c
				dest[destIdx + 1] = bgG + deltaG * c
				dest[destIdx + 2] = bgB + deltaB * c
				dest[destIdx + 3] = Math.max(foregroundAlpha, 200)
			}
			destIdx += Constants.RGBA_CHANNELS_CNT
		}
		rowStart += destWidth
	}
}

/**
 * Render a single line
 */
export const renderLine = (
	line: number,
	tokens: Uint16Array,
	maxChars: number,
	dest: Uint8ClampedArray,
	charW: number,
	charH: number,
	pixelsPerChar: number,
	scale: number,
	deviceWidth: number,
	deviceHeight: number,
	palette: Uint32Array,
	scrollY: number,
	bgR: number,
	bgG: number,
	bgB: number
): void => {
	const yStart = Math.floor(line * charH - scrollY)
	if (yStart + charH < 0 || yStart >= deviceHeight) return

	const tokenOffset = line * maxChars
	const safeMaxChars = Math.min(maxChars, Math.ceil(deviceWidth / charW))
	const destWidth = deviceWidth * Constants.RGBA_CHANNELS_CNT
	const fontAtlas = getActiveAtlas()

	for (let char = 0; char < safeMaxChars; char++) {
		const val = tokens[tokenOffset + char]!
		const charCode = val & 0xff
		if (charCode <= 32) continue

		const colorId = val >> 8
		const rawColor = palette[colorId] ?? palette[0]!
		const foregroundAlpha = (rawColor >> 24) & 0xff
		const deltaR = (rawColor & 0xff) - bgR
		const deltaG = ((rawColor >> 8) & 0xff) - bgG
		const deltaB = ((rawColor >> 16) & 0xff) - bgB

		const atlasOffset = getCharIndex(charCode, scale) * pixelsPerChar
		const xStart = char * charW

		blitGlyph(
			fontAtlas, dest, atlasOffset, xStart, yStart,
			charW, charH, destWidth, deviceWidth, deviceHeight,
			foregroundAlpha, deltaR, deltaG, deltaB, bgR, bgG, bgB
		)
	}
}

// ============================================================================
// Full/Partial Render
// ============================================================================

const normalizeScrollY = (scrollY: number): number => {
	return Math.max(0, Math.round(scrollY))
}

const clearRowRange = (
	dest: Uint8ClampedArray,
	deviceWidth: number,
	startY: number,
	endY: number
): void => {
	const start = Math.max(0, startY)
	const end = Math.max(start, endY)

	if (start === end) return

	const rowBytes = deviceWidth * Constants.RGBA_CHANNELS_CNT
	dest.fill(0, start * rowBytes, end * rowBytes)
}

const blitForScrollDelta = (
	dest: Uint8ClampedArray,
	deviceWidth: number,
	deviceHeight: number,
	deltaY: number
): void => {
	const absDeltaY = Math.abs(deltaY)
	if (absDeltaY <= 0) return

	const rowBytes = deviceWidth * Constants.RGBA_CHANNELS_CNT
	const byteDelta = absDeltaY * rowBytes
	const totalBytes = deviceHeight * rowBytes

	if (absDeltaY >= deviceHeight) {
		dest.fill(0)
		return
	}

	// Scrolling down (deltaY > 0) moves pixels up.
	if (deltaY > 0) {
		dest.copyWithin(0, byteDelta, totalBytes)
		clearRowRange(dest, deviceWidth, deviceHeight - absDeltaY, deviceHeight)
		return
	}

	// Scrolling up (deltaY < 0) moves pixels down.
	dest.copyWithin(byteDelta, 0, totalBytes - byteDelta)
	clearRowRange(dest, deviceWidth, 0, absDeltaY)
}

const renderLinesIntersectingYRange = (
	summary: MinimapTokenSummary,
	dest: Uint8ClampedArray,
	charW: number,
	charH: number,
	pixelsPerChar: number,
	scale: number,
	deviceWidth: number,
	deviceHeight: number,
	palette: Uint32Array,
	scrollY: number,
	yStart: number,
	yEnd: number,
	bgR: number,
	bgG: number,
	bgB: number
): void => {
	const start = Math.max(0, Math.min(deviceHeight, yStart))
	const end = Math.max(start, Math.min(deviceHeight, yEnd))
	if (start === end) return

	const docYStart = scrollY + start
	const docYEnd = scrollY + end

	const startLine = Math.floor(docYStart / charH)
	const endLine = Math.floor((docYEnd - 1) / charH) + 1

	const firstLine = Math.max(0, startLine)
	const lastLine = Math.min(summary.lineCount, endLine)

	for (let line = firstLine; line < lastLine; line++) {
		renderLine(
			line,
			summary.tokens,
			summary.maxChars,
			dest,
			charW,
			charH,
			pixelsPerChar,
			scale,
			deviceWidth,
			deviceHeight,
			palette,
			scrollY,
			bgR,
			bgG,
			bgB
		)
	}
}

const fullRepaint = (
	summary: MinimapTokenSummary,
	ctx: OffscreenCanvasRenderingContext2D,
	deviceWidth: number,
	deviceHeight: number,
	charW: number,
	charH: number,
	pixelsPerChar: number,
	scale: number,
	palette: Uint32Array,
	scrollY: number,
	bgR: number,
	bgG: number,
	bgB: number
): ImageData => {
	const imageData = ctx.createImageData(deviceWidth, deviceHeight)

	const startLine = Math.max(0, Math.floor(scrollY / charH))
	const endLine = Math.min(
		summary.lineCount,
		Math.ceil((scrollY + deviceHeight) / charH)
	)

	for (let line = startLine; line < endLine; line++) {
		renderLine(
			line,
			summary.tokens,
			summary.maxChars,
			imageData.data,
			charW,
			charH,
			pixelsPerChar,
			scale,
			deviceWidth,
			deviceHeight,
			palette,
			scrollY,
			bgR,
			bgG,
			bgB
		)
	}

	return imageData
}

const patchDirtyLines = (
	summary: MinimapTokenSummary,
	ctx: OffscreenCanvasRenderingContext2D,
	imageData: ImageData,
	tokens: Uint16Array,
	maxChars: number,
	lineCount: number,
	startLine: number,
	endLine: number,
	visibleLineCount: number,
	charW: number,
	charH: number,
	pixelsPerChar: number,
	scale: number,
	deviceWidth: number,
	deviceHeight: number,
	palette: Uint32Array,
	scrollY: number,
	bgR: number,
	bgG: number,
	bgB: number
): ImageData => {
	const dirtyLines = findDirtyLinesInRange(tokens, maxChars, lineCount, startLine, endLine)

	if (dirtyLines.size > visibleLineCount * 0.3) {
		return fullRepaint(
			summary, ctx, deviceWidth, deviceHeight,
			charW, charH, pixelsPerChar, scale, palette, scrollY, bgR, bgG, bgB
		)
	}

	clearLines(imageData.data, dirtyLines, charH, scrollY, deviceWidth, deviceHeight)
	for (const line of dirtyLines) {
		renderLine(
			line, tokens, maxChars, imageData.data,
			charW, charH, pixelsPerChar, scale,
			deviceWidth, deviceHeight, palette, scrollY, bgR, bgG, bgB
		)
	}
	return imageData
}

/**
 * Render from binary token summary with partial repainting
 */
export const renderFromSummary = (
	summary: MinimapTokenSummary,
	ctx: OffscreenCanvasRenderingContext2D,
	layout: MinimapLayout,
	palette: Uint32Array,
	scrollY: number,
	bgR: number,
	bgG: number,
	bgB: number,
	forceFullRepaint = false
): void => {
	const { dpr, deviceWidth, deviceHeight } = layout.size
	const scale = Math.round(dpr)

	// Create atlas if needed
	if (!hasAtlas() || getAtlasScale() !== scale) {
		createFontAtlas('monospace', scale)
	}

	const { tokens, maxChars, lineCount } = summary

	const charW = Constants.BASE_CHAR_WIDTH * scale
	const charH = Constants.BASE_CHAR_HEIGHT * scale
	const pixelsPerChar = charW * charH
	const normalizedScrollY = normalizeScrollY(scrollY)

	const cachedImageData = getCachedImageData()
	const previousTokens = getPreviousTokens()
	const previousVersion = getPreviousVersion()
	const previousLineCount = getPreviousLineCount()
	const previousMaxChars = getPreviousMaxChars()

	const cacheMissing = !cachedImageData
	const cacheSizeChanged =
		!!cachedImageData &&
		(cachedImageData.width !== deviceWidth ||
			cachedImageData.height !== deviceHeight)
	const cacheScaleChanged = !!cachedImageData && getCachedScale() !== scale
	const structureChanged =
		!!previousTokens &&
		(previousLineCount !== lineCount || previousMaxChars !== maxChars)

	const startLine = Math.max(0, Math.floor(normalizedScrollY / charH))
	const endLine = Math.min(
		lineCount,
		Math.ceil((normalizedScrollY + deviceHeight) / charH)
	)
	const visibleLineCount = Math.max(0, endLine - startLine)

	const cachedScrollY = getCachedScrollY()
	const deltaY = cachedImageData ? normalizedScrollY - cachedScrollY : 0
	const scrollJumped = !!cachedImageData && Math.abs(deltaY) >= deviceHeight

	const tokensUnchanged =
		previousTokens === tokens && previousVersion === summary.version

	if (
		!forceFullRepaint &&
		!cacheMissing &&
		!cacheSizeChanged &&
		!cacheScaleChanged &&
		!structureChanged &&
		!scrollJumped &&
		visibleLineCount > 0 &&
		tokensUnchanged &&
		cachedScrollY === normalizedScrollY
	) {
		return
	}

	let imageData =
		forceFullRepaint ||
		cacheMissing ||
		cacheSizeChanged ||
		cacheScaleChanged ||
		structureChanged ||
		scrollJumped ||
		visibleLineCount <= 0
			? fullRepaint(
					summary,
					ctx,
					deviceWidth,
					deviceHeight,
					charW,
					charH,
					pixelsPerChar,
					scale,
					palette,
					normalizedScrollY,
					bgR,
					bgG,
					bgB
				)
			: cachedImageData!

	if (imageData === cachedImageData && deltaY !== 0) {
		const absDeltaY = Math.abs(deltaY)
		blitForScrollDelta(imageData.data, deviceWidth, deviceHeight, deltaY)

		const patchStartY = deltaY > 0 ? deviceHeight - absDeltaY : 0
		const patchEndY = patchStartY + absDeltaY

		renderLinesIntersectingYRange(
			summary,
			imageData.data,
			charW,
			charH,
			pixelsPerChar,
			scale,
			deviceWidth,
			deviceHeight,
			palette,
			normalizedScrollY,
			patchStartY,
			patchEndY,
			bgR,
			bgG,
			bgB
		)
	}

	if (imageData === cachedImageData && !tokensUnchanged) {
		imageData = patchDirtyLines(
			summary, ctx, imageData, tokens, maxChars, lineCount,
			startLine, endLine, visibleLineCount,
			charW, charH, pixelsPerChar, scale,
			deviceWidth, deviceHeight, palette, normalizedScrollY,
			bgR, bgG, bgB
		)
	}

	ctx.putImageData(imageData, 0, 0)

	// Cache for next render
	setCachedImageData(imageData)
	setCachedScrollY(normalizedScrollY)
	setCachedScale(scale)
	setPreviousState(tokens, maxChars, lineCount, summary.version)
}
