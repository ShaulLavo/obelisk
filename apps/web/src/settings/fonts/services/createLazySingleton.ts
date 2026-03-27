/**
 * Creates a lazy singleton with a getter function and a backward-compatible deprecated Proxy.
 *
 * @param factory - Called once, on first access, to construct the singleton instance.
 * @returns An object with:
 *   - `get()` — the canonical getter; returns (and lazily creates) the singleton.
 *   - `deprecated` — a Proxy that forwards every property access to `get()`.
 *     Assign this to the old bare-name export so existing call-sites keep working
 *     while IDEs surface the `@deprecated` JSDoc tag.
 *
 * @example
 * ```ts
 * const { get: getFontCacheService, deprecated: fontCacheService } =
 *   createLazySingleton(() => new FontCacheService())
 * ```
 */
export function createLazySingleton<T extends object>(factory: () => T): {
	get: () => T
	deprecated: T
} {
	let instance: T | null = null

	function get(): T {
		if (!instance) {
			instance = factory()
		}
		return instance
	}

	const deprecated = new Proxy({} as T, {
		get(_target, prop, receiver) {
			return Reflect.get(get(), prop, receiver)
		},
	})

	return { get, deprecated }
}
