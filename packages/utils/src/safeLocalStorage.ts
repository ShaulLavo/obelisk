// Safe wrappers around localStorage that return null / no-op on any error.

export function safeGetItem(key: string): string | null {
	try {
		return window.localStorage.getItem(key)
	} catch (error) {
		return null
	}
}

export function safeSetItem(key: string, value: string): void {
	try {
		window.localStorage.setItem(key, value)
	} catch (error) {
		// no-op
	}
}

export function safeRemoveItem(key: string): void {
	try {
		window.localStorage.removeItem(key)
	} catch (error) {
		// no-op
	}
}

export function createMemorySafeStorage() {
	if (typeof window === 'undefined') {
		return undefined
	}

	return {
		getItem: (key: string): string | null => {
			return safeGetItem(key)
		},
		setItem: (key: string, value: string): void => {
			safeSetItem(key, value)
		},
		removeItem: (key: string): void => {
			safeRemoveItem(key)
		},
	}
}
