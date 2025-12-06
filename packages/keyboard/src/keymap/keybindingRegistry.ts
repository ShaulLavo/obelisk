import { createShortcutSequenceMatcher } from '../parser/sequenceMatcher'
import { parseShortcut, parseShortcutSequence } from '../parser/shortcut'
import type {
	KeybindingDescriptor,
	KeybindingMatch,
	KeybindingOptions,
	KeybindingRegistration,
	KeybindingSnapshot
} from './types'
import type {
	KeyCombo,
	ShortcutSequence,
	ShortcutSequenceMatcherOptions
} from '../parser/types'

type InternalKeybinding = {
	snapshot: KeybindingSnapshot
	matcher: ReturnType<typeof createShortcutSequenceMatcher>
	matcherOptions: ShortcutSequenceMatcherOptions
	sequenceKey: string
}

function splitOptions(options: KeybindingOptions = {}) {
	const {
		label,
		priority = 0,
		preventDefault = false,
		stopPropagation = false,
		meta,
		...matcherOptions
	} = options

	return {
		label,
		priority,
		preventDefault,
		stopPropagation,
		meta,
		matcherOptions
	}
}

function serializeCombo(combo: KeyCombo): string {
	const modifiers = Array.from(combo.modifiers).sort().join('+')
	return `${modifiers}>${combo.key}`
}

function toSequenceKey(sequence: ShortcutSequence): string {
	return sequence.map(serializeCombo).join(',')
}

export function createKeybindingRegistry() {
	const bindings = new Map<string, InternalKeybinding>()
	const shortcutIndex = new Map<string, Set<string>>()
	let autoIdCounter = 0

	function ensureSequence(
		input: string | ShortcutSequence,
		options: ShortcutSequenceMatcherOptions = {}
	): ShortcutSequence {
		if (typeof input !== 'string') {
			return input
		}
		const trimmed = input.trim()
		if (!trimmed) {
			throw new Error('Keybinding shortcut cannot be empty')
		}
		const parseOptions = {
			platform: options.platform,
			treatEqualAsDistinct: options.treatEqualAsDistinct
		}

		if (trimmed.startsWith('[')) {
			return parseShortcutSequence(trimmed, parseOptions)
		}
		return [parseShortcut(trimmed, parseOptions)]
	}

	function reserveId(baseKey: string, explicitId?: string): string {
		if (explicitId) {
			if (bindings.has(explicitId)) {
				throw new Error(`Keybinding with id "${explicitId}" already exists`)
			}
			return explicitId
		}

		let id: string
		do {
			autoIdCounter += 1
			id = `binding:${baseKey || 'auto'}#${autoIdCounter}`
		} while (bindings.has(id))
		return id
	}

	function addToIndex(sequenceKey: string, bindingId: string) {
		const existing = shortcutIndex.get(sequenceKey)
		if (existing) {
			existing.add(bindingId)
			return
		}
		shortcutIndex.set(sequenceKey, new Set([bindingId]))
	}

	function removeFromIndex(sequenceKey: string, bindingId: string) {
		const set = shortcutIndex.get(sequenceKey)
		if (!set) return
		set.delete(bindingId)
		if (set.size === 0) {
			shortcutIndex.delete(sequenceKey)
		}
	}

	function register(binding: KeybindingDescriptor): KeybindingRegistration {
		const parts = splitOptions(binding.options)
		const sequence = ensureSequence(binding.shortcut, parts.matcherOptions)
		const seqKey = toSequenceKey(sequence)
		const bindingId = reserveId(seqKey, binding.id?.trim())

		const matcher = createShortcutSequenceMatcher(
			sequence,
			parts.matcherOptions
		)

		const record: InternalKeybinding = {
			snapshot: {
				id: bindingId,
				shortcut: sequence,
				label: parts.label,
				priority: parts.priority,
				preventDefault: parts.preventDefault,
				stopPropagation: parts.stopPropagation,
				meta: parts.meta
			},
			matcher,
			matcherOptions: parts.matcherOptions,
			sequenceKey: seqKey
		}

		bindings.set(bindingId, record)
		addToIndex(seqKey, bindingId)

		return {
			id: bindingId,
			dispose: () => {
				bindings.delete(bindingId)
				removeFromIndex(seqKey, bindingId)
			}
		}
	}

	function match(event: KeyboardEvent): KeybindingMatch[] {
		const matches: KeybindingMatch[] = []

		if (bindings.size === 0) {
			return matches
		}

		for (const binding of bindings.values()) {
			if (binding.matcher.handleEvent(event)) {
				matches.push({
					id: binding.snapshot.id,
					event,
					binding: binding.snapshot
				})
			}
		}

		return matches
	}

	function reset(bindingId?: string) {
		if (bindingId) {
			bindings.get(bindingId)?.matcher.reset()
			return
		}
		for (const binding of bindings.values()) {
			binding.matcher.reset()
		}
	}

	function getSnapshot(id: string) {
		return bindings.get(id)?.snapshot
	}

	function list(): KeybindingSnapshot[] {
		return Array.from(bindings.values(), entry => entry.snapshot)
	}

	function findByShortcut(
		shortcut: string | ShortcutSequence,
		options: ShortcutSequenceMatcherOptions = {}
	): KeybindingSnapshot[] {
		const sequence = ensureSequence(shortcut, options)
		const key = toSequenceKey(sequence)
		const matches = shortcutIndex.get(key)
		if (!matches) return []
		const snapshots: KeybindingSnapshot[] = []
		for (const id of matches) {
			const snapshot = bindings.get(id)?.snapshot
			if (snapshot) {
				snapshots.push(snapshot)
			}
		}
		return snapshots
	}

	return {
		register,
		match,
		reset,
		getSnapshot,
		list,
		findByShortcut
	}
}
