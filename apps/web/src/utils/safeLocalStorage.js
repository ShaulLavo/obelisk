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
export function safeGetItem(key) {
    try {
        return window.localStorage.getItem(key);
    }
    catch (error) {
        // Silently ignore errors (storage unavailable, quota exceeded, etc.)
        return null;
    }
}
/**
 * Safely sets an item in localStorage.
 * Silently ignores any errors that occur during the operation.
 */
export function safeSetItem(key, value) {
    try {
        window.localStorage.setItem(key, value);
    }
    catch (error) {
        // Silently ignore errors (quota exceeded, storage unavailable, etc.)
    }
}
/**
 * Safely removes an item from localStorage.
 * Silently ignores any errors that occur during the operation.
 */
export function safeRemoveItem(key) {
    try {
        window.localStorage.removeItem(key);
    }
    catch (error) {
        // Silently ignore errors (storage unavailable, etc.)
    }
}
/**
 * Creates a memory-safe storage adapter that:
 * - Returns undefined if window is not defined (SSR safety)
 * - Wraps all localStorage operations in try-catch blocks
 * - Handles the special "memory" value by removing the key instead of persisting it
 */
export function createMemorySafeStorage() {
    if (typeof window === 'undefined') {
        return undefined;
    }
    return {
        getItem: (key) => {
            return safeGetItem(key);
        },
        setItem: (key, value) => {
            let parsed = value;
            try {
                parsed = JSON.parse(value);
            }
            catch {
                // Ignore parse failures - treat as literal string value
            }
            // Special case: if the parsed value is "memory", remove the key
            if (parsed === 'memory') {
                safeRemoveItem(key);
                return;
            }
            safeSetItem(key, value);
        },
        removeItem: (key) => {
            safeRemoveItem(key);
        }
    };
}
