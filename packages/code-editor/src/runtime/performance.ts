/**
 * High-resolution timing utilities for flush duration measurement.
 *
 * Uses `performance.now()` where available, falling back to `Date.now()`.
 * All durations are returned in microseconds for consistency with FlushReceipt.
 */

const hasPerformanceNow =
	typeof performance !== 'undefined' && typeof performance.now === 'function'

/** Returns the current time in microseconds. */
export const nowMicros = hasPerformanceNow
	? () => performance.now() * 1000
	: () => Date.now() * 1000

/** Measures elapsed microseconds between a start time and now. */
export const elapsedMicros = (startMicros: number): number =>
	nowMicros() - startMicros
