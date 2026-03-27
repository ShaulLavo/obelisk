import { fontCacheService } from './FontCacheService'

export type FontInstallationStatus = {
	fontName: string
	isInstalled: boolean
	isLoading: boolean
	error?: string
}

export type FontInstallationCallback = (status: FontInstallationStatus) => void

export class FontInstallationService {
	private installedFonts = new Set<string>()
	private loadingFonts = new Set<string>()
	private installationCallbacks = new Map<string, FontInstallationCallback>()

	async installFont(
		name: string,
		onStatusChange?: FontInstallationCallback
	): Promise<void> {
		const emitStatus = (
			fields: Omit<FontInstallationStatus, 'fontName'>
		) => this.updateStatus(name, { fontName: name, ...fields }, onStatusChange)

		if (this.installedFonts.has(name)) {
			emitStatus({ isInstalled: true, isLoading: false })
			return
		}

		if (this.loadingFonts.has(name)) {
			return
		}

		this.loadingFonts.add(name)
		if (onStatusChange) {
			this.installationCallbacks.set(name, onStatusChange)
		}

		try {
			emitStatus({ isInstalled: false, isLoading: true })

			const fontData = await this.getFontDataFromCache(name)

			const fontFace = new FontFace(name, fontData, {
				display: 'swap',
				style: 'normal',
				weight: 'normal',
				stretch: 'normal',
			})

			await fontFace.load()
			document.fonts.add(fontFace)
			this.installedFonts.add(name)

			emitStatus({ isInstalled: true, isLoading: false })
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown installation error'

			emitStatus({ isInstalled: false, isLoading: false, error: errorMessage })

			throw error
		} finally {
			this.loadingFonts.delete(name)
			this.installationCallbacks.delete(name)
		}
	}

	async uninstallFont(name: string): Promise<void> {
		const fontsToRemove = Array.from(document.fonts).filter(
			(font) => font.family === name || font.family === `"${name}"`
		)

		for (const font of fontsToRemove) {
			document.fonts.delete(font)
		}

		this.installedFonts.delete(name)
	}

	/**
	 * Syncs internal state with `document.fonts` for the given font name,
	 * then returns whether the font is currently installed.
	 */
	syncAndCheckFontInstalled(name: string): boolean {
		const internalState = this.installedFonts.has(name)
		const inDocumentFonts = document.fonts.check(`1em "${name}"`)

		if (inDocumentFonts && !internalState) {
			this.installedFonts.add(name)
		} else if (!inDocumentFonts && internalState) {
			this.installedFonts.delete(name)
		}

		return inDocumentFonts
	}

	/**
	 * Rebuilds the internal installed-fonts set from `document.fonts`.
	 * This replaces all previously tracked state with a fresh snapshot,
	 * so callers should be aware this is a sync operation, not a pure getter.
	 */
	syncInstalledFonts(): Set<string> {
		const documentFonts = Array.from(document.fonts)
			.map((font) => font.family.replace(/"/g, ''))
			.filter(
				(family) =>
					family !== 'monospace' &&
					family !== 'serif' &&
					family !== 'sans-serif'
			)

		this.installedFonts.clear()
		for (const fontName of documentFonts) {
			this.installedFonts.add(fontName)
		}

		return new Set(this.installedFonts)
	}

	isFontLoading(name: string): boolean {
		return this.loadingFonts.has(name)
	}

	async initialize(): Promise<void> {
		await document.fonts.ready
		this.syncInstalledFonts()
	}

	private async getFontDataFromCache(name: string): Promise<ArrayBuffer> {
		await fontCacheService.init()

		const isCached = await fontCacheService.isFontCached(name)
		if (!isCached) {
			throw new Error(`Font not found in cache: ${name}`)
		}

		const cacheKey = `/fonts/${name}`
		const cache = await caches.open('nerdfonts-v1')
		const cachedResponse = await cache.match(cacheKey)

		if (!cachedResponse) {
			throw new Error(`Font not found in cache: ${name}`)
		}

		return await cachedResponse.arrayBuffer()
	}

	private updateStatus(
		name: string,
		status: FontInstallationStatus,
		callback?: FontInstallationCallback
	): void {
		if (callback) {
			callback(status)
		}

		const registeredCallback = this.installationCallbacks.get(name)
		if (registeredCallback && registeredCallback !== callback) {
			registeredCallback(status)
		}
	}
}

export const fontInstallationService = new FontInstallationService()
