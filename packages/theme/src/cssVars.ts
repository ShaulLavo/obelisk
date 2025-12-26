import type { ThemePalette } from './types'

/**
 * Convert camelCase to kebab-case
 */
const toKebabCase = (str: string): string =>
	str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()

/**
 * Flatten theme object to CSS vars and apply to :root
 */
export const syncToCssVars = (palette: ThemePalette) => {
	const root = document.documentElement.style
	try {
		const flatten = (obj: Record<string, unknown>, prefix = '') => {
			if (!obj) return
			const entries = Object.entries(obj)

			for (const [key, value] of entries) {
				const kebabKey = toKebabCase(key)
				const varName = prefix ? `${prefix}-${kebabKey}` : kebabKey

				// Explicitly handle brackets if generic array handling fails (safety net)
				if (key === 'brackets' && Array.isArray(value)) {
					value.forEach((v, i) => {
						root.setProperty(`--brackets-${i}`, String(v))
					})
					continue
				}

				if (Array.isArray(value)) {
					value.forEach((v, i) => {
						const prop = `--${varName}-${i}`
						root.setProperty(prop, String(v))
					})
				} else if (typeof value === 'object' && value !== null) {
					flatten(value as Record<string, unknown>, varName)
				} else {
					const prop = `--${varName}`
					root.setProperty(prop, String(value))
				}
			}
		}
		// Unwrap the store if possible, or just pass it
		flatten(palette as unknown as Record<string, unknown>)
	} catch (err) {
		console.error('Failed to sync theme vars:', err)
	}
}
