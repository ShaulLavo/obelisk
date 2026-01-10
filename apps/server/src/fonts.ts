import * as cheerio from 'cheerio'
import JSZip from 'jszip'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import subsetFont from 'subset-font'
import crypto from 'node:crypto'

// Cache directories
const CACHE_DIR = path.join(__dirname, '..', '.cache')
const FONTS_DIR = path.join(CACHE_DIR, 'fonts')
const PREVIEW_CACHE_DIR = path.join(CACHE_DIR, 'previews')
const FONT_LINKS_FILE = path.join(CACHE_DIR, 'font-links.json')
const DEFAULT_PREVIEW_TEXT = 'The quick brown fox jumps 0123'

async function ensureCacheDirs() {
	if (!existsSync(FONTS_DIR)) {
		await fs.mkdir(FONTS_DIR, { recursive: true })
	}
}

export async function getNerdFontLinks(): Promise<{
	[fontName: string]: string
}> {
	await ensureCacheDirs()

	if (existsSync(FONT_LINKS_FILE)) {
		const content = await fs.readFile(FONT_LINKS_FILE, 'utf-8')
		return JSON.parse(content)
	}

	console.log('Fetching Nerd Fonts links...')
	const response = await fetch('https://www.nerdfonts.com/font-downloads')
	const html = await response.text()
	const $ = cheerio.load(html)

	const links = $('a')
		.filter((_, link) => $(link).text().trim().toLowerCase() === 'download')
		.toArray()
		.reduce(
			(acc, link) => {
				const href = $(link).attr('href')
				if (!href) return acc

				const fontName = href.split('/').pop()?.replace('.zip', '')
				if (fontName) {
					acc[fontName] = href
				}
				return acc
			},
			{} as { [fontName: string]: string }
		)

	await fs.writeFile(FONT_LINKS_FILE, JSON.stringify(links, null, 2))
	return links
}

export async function getExtractedFont(
	fontName: string
): Promise<ArrayBuffer | null> {
	await ensureCacheDirs()

	const cachedFontPath = path.join(FONTS_DIR, `${fontName}.ttf`)
	if (existsSync(cachedFontPath)) {
		console.log(`Serving cached font: ${fontName}`)
		const buffer = await fs.readFile(cachedFontPath)
		return buffer.buffer as ArrayBuffer
	}

	console.log(`Downloading and extracting font: ${fontName}`)
	const links = await getNerdFontLinks()
	const zipUrl = links[fontName]

	if (!zipUrl) {
		console.error(`Font not found: ${fontName}`)
		return null
	}

	const response = await fetch(zipUrl)
	if (!response.ok) {
		console.error(`Failed to download font: ${zipUrl}`)
		return null
	}

	const blob = await response.blob()
	const arrayBuffer = await blob.arrayBuffer()

	const zip = new JSZip()
	const zipContent = await zip.loadAsync(arrayBuffer)

	// Find the Regular font file
	// Priorities:
	// 1. "Nerd Font Complete Regular" (older naming?)
	// 2. "*Regular.ttf" or "*Regular.otf"
	// 3. Fallback to any ttf/otf if needed, but we look for Regular first.

	const files = Object.keys(zipContent.files)
	const regularFontFile =
		files.find(
			(filename) =>
				(filename.endsWith('Regular.ttf') ||
					filename.endsWith('Regular.otf')) &&
				!filename.includes('Windows Compatible') // Prefer standard
		) ||
		files.find(
			(filename) => filename.endsWith('.ttf') || filename.endsWith('.otf')
		)

	if (!regularFontFile) {
		console.error(`No suitable font file found in zip for ${fontName}`)
		return null
	}

	const fontData = await zipContent.file(regularFontFile)?.async('arraybuffer')

	if (!fontData) {
		console.error(`Failed to read font file from zip: ${regularFontFile}`)
		return null
	}

	// Save to cache
	// Note: We always save as .ttf for simplicity in cache naming, but the content might be OTF.
	// The browser FontFace API handles both.
	await fs.writeFile(cachedFontPath, Buffer.from(fontData))

	return fontData
}

export async function getPreviewSubset(
	fontName: string,
	previewText: string = DEFAULT_PREVIEW_TEXT
): Promise<Buffer | null> {
	await ensureCacheDirs()

	const textHash = crypto
		.createHash('md5')
		.update(previewText)
		.digest('hex')
		.slice(0, 8)
	const cachedPreviewPath = path.join(
		PREVIEW_CACHE_DIR,
		`${fontName}-${textHash}.woff2`
	)

	if (existsSync(cachedPreviewPath)) {
		return await fs.readFile(cachedPreviewPath)
	}

	const fullFont = await getExtractedFont(fontName)
	if (!fullFont) return null

	const subset = await subsetFont(Buffer.from(fullFont), previewText, {
		targetFormat: 'woff2',
	})

	await fs.mkdir(PREVIEW_CACHE_DIR, { recursive: true })
	await fs.writeFile(cachedPreviewPath, subset)

	return subset
}

export async function getBatchFonts(
	fontNames: string[]
): Promise<{ [fontName: string]: ArrayBuffer | null }> {
	await ensureCacheDirs()

	const results = await Promise.allSettled(
		fontNames.map(async (name) => ({
			name,
			data: await getExtractedFont(name),
		}))
	)

	return results.reduce(
		(acc, result) => {
			if (result.status === 'fulfilled' && result.value.data) {
				acc[result.value.name] = result.value.data
			}
			return acc
		},
		{} as { [fontName: string]: ArrayBuffer | null }
	)
}
