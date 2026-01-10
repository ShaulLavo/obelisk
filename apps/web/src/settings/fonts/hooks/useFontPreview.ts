import { createSignal, onCleanup } from 'solid-js'
import { client } from '~/client'

const PREVIEW_TEXT = 'The quick brown fox jumps 0123'

export function useFontPreview(fontName: () => string) {
	const [ref, setRef] = createSignal<HTMLElement | null>(null)
	const [isVisible, setIsVisible] = createSignal(false)
	const [fontFamily, setFontFamily] = createSignal<string | null>(null)
	const [isLoading, setIsLoading] = createSignal(false)

	let fontFace: FontFace | null = null

	// Intersection observer for visibility
	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				setIsVisible(entry.isIntersecting)
				if (entry.isIntersecting && !fontFamily() && !isLoading()) {
					loadPreview()
				}
			})
		},
		{ rootMargin: '100px' }
	)

	const loadPreview = async () => {
		setIsLoading(true)
		try {
			const previewFamilyName = `preview-${fontName()}`

			// Fetch subset via RPC
			const { data, error } = await client
				.fonts({ name: fontName() })
				.preview.get({ query: { text: PREVIEW_TEXT } })

			if (error || !data) throw new Error('Failed to load preview')

			// Register font
			const fontData = await (data as Blob).arrayBuffer()
			fontFace = new FontFace(previewFamilyName, fontData)
			await fontFace.load()
			document.fonts.add(fontFace)

			setFontFamily(previewFamilyName)
		} catch (err) {
			console.warn(`[useFontPreview] Failed for ${fontName()}:`, err)
		} finally {
			setIsLoading(false)
		}
	}

	// Cleanup when element leaves viewport or component unmounts
	onCleanup(() => {
		observer.disconnect()
		if (fontFace) {
			document.fonts.delete(fontFace)
			fontFace = null
		}
	})

	// Setup observer when ref changes
	const registerRef = (el: HTMLElement | null) => {
		const prev = ref()
		if (prev) observer.unobserve(prev)
		setRef(el)
		if (el) observer.observe(el)
	}

	return {
		ref: registerRef,
		fontFamily,
		isLoading,
		isVisible,
	}
}
