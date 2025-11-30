const formatBytes = (bytes: number): string => {
	if (!Number.isFinite(bytes) || bytes < 0) return '0 Bytes'
	if (bytes === 0) return '0 Bytes'

	const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'] as const
	const maxIndex = units.length - 1
	const unclampedIndex = Math.floor(Math.log(bytes) / Math.log(1024))
	const index = Math.min(Math.max(unclampedIndex, 0), maxIndex)

	const value = bytes / 1024 ** index
	const formattedValue = Number.isInteger(value) ? value.toString() : value.toFixed(2)

	return `${formattedValue} ${units[index]}`
}
export { formatBytes }
