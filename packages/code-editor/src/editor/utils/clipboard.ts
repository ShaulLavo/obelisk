const createHiddenTextarea = () => {
	const textarea = document.createElement('textarea')
	textarea.style.position = 'fixed'
	textarea.style.opacity = '0'
	textarea.style.pointerEvents = 'none'
	textarea.style.left = '-9999px'
	document.body.appendChild(textarea)
	return textarea
}

const execCommandCopy = (text: string) => {
	const textarea = createHiddenTextarea()
	textarea.value = text
	textarea.select()
	try {
		document.execCommand('copy')
	} finally {
		document.body.removeChild(textarea)
	}
}

const execCommandPaste = (): string => {
	const textarea = createHiddenTextarea()
	textarea.value = ''
	textarea.focus()
	try {
		const ok = document.execCommand('paste')
		if (!ok) return ''
		return textarea.value
	} finally {
		document.body.removeChild(textarea)
	}
}

const writeClipboardItem = async (text: string): Promise<boolean> => {
	try {
		if (typeof ClipboardItem === 'undefined') return false

		const type = 'text/plain'
		const item = new ClipboardItem({ [type]: text })
		await navigator.clipboard.write([item])
		return true
	} catch {
		return false
	}
}

const writeNavigatorText = async (text: string): Promise<boolean> => {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		return false
	}
}

const readClipboardItem = async (): Promise<string | null> => {
	try {
		const items = await navigator.clipboard.read()
		for (const item of items) {
			if (item.types.includes('text/plain')) {
				const blob = await item.getType('text/plain')
				return await blob.text()
			}
		}
		return null
	} catch {
		return null
	}
}

const readNavigatorText = async (): Promise<string | null> => {
	try {
		return await navigator.clipboard.readText()
	} catch {
		return null
	}
}

export const clipboard = {
	writeText: async (text: string): Promise<void> => {
		if (!text) return

		// if (await writeClipboardItem(text)) return
		if (await writeNavigatorText(text)) return

		execCommandCopy(text)
	},

	readText: async (): Promise<string> => {
		// const fromItem = await readClipboardItem()
		// if (fromItem !== null) return fromItem

		const fromText = await readNavigatorText()
		if (fromText !== null) return fromText

		return execCommandPaste()
	},
}
