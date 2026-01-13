import {
	createFileSystemObserver,
	type FileSystemChangeRecord,
	type FileSystemObserverPolyfill,
} from '@repo/fs'
import { onCleanup } from 'solid-js'

type UseFileSystemObserverOptions = {
	/** Get the root directory handle for observation */
	getRootHandle: () => FileSystemDirectoryHandle | undefined
	/** Polling interval in ms (default 1000) */
	pollIntervalMs?: number
}

/**
 * Hook to observe file system changes.
 * Currently just sets up the observer infrastructure.
 * Event handling is not yet implemented.
 */
export const useFileSystemObserver = ({
	getRootHandle,
	pollIntervalMs = 1000,
}: UseFileSystemObserverOptions) => {
	let observer: FileSystemObserverPolyfill | null = null
	let isObserving = false

	const handleChangeRecords = async (_records: FileSystemChangeRecord[]) => {
		// Event handling not yet implemented
	}

	const startObserving = async () => {
		const rootHandle = getRootHandle()
		if (!rootHandle) {
			return
		}

		if (isObserving) {
			return
		}

		observer = createFileSystemObserver((records) => {
			void handleChangeRecords(records)
		}, pollIntervalMs)

		try {
			await observer.observe(rootHandle, { recursive: true })
			isObserving = true
		} catch {
			// Failed to start observing
		}
	}

	const stopObserving = () => {
		if (observer) {
			observer.disconnect()
			observer = null
			isObserving = false
		}
	}

	onCleanup(() => {
		stopObserving()
	})

	return {
		startObserving,
		stopObserving,
		get isObserving() {
			return isObserving
		},
	}
}
