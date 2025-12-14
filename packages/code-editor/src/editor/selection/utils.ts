import { DEFAULT_TAB_SIZE } from '../consts'

export const normalizeCharWidth = (charWidth: number): number =>
	Number.isFinite(charWidth) && charWidth > 0 ? charWidth : 1

export const normalizeTabSize = (tabSize: number): number =>
	Number.isFinite(tabSize) && tabSize > 0 ? tabSize : DEFAULT_TAB_SIZE

export const getTabAdvance = (
	visualColumn: number,
	tabSize: number
): number => {
	const remainder = visualColumn % tabSize
	return remainder === 0 ? tabSize : tabSize - remainder
}
