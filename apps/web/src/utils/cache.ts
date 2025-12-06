export const touchCacheEntry = (order: string[], path: string) => {
	const index = order.indexOf(path)
	if (index !== -1) {
		order.splice(index, 1)
	}
	order.push(path)
}

export const removeCacheEntry = (order: string[], path: string) => {
	const index = order.indexOf(path)
	if (index !== -1) {
		order.splice(index, 1)
	}
}

export const evictCacheEntries = (
	order: string[],
	limit: number,
	onEvict: (path: string) => void
) => {
	while (order.length > limit) {
		const oldest = order.shift()
		if (oldest) {
			onEvict(oldest)
		}
	}
}
