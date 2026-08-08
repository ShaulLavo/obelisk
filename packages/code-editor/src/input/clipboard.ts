/**
 * Clipboard operations for the editor.
 *
 * Provides async read/write with fallback to execCommand for
 * environments without the Clipboard API.
 *
 * Framework-free — only uses standard Web APIs.
 */

/** Write text to the system clipboard. */
export const writeClipboardText = async (text: string): Promise<void> => {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text)
			return
		} catch {
			// Fall through to execCommand fallback
		}
	}
	execCommandCopy(text)
}

/** Read text from the system clipboard. */
export const readClipboardText = async (): Promise<string> => {
	if (navigator.clipboard?.readText) {
		try {
			return await navigator.clipboard.readText()
		} catch {
			// Fall through — readText may be denied by permissions
		}
	}
	return ''
}

// ---------------------------------------------------------------------------
// execCommand fallback
// ---------------------------------------------------------------------------

const execCommandCopy = (text: string): void => {
	const textarea = document.createElement('textarea')
	textarea.value = text
	textarea.style.position = 'fixed'
	textarea.style.left = '-9999px'
	textarea.style.top = '-9999px'
	document.body.appendChild(textarea)
	textarea.select()
	try {
		document.execCommand('copy')
	} finally {
		document.body.removeChild(textarea)
	}
}
