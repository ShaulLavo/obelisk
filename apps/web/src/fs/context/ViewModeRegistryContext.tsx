/**
 * SolidJS context for the ViewModeRegistry.
 *
 * Provides the registry via context so that components and hooks can
 * consume it without importing the module-level singleton directly.
 * This decouples consumers from the concrete instantiation strategy
 * and makes testing/mocking straightforward.
 */

import { createContext, useContext, type JSX } from 'solid-js'
import { getViewModeRegistry } from '../registry/ViewModeRegistry'
import type { ViewModeRegistryReader } from '../../shared/viewMode'

const ViewModeRegistryContext = createContext<ViewModeRegistryReader>()

export function ViewModeRegistryProvider(props: { children: JSX.Element }) {
	const registry = getViewModeRegistry()

	return (
		<ViewModeRegistryContext.Provider value={registry}>
			{props.children}
		</ViewModeRegistryContext.Provider>
	)
}

/**
 * Access the ViewModeRegistry from context.
 * Must be called inside a `<ViewModeRegistryProvider>`.
 */
export function useViewModeRegistry(): ViewModeRegistryReader {
	const ctx = useContext(ViewModeRegistryContext)
	if (!ctx) {
		throw new Error('useViewModeRegistry must be used within a ViewModeRegistryProvider')
	}
	return ctx
}
