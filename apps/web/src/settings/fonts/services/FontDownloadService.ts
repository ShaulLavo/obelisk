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
		if (this.activeDownloads.has(name)) {
			return
		}

		const abortController = new AbortController()
		this.activeDownloads.set(name, abortController)

		if (onProgress) {
			this.progressCallbacks.set(name, onProgress)
		}

		const emitProgress = (
			fields: Omit<DownloadProgress, 'fontName'>
		) => this.updateProgress(name, { fontName: name, ...fields })

		const ensureNotAborted = () => {
			if (abortController.signal.aborted) {
				throw new Error('Download cancelled')
			}
		}

		try {
			// Initialize cache service with retry
			const cacheInitResult = await RetryService.retryCacheOperation(
				() => fontCacheService.init()
			)

			if (!cacheInitResult.success) {
				throw (
					cacheInitResult.error || new Error('Failed to initialize font cache')
				)
			}

			const installedFonts = await fontCacheService.getInstalledFonts()
			if (installedFonts.has(name)) {
				emitProgress({ status: 'completed' })
				return
			}

			emitProgress({ status: 'downloading', progress: 0 })

			// Download font data using server RPC with retry logic
			const downloadResult = await RetryService.retryFontDownload(async () => {
				const response = await client.fonts({ name }).get({
					fetch: { signal: abortController.signal },
				})

				ensureNotAborted()

				if (!response.data || response.error) {
					const errorMessage = response.error?.value?.message
					throw new Error(
						errorMessage || `Failed to download font: ${name}`
					)
				}

				return response
			})

			if (!downloadResult.success) {
				throw (
					downloadResult.error ||
					new Error(
						`Failed to download font after ${downloadResult.attempts} attempts`
					)
				)
			}

			const response = downloadResult.result!
			ensureNotAborted()

			emitProgress({ status: 'installing', progress: 50 })

			const responseData: unknown = response.data
			if (responseData instanceof Response) {
				await responseData.arrayBuffer()
			} else if (!(responseData instanceof ArrayBuffer)) {
				throw new Error(`Unexpected response data type for font: ${name}`)
			}

			ensureNotAborted()

			// Cache the font data with retry logic
			const cacheResult = await RetryService.retryCacheOperation(
				() => fontCacheService.downloadFont(name, downloadUrl)
			)

			if (!cacheResult.success) {
				throw cacheResult.error || new Error('Failed to cache font data')
			}

			emitProgress({ status: 'completed', progress: 100 })
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			emitProgress({ status: 'error', error: errorMessage })

			throw error
		} finally {
			this.activeDownloads.delete(name)
			this.progressCallbacks.delete(name)
		}
	}

	/**
	 * Install a font using FontFace API after it's been downloaded and cached
	 */
	async installFont(name: string): Promise<void> {
		const installResult = await RetryService.withRetry(
			async () => {
				await fontInstallationService.installFont(name, () => {})
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
				onRetry: () => {},
			}
		)

		if (!installResult.success) {
			throw (
				installResult.error ||
				new Error('Font installation failed after retries')
			)
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
		// Download the font first
		await this.downloadFont(name, downloadUrl, onProgress)

		// Then install it using FontFace API
		await this.installFont(name)

	}

	cancelDownload(name: string): void {
		const controller = this.activeDownloads.get(name)
		if (controller) {
			controller.abort()
			this.activeDownloads.delete(name)
			this.progressCallbacks.delete(name)
		}
	}

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
