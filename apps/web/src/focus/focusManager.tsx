import {
	createContext,
	createSignal,
	onCleanup,
	useContext,
	type Accessor,
	type ParentComponent
} from 'solid-js'
import { IS_DEV } from '~/env'
import { logger } from '~/logger'

export type FocusArea = 'global' | 'terminal' | 'editor' | 'fileTree'

type AreaRegistration = {
	area: FocusArea
	resolver: () => HTMLElement | null
}

type FocusManagerContext = {
	activeArea: Accessor<FocusArea>
	setActiveArea: (area: FocusArea) => void
	registerArea: (
		area: FocusArea,
		resolver: () => HTMLElement | null
	) => () => void
	isActive: (area: FocusArea) => boolean
	activeScopes: () => FocusArea[]
}

const FocusContext = createContext<FocusManagerContext>()
const focusLogger = logger.withTag('focus')

export const FocusProvider: ParentComponent = props => {
	const [activeArea, setActiveArea] = createSignal<FocusArea>('global')
	const registrations = new Map<symbol, AreaRegistration>()
	const doc = typeof window !== 'undefined' ? window.document : null

	const log = (next: FocusArea, reason: string) => {
		if (!IS_DEV) return
		focusLogger.info(`[focus] active area -> ${next} (${reason})`)
	}

	const applyActiveArea = (next: FocusArea, reason: string) => {
		setActiveArea(prev => {
			if (prev === next) return prev
			log(next, reason)
			return next
		})
	}

	const resolveAreaForTarget = (target: EventTarget | null): FocusArea => {
		if (!(target instanceof Node)) {
			return 'global'
		}

		for (const entry of registrations.values()) {
			const element = entry.resolver()
			if (element && element.contains(target)) {
				return entry.area
			}
		}

		return 'global'
	}

	const handleGlobalEvent = (event: Event) => {
		const next = resolveAreaForTarget(event.target)
		applyActiveArea(next, event.type)
	}

	if (doc) {
		doc.addEventListener('pointerdown', handleGlobalEvent, true)
		doc.addEventListener('focusin', handleGlobalEvent, true)
	}

	onCleanup(() => {
		if (!doc) return
		doc.removeEventListener('pointerdown', handleGlobalEvent, true)
		doc.removeEventListener('focusin', handleGlobalEvent, true)
	})

	const registerArea: FocusManagerContext['registerArea'] = (
		area,
		resolver
	) => {
		const id = Symbol(area)
		registrations.set(id, { area, resolver })

		const dispose = () => {
			registrations.delete(id)
		}

		onCleanup(dispose)

		return dispose
	}

	const contextValue: FocusManagerContext = {
		activeArea,
		setActiveArea: area => applyActiveArea(area, 'manual'),
		registerArea,
		isActive: area => activeArea() === area,
		activeScopes: () => {
			const area = activeArea()
			return area === 'global' ? ['global'] : [area, 'global']
		}
	}

	return (
		<FocusContext.Provider value={contextValue}>
			{props.children}
		</FocusContext.Provider>
	)
}

export const useFocusManager = () => {
	const context = useContext(FocusContext)
	if (!context) {
		throw new Error('useFocusManager must be used within a FocusProvider')
	}
	return context
}
