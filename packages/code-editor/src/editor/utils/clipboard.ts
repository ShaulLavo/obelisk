import { loggers } from '@repo/logger'

const clipboardLogger = loggers.codeEditor.withTag('clipboard')

const createHiddenTextarea = () => {
	const textarea = document.createElement('textarea')
	textarea.style.position = 'fixed'
	textarea.style.opacity = '0'
	textarea.style.pointerEvents = 'none'
	textarea.style.left = '-9999px'
	document.body.appendChild(textarea)
	return textarea
}

const legacyCopy = (text: string) => {
	const textarea = createHiddenTextarea()
	textarea.value = text
	textarea.select()
	try {
		document.execCommand('copy')
	} catch {
		clipboardLogger.debug('Failed to copy')
	} finally {
		document.body.removeChild(textarea)
	}
}

const legacyPaste = (): string => {
	const textarea = createHiddenTextarea()
	textarea.value = ''
	textarea.focus()
	try {
		const ok = document.execCommand('paste')
		if (!ok) return ''
		return textarea.value
	} catch {
		clipboardLogger.debug('Failed to paste')

		return ''
	} finally {
		document.body.removeChild(textarea)
	}
}

export const clipboard = {
	writeText: async (text: string): Promise<void> => {
		if (!text) return
		try {
			await navigator.clipboard.writeText(text)
		} catch {
			legacyCopy(text)
		}
	},
	readText: async (): Promise<string> => {
		try {
			return await navigator.clipboard.readText()
		} catch {
			return legacyPaste()
		}
	}
}
