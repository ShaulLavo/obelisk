import type { FileCacheEntry } from '../fileCacheController'


export interface SyncStorageBackend<T = unknown> {
	get(key: string): T | null
	set(key: string, value: T): T
	remove(key: string): void
	has(key: string): boolean
	keys(): string[]
	clear(): void
	estimateSize?(): number
}


export interface AsyncStorageBackend<T = unknown> {
	get(key: string): Promise<T | null>
	set(key: string, value: T): Promise<T>
	remove(key: string): Promise<void>
	has(key: string): Promise<boolean>
	keys(): Promise<string[]>
	clear(): Promise<void>
	estimateSize?(): Promise<number>
}


export type StorageBackend<T = unknown> = SyncStorageBackend<T> | AsyncStorageBackend<T>


export interface CacheEntryMetadata {
	lastAccess: number
	mtime?: number
	tier: 'hot' | 'warm' | 'cold'
}


export interface TierRoutingConfig {
	warm: Array<keyof FileCacheEntry>
	cold: Array<keyof FileCacheEntry>
	hotOnly: Array<keyof FileCacheEntry>
}


export const DEFAULT_ROUTING: TierRoutingConfig = {
	warm: ['scrollPosition', 'visibleContent'],
	cold: ['stats', 'highlights', 'folds', 'brackets', 'errors', 'pieceTable', 'previewBytes'],
	hotOnly: []
}


export type CacheKey = `v1:${string}:${keyof FileCacheEntry}`


export interface CacheStats {
	hotEntries: number
	warmEntries: number
	coldEntries: number
	estimatedHotSize: number
	estimatedWarmSize: number
	estimatedColdSize: number
}


export type CacheMode = 'full' | 'warm-only' | 'memory-only'


export interface CacheMetadataStore {
	entries: Record<string, CacheEntryMetadata>
	lruOrder: string[]
	version: number
}