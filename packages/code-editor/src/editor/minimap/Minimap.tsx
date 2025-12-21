/**
 * Minimap Component
 *
 * The base canvas is transferred to the minimap worker and rendered entirely off the main thread.
 * The overlay canvas stays on the main thread for fast cursor/selection updates.
 */

import { ScrollStateProvider } from './ScrollState'
import type { MinimapProps } from './types'
import { MinimapView } from './MinimapView'

export const Minimap = (props: MinimapProps) => (
	<ScrollStateProvider>
		<MinimapView {...props} />
	</ScrollStateProvider>
)
