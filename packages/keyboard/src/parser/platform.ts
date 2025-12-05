import type { Modifier, Platform } from './types'

export function detectPlatform(): Platform {
	if (typeof navigator !== 'undefined' && navigator.platform) {
		const p = navigator.platform.toLowerCase()
		if (p.includes('mac')) return 'mac'
		if (p.includes('win')) return 'windows'
		return 'linux'
	}

	if (
		typeof process !== 'undefined' &&
		typeof (process as any).platform === 'string'
	) {
		const p = (process as any).platform
		if (p === 'darwin') return 'mac'
		if (p.startsWith('win')) return 'windows'
		return 'linux'
	}

	return 'windows'
}

export function resolveLogicalMod(platform: Platform): Modifier {
	return platform === 'mac' ? 'meta' : 'ctrl'
}
