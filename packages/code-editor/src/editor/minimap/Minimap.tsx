import { ScrollStateProvider } from './ScrollState'
import type { MinimapProps } from './types'
import { MinimapView } from './MinimapView'

export const Minimap = (props: MinimapProps) => (
	<ScrollStateProvider>
		<MinimapView {...props} />
	</ScrollStateProvider>
)
