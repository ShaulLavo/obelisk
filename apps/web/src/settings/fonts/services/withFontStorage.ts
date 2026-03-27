/**
 * Shared error-handling utility for font storage operations.
 *
 * Many font service methods follow the same scaffold:
 *   1. Ensure the service is initialized.
 *   2. Try the operation.
 *   3. On failure, log a debug message and return a safe default.
 *
 * `withFontStorage` extracts that boilerplate into a single function so each
 * call-site only needs to supply the operation, fallback value, and a
 * human-readable tag for the debug log line.
 */

/**
 * Run `operation` and return its result. If it throws, log the error at
 * `console.debug` level (tagged with `[tag]`) and return `fallback` instead.
 *
 * @param operation  - The async work to attempt.
 * @param fallback   - Value returned when `operation` fails.
 * @param tag        - Label for the debug log (e.g. `"FontMetadataService.getFontMetadata"`).
 */
export async function withFontStorage<T>(
	operation: () => Promise<T>,
	fallback: T,
	tag: string,
): Promise<T> {
	try {
		return await operation()
	} catch (error) {
		console.debug(`[${tag}]`, error)
		return fallback
	}
}
