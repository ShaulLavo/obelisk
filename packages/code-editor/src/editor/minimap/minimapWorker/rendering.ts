import type { MinimapTokenSummary, MinimapLayout } from './types'
import {
	Constants,
	BACKGROUND_R,
	BACKGROUND_G,
	BACKGROUND_B,
} from './constants'
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
	scrollY: number
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

		const colorR = rawColor & 0xff
		const colorG = (rawColor >> 8) & 0xff
		const colorB = (rawColor >> 16) & 0xff
		const foregroundAlpha = (rawColor >> 24) & 0xff

		const deltaR = colorR - BACKGROUND_R
		const deltaG = colorG - BACKGROUND_G
		const deltaB = colorB - BACKGROUND_B

		const charIndex = getCharIndex(charCode, scale)
		const atlasOffset = charIndex * pixelsPerChar
		const xStart = char * charW

		let sourceIdx = atlasOffset
		let rowStart = yStart * destWidth + xStart * Constants.RGBA_CHANNELS_CNT

		for (let dy = 0; dy < charH; dy++) {
			const py = yStart + dy
			if (py >= deviceHeight) break
			if (py < 0) {
				rowStart += destWidth
				continue
			}

			let destIdx = rowStart

			for (let dx = 0; dx < charW; dx++) {
				const px = xStart + dx
				if (px >= deviceWidth) break

				const charAlpha = fontAtlas[sourceIdx++]!
				const c = (charAlpha / 255) * (foregroundAlpha / 255)

				if (c > 0.02) {
					dest[destIdx] = BACKGROUND_R + deltaR * c
					dest[destIdx + 1] = BACKGROUND_G + deltaG * c
					dest[destIdx + 2] = BACKGROUND_B + deltaB * c
					dest[destIdx + 3] = Math.max(foregroundAlpha, 200)
				}

				destIdx += Constants.RGBA_CHANNELS_CNT
			}

			rowStart += destWidth
		}
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
	yEnd: number
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
			scrollY
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
	scrollY: number
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
			scrollY
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
		(cachedImageData.width !== deviceWidth || cachedImageData.height !== deviceHeight)
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

	const tokensUnchanged = previousTokens === tokens && previousVersion === summary.version

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
					normalizedScrollY
				)
			: cachedImageData!

	if (imageData === cachedImageData) {
		if (deltaY !== 0) {
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
				patchEndY
			)
		}

		if (!tokensUnchanged) {
			const dirtyLines = findDirtyLinesInRange(
				tokens,
				maxChars,
				lineCount,
				startLine,
				endLine
			)

			if (dirtyLines.size > visibleLineCount * 0.3) {
				imageData = fullRepaint(
					summary,
					ctx,
					deviceWidth,
					deviceHeight,
					charW,
					charH,
					pixelsPerChar,
					scale,
					palette,
					normalizedScrollY
				)
			} else {
				clearLines(
					imageData.data,
					dirtyLines,
					charH,
					normalizedScrollY,
					deviceWidth,
					deviceHeight
				)

				for (const line of dirtyLines) {
					renderLine(
						line,
						tokens,
						maxChars,
						imageData.data,
						charW,
						charH,
						pixelsPerChar,
						scale,
						deviceWidth,
						deviceHeight,
						palette,
						normalizedScrollY
					)
				}
			}
		}
	}

	ctx.putImageData(imageData, 0, 0)

	// Cache for next render
	setCachedImageData(imageData)
	setCachedScrollY(normalizedScrollY)
	setCachedScale(scale)
	setPreviousState(tokens, maxChars, lineCount, summary.version)
}
