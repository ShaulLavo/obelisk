/**
 * A safe wrapper around localStorage that gracefully handles:
 * - Storage unavailability (e.g., in private browsing mode)
 * - Quota exceeded errors
 * - Parse errors
 * - Any other unexpected exceptions
 */
/**
 * Safely retrieves an item from localStorage.
 * Returns null if the item doesn't exist or if any error occurs.
 */
export declare function safeGetItem(key: string): string | null
/**
 * Safely sets an item in localStorage.
 * Silently ignores any errors that occur during the operation.
 */
export declare function safeSetItem(key: string, value: string): void
/**
 * Safely removes an item from localStorage.
 * Silently ignores any errors that occur during the operation.
 */
export declare function safeRemoveItem(key: string): void
/**
 * Creates a memory-safe storage adapter that:
 * - Returns undefined if window is not defined (SSR safety)
 * - Wraps all localStorage operations in try-catch blocks
 * - Handles the special "memory" value by removing the key instead of persisting it
 */
export declare function createMemorySafeStorage():
	| {
			getItem: (key: string) => string | null
			setItem: (key: string, value: string) => void
			removeItem: (key: string) => void
	  }
	| undefined
//# sourceMappingURL=safeLocalStorage.d.ts.map
