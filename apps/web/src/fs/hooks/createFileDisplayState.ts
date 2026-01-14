import { createSignal } from 'solid-js'

export const createFileDisplayState = () => {
	const [loading, setLoading] = createSignal(false)
	const [saving, setSaving] = createSignal(false)

	return {
		loading,
		setLoading,
		saving,
		setSaving,
	}
}
