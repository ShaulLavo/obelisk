type FontMetricSetters = {
	setFontSize: (value: number) => void
	setFontFamily: (value: string) => void
}

const measurementContext =
	typeof document === 'undefined'
		? null
		: (document
				.createElement('canvas')
				.getContext('2d') as CanvasRenderingContext2D | null)

export const measureCharWidth = (size: number, family: string) => {
	if (!measurementContext) return size * 0.6
	measurementContext.font = `${size}px ${family}`
	return measurementContext.measureText('M').width
}

export const syncFontMetricsFromElement = (
	el: HTMLElement,
	setters: FontMetricSetters
) => {
	const style = window.getComputedStyle(el)

	const parsedFontSize = Number.parseFloat(style.fontSize)
	if (!Number.isNaN(parsedFontSize)) {
		setters.setFontSize(parsedFontSize)
	}

	const family = style.fontFamily?.trim()
	if (family) {
		setters.setFontFamily(family)
	}
}
