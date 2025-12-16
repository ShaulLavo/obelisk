declare module 'safe-regex' {
	interface SafeRegexOptions {
		/** Maximum number of allowed repetitions in the entire regex. Default: 25. */
		limit?: number
	}

	/**
	 * Detect potentially catastrophic exponential-time regular expressions
	 * by limiting the star height to 1.
	 *
	 * @param re - RegExp object or string pattern to check
	 * @param opts - Optional configuration
	 * @returns true if the regex is safe, false if potentially catastrophic or invalid
	 */
	function safeRegex(re: string | RegExp, opts?: SafeRegexOptions): boolean

	export default safeRegex
}
