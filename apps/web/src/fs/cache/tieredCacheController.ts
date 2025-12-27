import type { SyncStorageBackend, AsyncStorageBackend, TierRoutingConfig, CacheStats, CacheMode } from './backends/types'
import { DEFAULT_ROUTING } from './backends/types'
import type { FileCacheEntry, ScrollPosition } from './fileCacheController'
import { TierRouter } from './tierRouter'
import { createActiveFileState, type ActiveFileState } from './activeFileState'
import { createCacheMetadataStore, createCacheEntryMetadata, type CacheMetadataStoreInterface } from './metadataStore'
import { createMemoryBackend, type MemoryBackendOptions } from './backends/memoryBackend'
import { createLocalStorageBackend, type LocalStorageBackendOptions } from './backends/localStorageBackend'
import { createIndexedDBBackend, type IndexedDBBackendOptions } from './backends/indexedDBBackend'

export interface TieredCacheControllerOptions {
	hot?: MemoryBackendOptions
	warm?: LocalStorageBackendOptions
	cold?: IndexedDBBackendOptions
	routing?: TierRoutingConfig
	getFileMtime?: (path: string) => number | undefined
}

export class TieredCacheController {
	private readonly tierRouter: TierRouter
	private readonly activeFileState: ActiveFileState
	private readonly metadataStore: CacheMetadataStoreInterface
	private readonly routing: TierRoutingConfig
	private readonly getFileMtime?: (path: string) => number | undefined
	private cacheMode: CacheMode = 'full'
	private readonly hotBackend: SyncStorageBackend<unknown>
	private readonly warmBackend: SyncStorageBackend<unknown>
	private readonly coldBackend: AsyncStorageBackend<unknown>

	constructor(options: TieredCacheControllerOptions = {}) {
		this.routing = options.routing ?? DEFAULT_ROUTING
		this.getFileMtime = options.getFileMtime
		
		this.hotBackend = createMemoryBackend({
			...options.hot,
			onEvict: (key, value) => this.handleHotEviction(key, value)
		})
		
		this.warmBackend = this.createWarmBackendSafe(options.warm)
		this.coldBackend = this.createColdBackendSafe(options.cold)
		
		this.tierRouter = new TierRouter({
			hot: this.hotBackend,
			warm: this.warmBackend,
			cold: this.coldBackend,
			routing: this.routing
		})
		
		this.metadataStore = createCacheMetadataStore()
		
		this.activeFileState = createActiveFileState({
			onDeactivate: (path, entry) => this.handleFileDeactivation(path, entry)
		})
	}

	getScrollPosition(path: string): ScrollPosition | undefined {
		const key = `v1:${path}:scrollPosition`
		const value = this.warmBackend.get(key)
		if (value !== null) {
			return value as ScrollPosition
		}
		return undefined
	}

	get(path: string): FileCacheEntry {
		if (this.activeFileState.isActive(path)) {
			return this.activeFileState.getActiveEntry() ?? {}
		}
		return this.getFromHotCache(path)
	}

	async getAsync(path: string): Promise<FileCacheEntry> {
		if (this.activeFileState.isActive(path)) {
			return this.activeFileState.getActiveEntry() ?? {}
		}
		
		const currentMtime = this.getFileMtime?.(path)
		if (this.metadataStore.isStale(path, currentMtime)) {
			await this.clearPath(path)
			return {}
		}
		
		const entry = await this.hydrateFromAllTiers(path)
		
		if (Object.keys(entry).length > 0) {
			this.metadataStore.updateLastAccess(path)
		}
		
		return entry
	}

	async set(path: string, entry: FileCacheEntry): Promise<void> {
		if (!path) return
		
		if (this.activeFileState.isActive(path)) {
			this.activeFileState.setActiveEntry(entry)
		}
		
		const promises: Promise<void>[] = []
		const currentMtime = this.getFileMtime?.(path)
		
		for (const [key, value] of Object.entries(entry)) {
			if (value !== undefined) {
				const dataType = key as keyof FileCacheEntry
				console.debug(`[TieredCache] Setting ${dataType} for ${path}`)
				promises.push(this.tierRouter.set(path, dataType, value))
			}
		}
		
		await Promise.all(promises)
		
		const tier = this.determinePrimaryTier(entry)
		this.metadataStore.setMetadata(path, createCacheEntryMetadata(tier, currentMtime))
		this.metadataStore.persist()
	}

	async clearPath(path: string): Promise<void> {
		if (!path) return
		console.debug(`[TieredCacheController] clearPath called for ${path}`)
		console.trace()
		
		if (this.activeFileState.isActive(path)) {
			this.activeFileState.setActive(null)
		}
		
		await this.tierRouter.clearPath(path)
		this.metadataStore.removeMetadata(path)
	}

	async clearAll(): Promise<void> {
		console.debug('[TieredCacheController] clearAll called')
		console.trace()
		this.activeFileState.setActive(null)
		await this.tierRouter.clearAll()
		this.metadataStore.clear()
	}

	setActiveFile(path: string | null): void {
		this.activeFileState.setActive(path)
	}

	getActiveFile(): string | null {
		return this.activeFileState.activePath
	}

	isActiveFile(path: string): boolean {
		return this.activeFileState.isActive(path)
	}

	async getStats(): Promise<CacheStats> {
		const tierSizes = await this.tierRouter.getStats()
		const allKeys = await this.tierRouter.getAllKeys()
		
		let hotEntries = 0
		let warmEntries = 0
		let coldEntries = 0
		
		for (const key of allKeys) {
			const match = key.match(/^v1:(.+):(.+)$/)
			if (match) {
				const dataType = match[2] as keyof FileCacheEntry
				const tier = this.getTierForDataType(dataType)
				
				switch (tier) {
					case 'hot':
						hotEntries++
						break
					case 'warm':
						warmEntries++
						break
					case 'cold':
						coldEntries++
						break
				}
			}
		}
		
		return {
			hotEntries,
			warmEntries,
			coldEntries,
			estimatedHotSize: tierSizes.hot,
			estimatedWarmSize: tierSizes.warm,
			estimatedColdSize: tierSizes.cold
		}
	}

	async flush(): Promise<void> {
		this.metadataStore.persist()
	}

	getCacheMode(): CacheMode {
		return this.cacheMode
	}

	getActiveFileState(): ActiveFileState {
		return this.activeFileState
	}

	getMetadataStore(): CacheMetadataStoreInterface {
		return this.metadataStore
	}

	private createWarmBackendSafe(options?: LocalStorageBackendOptions): SyncStorageBackend<unknown> {
		try {
			return createLocalStorageBackend(options)
		} catch (error) {
			console.warn('TieredCacheController: localStorage unavailable, using memory-only mode:', error)
			this.cacheMode = 'memory-only'
			return createMemoryBackend({ maxEntries: 500 })
		}
	}

	private createColdBackendSafe(options?: IndexedDBBackendOptions): AsyncStorageBackend<unknown> {
		try {
			return createIndexedDBBackend(options)
		} catch (error) {
			console.warn('TieredCacheController: IndexedDB unavailable, using warm-only mode:', error)
			if (this.cacheMode !== 'memory-only') {
				this.cacheMode = 'warm-only'
			}
			return this.createNoOpAsyncBackend()
		}
	}

	private createNoOpAsyncBackend(): AsyncStorageBackend<unknown> {
		return {
			get: async () => null,
			set: async (_key, value) => value,
			remove: async () => {},
			has: async () => false,
			keys: async () => [],
			clear: async () => {},
			estimateSize: async () => 0
		}
	}

	private handleHotEviction(key: string, value: unknown): void {
		const match = key.match(/^v1:(.+):(.+)$/)
		if (!match) return
		
		const path = match[1]
		const dataType = match[2] as keyof FileCacheEntry
		
		if (path && this.activeFileState.isActive(path)) {
			this.hotBackend.set(key, value)
			return
		}
		
		const targetTier = this.getTierForDataType(dataType)
		
		if (targetTier === 'warm') {
			try {
				this.warmBackend.set(key, value)
			} catch (error) {
				console.warn(`TieredCacheController: Failed to cascade ${key} to warm tier:`, error)
				this.coldBackend.set(key, value).catch(coldError => {
					console.warn(`TieredCacheController: Failed to cascade ${key} to cold tier:`, coldError)
				})
			}
		} else if (targetTier === 'cold') {
			this.coldBackend.set(key, value).catch(error => {
				console.warn(`TieredCacheController: Failed to cascade ${key} to cold tier:`, error)
			})
		}
	}

	private handleFileDeactivation(path: string, entry: FileCacheEntry): void {
		this.set(path, entry).catch(error => {
			console.warn(`TieredCacheController: Failed to cache deactivated file ${path}:`, error)
		})
	}

	private getFromHotCache(path: string): FileCacheEntry {
		const entry: FileCacheEntry = {}
		const dataTypes: Array<keyof FileCacheEntry> = [
			'pieceTable', 'stats', 'previewBytes', 'highlights', 'folds',
			'brackets', 'errors', 'scrollPosition', 'visibleContent'
		]
		
		for (const dataType of dataTypes) {
			const key = `v1:${path}:${dataType}`
			const value = this.hotBackend.get(key)
			if (value !== null) {
				;(entry as Record<string, unknown>)[dataType] = value
			}
		}
		
		return entry
	}

	private async hydrateFromAllTiers(path: string): Promise<FileCacheEntry> {
		const entry: FileCacheEntry = {}
		const dataTypes: Array<keyof FileCacheEntry> = [
			'pieceTable', 'stats', 'previewBytes', 'highlights', 'folds',
			'brackets', 'errors', 'scrollPosition', 'visibleContent'
		]
		
		const promises = dataTypes.map(async (dataType) => {
			try {
				const value = await this.tierRouter.get(path, dataType)
				if (value !== null) {
					return { dataType, value }
				}
			} catch (error) {
				console.warn(`TieredCacheController: Failed to hydrate ${dataType} for ${path}:`, error)
			}
			return null
		})
		
		const results = await Promise.all(promises)
		
		for (const result of results) {
			if (result) {
				;(entry as Record<string, unknown>)[result.dataType] = result.value
			}
		}
		
		return entry
	}

	private determinePrimaryTier(entry: FileCacheEntry): 'hot' | 'warm' | 'cold' {
		for (const dataType of this.routing.cold) {
			if (entry[dataType] !== undefined) {
				return 'cold'
			}
		}
		
		for (const dataType of this.routing.warm) {
			if (entry[dataType] !== undefined) {
				return 'warm'
			}
		}
		
		return 'hot'
	}

	private getTierForDataType(dataType: keyof FileCacheEntry): 'hot' | 'warm' | 'cold' {
		if (this.routing.hotOnly.includes(dataType)) {
			return 'hot'
		}
		if (this.routing.warm.includes(dataType)) {
			return 'warm'
		}
		if (this.routing.cold.includes(dataType)) {
			return 'cold'
		}
		return 'cold'
	}
}

export function createTieredCacheController(options?: TieredCacheControllerOptions): TieredCacheController {
	return new TieredCacheController(options)
}
