import { client } from '~/client'
import { fontCacheService } from './FontCacheService'
import { fontInstallationService } from './FontInstallationService'
import { RetryService } from './RetryService'

export type DownloadProgress = {
	fontName: string
	status: 'idle' | 'downloading' | 'installing' | 'completed' | 'error'
	progress?: number
	error?: string
}

export type DownloadProgressCallback = (progress: DownloadProgress) => void

export class FontDownloadService {
	private activeDownloads = new Map<string, AbortController>()
	private progressCallbacks = new Map<string, DownloadProgressCallback>()

	/**
	 * Download and install a font with progress tracking and retry logic
	 */
	async downloadFont(
		name: string,
		downloadUrl: string,
		onProgress?: DownloadProgressCallback
	): Promise<void> {
		console.log('[FontDownloadService] Starting download for font:', name)

		// Check if already downloading
		if (this.activeDownloads.has(name)) {
			console.log('[FontDownloadService] Font already downloading:', name)
			return
		}

		// Set up abort controller for cancellation
		const abortController = new AbortController()
		this.activeDownloads.set(name, abortController)

		if (onProgress) {
			this.progressCallbacks.set(name, onProgress)
		}

		try {
			// Initialize cache service with retry
			const cacheInitResult = await RetryService.retryCacheOperation(
				() => fontCacheService.init(),
				'cache initialization'
			)

			if (!cacheInitResult.success) {
				throw (
					cacheInitResult.error || new Error('Failed to initialize font cache')
				)
			}

			// Check if already installed
			const installedFonts = await fontCacheService.getInstalledFonts()
			if (installedFonts.has(name)) {
				console.log('[FontDownloadService] Font already installed:', name)
				this.updateProgress(name, { fontName: name, status: 'completed' })
				return
			}

			// Update progress: starting download
			this.updateProgress(name, {
				fontName: name,
				status: 'downloading',
				progress: 0,
			})

			// Download font data using server RPC with retry logic
			console.log('[FontDownloadService] Calling server RPC for font:', name)

			const downloadResult = await RetryService.retryFontDownload(async () => {
				const response = await client.fonts({ name }).get({
					fetch: { signal: abortController.signal },
				})

				if (abortController.signal.aborted) {
					throw new Error('Download cancelled')
				}

				if (!response.data || response.error) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const errorValue = (response.error as any)?.value
					throw new Error(
						errorValue?.message || `Failed to download font: ${name}`
					)
				}

				return response
			}, name)

			if (!downloadResult.success) {
				throw (
					downloadResult.error ||
					new Error(
						`Failed to download font after ${downloadResult.attempts} attempts`
					)
				)
			}

			const response = downloadResult.result!

			if (abortController.signal.aborted) {
				throw new Error('Download cancelled')
			}

			// Update progress: download complete, starting installation
			this.updateProgress(name, {
				fontName: name,
				status: 'installing',
				progress: 50,
			})

			// Handle the response data
			let fontData: ArrayBuffer
			if (
				typeof response.data === 'object' &&
				response.data !== null &&
				(response.data as any) instanceof Response
			) {
				fontData = await (response.data as any).arrayBuffer()
			} else if ((response.data as any) instanceof ArrayBuffer) {
				fontData = response.data as any
			} else {
				throw new Error(`Unexpected response data type for font: ${name}`)
			}

			if (abortController.signal.aborted) {
				throw new Error('Download cancelled')
			}

			// Cache the font data with retry logic
			console.log('[FontDownloadService] Caching font data for:', name)
			const cacheResult = await RetryService.retryCacheOperation(
				() => fontCacheService.downloadFont(name, downloadUrl),
				`font caching for ${name}`
			)

			if (!cacheResult.success) {
				throw cacheResult.error || new Error('Failed to cache font data')
			}

			// Update progress: installation complete
			this.updateProgress(name, {
				fontName: name,
				status: 'completed',
				progress: 100,
			})

			console.log(
				'[FontDownloadService] Font download and caching completed:',
				name
			)
		} catch (error) {
			console.error('[FontDownloadService] Font download failed:', name, error)

			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			this.updateProgress(name, {
				fontName: name,
				status: 'error',
				error: errorMessage,
			})

			throw error
		} finally {
			// Clean up
			this.activeDownloads.delete(name)
			this.progressCallbacks.delete(name)
		}
	}

	/**
	 * Install a font using FontFace API after it's been downloaded and cached
	 */
	async installFont(name: string): Promise<void> {
		console.log(
			'[FontDownloadService] Installing font using FontFace API:',
			name
		)

		try {
			// Use retry logic for font installation
			const installResult = await RetryService.withRetry(
				async () => {
					await fontInstallationService.installFont(name, (status) => {
						console.log(
							'[FontDownloadService] Installation status:',
							JSON.stringify(status, null, 2)
						)
					})
				},
				{
					maxRetries: 2,
					baseDelay: 1000,
					maxDelay: 5000,
					backoffFactor: 2,
					retryCondition: (error: Error) => {
						const message = error.message.toLowerCase()
						// Don't retry on font format or browser support issues
						if (
							message.includes('unsupported') ||
							message.includes('invalid font')
						) {
							return false
						}
						// Retry on temporary failures
						return (
							message.includes('failed to load') || message.includes('network')
						)
					},
					onRetry: (attempt, error) => {
						console.log(
							`[FontDownloadService] Retrying font installation for ${name} (attempt ${attempt}):`,
							error.message
						)
					},
				}
			)

			if (!installResult.success) {
				throw (
					installResult.error ||
					new Error('Font installation failed after retries')
				)
			}

			console.log('[FontDownloadService] Font successfully installed:', name)
		} catch (error) {
			console.error(
				'[FontDownloadService] Font installation failed:',
				name,
				error
			)
			throw error
		}
	}

	/**
	 * Download and install a font in one operation
	 */
	async downloadAndInstallFont(
		name: string,
		downloadUrl: string,
		onProgress?: DownloadProgressCallback
	): Promise<void> {
		console.log(
			'[FontDownloadService] Starting download and install for:',
			name
		)

		// Download the font first
		await this.downloadFont(name, downloadUrl, onProgress)

		// Then install it using FontFace API
		await this.installFont(name)

		console.log(
			'[FontDownloadService] Font download and installation completed:',
			name
		)
	}

	/**
	 * Cancel an active download
	 */
	cancelDownload(name: string): void {
		const controller = this.activeDownloads.get(name)
		if (controller) {
			console.log('[FontDownloadService] Cancelling download for:', name)
			controller.abort()
			this.activeDownloads.delete(name)
			this.progressCallbacks.delete(name)
		}
	}

	/**
	 * Check if a font is currently being downloaded
	 */
	isDownloading(name: string): boolean {
		return this.activeDownloads.has(name)
	}

	/**
	 * Get list of fonts currently being downloaded
	 */
	getActiveDownloads(): string[] {
		return Array.from(this.activeDownloads.keys())
	}

	private updateProgress(name: string, progress: DownloadProgress): void {
		const callback = this.progressCallbacks.get(name)
		if (callback) {
			callback(progress)
		}
	}
}

// Singleton instance
export const fontDownloadService = new FontDownloadService()
