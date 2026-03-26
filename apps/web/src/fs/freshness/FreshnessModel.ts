/**
 * Freshness Model
 *
 * Every piece of data in the system carries freshness metadata.
 * This allows consumers to know how stale data is and make
 * informed decisions about whether to refetch.
 */

/**
 * Wrapper type that adds freshness metadata to any value.
 */
export interface Timestamped<T> {
	/** The wrapped value */
	readonly value: T
	/** When this value was fetched/created (Unix timestamp in ms) */
	readonly fetchedAt: number
	/** Optional explicit expiry time (Unix timestamp in ms) */
	readonly validUntil?: number
}

export function timestamp<T>(value: T, validUntil?: number): Timestamped<T> {
	return {
		value,
		fetchedAt: Date.now(),
		validUntil,
	}
}

export interface FreshnessPolicy {
	readonly maxAge: number
	readonly preferFresh: boolean
}

export const FRESHNESS_POLICIES = {
	diskContent: { maxAge: 500, preferFresh: true } as FreshnessPolicy,
	highlights: { maxAge: 60_000, preferFresh: false } as FreshnessPolicy,
	scrollPosition: { maxAge: Infinity, preferFresh: false } as FreshnessPolicy,
	visibleContent: { maxAge: Infinity, preferFresh: false } as FreshnessPolicy,
	stats: { maxAge: 5_000, preferFresh: true } as FreshnessPolicy,
	folds: { maxAge: 60_000, preferFresh: false } as FreshnessPolicy,
	brackets: { maxAge: 60_000, preferFresh: false } as FreshnessPolicy,
	errors: { maxAge: 5_000, preferFresh: true } as FreshnessPolicy,
} as const

export interface FreshnessCheckResult {
	readonly isFresh: boolean
	readonly ageMs: number
	readonly shouldRefresh: boolean
}

export function checkFreshness<T>(
	data: Timestamped<T> | null | undefined,
	policy: FreshnessPolicy
): FreshnessCheckResult {
	if (!data) {
		return {
			isFresh: false,
			ageMs: Infinity,
			shouldRefresh: policy.preferFresh,
		}
	}

	const now = Date.now()
	const ageMs = now - data.fetchedAt

	// Check explicit expiry first
	if (data.validUntil !== undefined && now > data.validUntil) {
		return {
			isFresh: false,
			ageMs,
			shouldRefresh: policy.preferFresh,
		}
	}

	const isFresh = ageMs <= policy.maxAge
	const shouldRefresh = !isFresh && policy.preferFresh

	return { isFresh, ageMs, shouldRefresh }
}

export function isStale<T>(
	data: Timestamped<T> | null | undefined,
	policy: FreshnessPolicy
): boolean {
	return !checkFreshness(data, policy).isFresh
}

export function getAge<T>(data: Timestamped<T>): number {
	return Date.now() - data.fetchedAt
}

export function hasExpired<T>(data: Timestamped<T>): boolean {
	if (data.validUntil === undefined) return false
	return Date.now() > data.validUntil
}

export function updateValue<T, U>(
	data: Timestamped<T>,
	transform: (value: T) => U
): Timestamped<U> {
	return {
		value: transform(data.value),
		fetchedAt: data.fetchedAt,
		validUntil: data.validUntil,
	}
}

export function refresh<T>(
	data: Timestamped<T>,
	newValue: T,
	validUntil?: number
): Timestamped<T> {
	return {
		value: newValue,
		fetchedAt: Date.now(),
		validUntil,
	}
}

export function unwrap<T>(data: Timestamped<T> | null | undefined): T | undefined {
	return data?.value
}
