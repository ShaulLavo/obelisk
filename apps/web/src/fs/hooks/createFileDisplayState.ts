import { createSignal } from 'solid-js'

export const createFileDisplayState = () => {
	const [selectedFileSize, setSelectedFileSize] = createSignal<
		number | undefined
	>(undefined)
	const [selectedFilePreviewBytes, setSelectedFilePreviewBytes] = createSignal<
		Uint8Array | undefined
	>(undefined)
	const [selectedFileContent, setSelectedFileContent] = createSignal('')
	const [selectedFileLoading, setSelectedFileLoading] = createSignal(false)
	const [loading, setLoading] = createSignal(false)
	const [saving, setSaving] = createSignal(false)

	return {
		selectedFileSize,
		setSelectedFileSize,
		selectedFilePreviewBytes,
		setSelectedFilePreviewBytes,
		selectedFileContent,
		setSelectedFileContent,
		selectedFileLoading,
		setSelectedFileLoading,
		loading,
		setLoading,
		saving,
		setSaving,
	}
}
