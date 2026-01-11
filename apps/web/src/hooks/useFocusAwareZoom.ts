import { useFocusManager, type FocusArea } from '../focus/focusManager'
import { createFontZoomStore, type FontModule } from './createFontZoomStore'
import { useSettings } from '../settings/SettingsProvider'

export type FocusAwareZoomActions = {
	zoomFocused: (direction: 'in' | 'out') => void
	resetFocusedZoom: () => void
	getCurrentModule: () => FontModule
}

const mapFocusAreaToModule = (area: FocusArea): FontModule => {
	switch (area) {
		case 'editor':
			return 'editor'
		case 'terminal':
			return 'terminal'
		case 'fileTree':
		case 'global':
		default:
			return 'ui'
	}
}

export const useFocusAwareZoom = (): FocusAwareZoomActions => {
	const focusManager = useFocusManager()
	const fontZoomStore = createFontZoomStore()
	const [, settingsActions] = useSettings()

	const getCurrentModule = (): FontModule => {
		const activeArea = focusManager.activeArea()
		return mapFocusAreaToModule(activeArea)
	}

	const zoomFocused = (direction: 'in' | 'out') => {
		const module = getCurrentModule()
		
		// Get current font size from settings
		const currentSize = settingsActions.getSetting<number>(`${module}.font.size`)
		
		// Calculate new size
		const newSize = direction === 'in' 
			? Math.min(48, currentSize + 1)
			: Math.max(6, currentSize - 1)
		
		// Update the actual font size setting
		settingsActions.setSetting(`${module}.font.size`, newSize)
		
		// Reset zoom offset since we're updating the base size
		fontZoomStore.actions.resetZoom(module)
	}

	const resetFocusedZoom = () => {
		const module = getCurrentModule()
		fontZoomStore.actions.resetZoom(module)
	}

	return {
		zoomFocused,
		resetFocusedZoom,
		getCurrentModule,
	}
}
