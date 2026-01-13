/**
 * LayoutManagerContext
 *
 * Provides layoutManager at a high level so StatusBar and other components
 * outside of SplitEditorPanel can access active file information.
 *
 * This enables a single source of truth for "active file" via ActiveFileProvider.
 */

import { createContext, useContext, type JSX, onCleanup } from 'solid-js'
import { createPersistedLayoutManager, type PersistedLayoutManager } from '../../split-editor/createPersistedLayoutManager'
import { ActiveFileProvider } from './ActiveFileContext'

const LayoutManagerContext = createContext<PersistedLayoutManager>()

/**
 * Hook to access layout manager.
 * Throws if used outside provider.
 */
export function useLayoutManager(): PersistedLayoutManager {
	const context = useContext(LayoutManagerContext)
	if (!context) {
		throw new Error('useLayoutManager must be used within LayoutManagerProvider')
	}
	return context
}

interface LayoutManagerProviderProps {
	children: JSX.Element
}

/**
 * Provider that creates layoutManager and wraps children with ActiveFileProvider.
 * Place this just under FsProvider so StatusBar can access active file.
 */
export function LayoutManagerProvider(props: LayoutManagerProviderProps): JSX.Element {
	// Create the persisted layout manager
	// Note: We don't initialize here - SplitEditorPanel will do that after preloading
	const layoutManager = createPersistedLayoutManager()

	return (
		<LayoutManagerContext.Provider value={layoutManager}>
			<ActiveFileProvider layoutManager={layoutManager}>
				{props.children}
			</ActiveFileProvider>
		</LayoutManagerContext.Provider>
	)
}
