import { createSignal } from 'solid-js'

export const createPrefetchIndicators = () => {
	const [backgroundPrefetching, setBackgroundPrefetching] = createSignal(false)
	const [backgroundLoadedCount, setBackgroundLoadedCount] = createSignal(0)
	const [lastPrefetchedPath, setLastPrefetchedPath] = createSignal<
		string | undefined
	>(undefined)
	const [prefetchError, setPrefetchError] = createSignal<string | undefined>(
		undefined
	)

	return {
		backgroundPrefetching,
		setBackgroundPrefetching,
		backgroundLoadedCount,
		setBackgroundLoadedCount,
		lastPrefetchedPath,
		setLastPrefetchedPath,
		prefetchError,
		setPrefetchError
	}
}
