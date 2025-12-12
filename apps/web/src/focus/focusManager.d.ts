import { type Accessor, type ParentComponent } from 'solid-js'
export type FocusArea = 'global' | 'terminal' | 'editor' | 'fileTree'
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
export declare const FocusProvider: ParentComponent
export declare const useFocusManager: () => FocusManagerContext
export {}
//# sourceMappingURL=focusManager.d.ts.map
