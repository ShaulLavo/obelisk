import { modifierAliases } from './constants'
import { resolveLogicalMod } from './platform'
import type { Modifier, Platform } from './types'

export function parseModifiers(s: string, platform: Platform): Set<Modifier> {
	const mods = new Set<Modifier>()
	const tokens = s.split(/\s+/).filter(Boolean)

	for (const token of tokens) {
		if (token === 'mod' || token === 'primary') {
			mods.add(resolveLogicalMod(platform))
			continue
		}

		const mapped = modifierAliases[token]
		if (!mapped) {
			throw new Error(`Unknown modifier: ${token}`)
		}
		mods.add(mapped)
	}

	return mods
}

const macOrder: Modifier[] = ['ctrl', 'alt', 'shift', 'meta']
const defaultOrder: Modifier[] = ['ctrl', 'shift', 'alt', 'meta']

export function sortModifiers(
	mods: Set<Modifier>,
	platform: Platform
): Modifier[] {
	const order = platform === 'mac' ? macOrder : defaultOrder
	const indexMap = new Map(order.map((modifier, idx) => [modifier, idx]))
	return Array.from(mods).sort((a, b) => {
		const ai = indexMap.get(a) ?? order.length
		const bi = indexMap.get(b) ?? order.length
		return ai - bi
	})
}
