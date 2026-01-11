import { client } from '../client'

export async function loadNerdFont(
	fontName: string
): Promise<FontFace | undefined> {
	// Check if already loaded
	if (document.fonts.check(`1em ${fontName}`)) {
		return Array.from(document.fonts).find((f) => f.family === fontName)
	}

	try {
		const { data, error } = await client.fonts({ name: fontName }).get()

		if (error || !data) {
			console.error('Failed to load font:', error)
			return undefined
		}

		const buffer =
			data instanceof ArrayBuffer
				? data
				: data instanceof Response
					? await data.arrayBuffer()
					: await (data as unknown as Blob).arrayBuffer()
		const font = new FontFace(fontName, buffer)
		document.fonts.add(font)
		await font.load()
		await font.load()
		return font
	} catch (err) {
		console.error('Error loading font:', err)
		return undefined
	}
}
