// TODO delete this, we might have a parse file function in the future
// keeping this for reference for that case

export async function countLinesInFile(file: File) {
	const reader = file.stream().getReader()

	try {
		const decoder = new TextDecoder('utf-8')

		let lines = 0
		let lastText = ''

		const { value, done } = await reader.read()

		if (done) {
			return 0
		}

		let text = decoder.decode(value, { stream: true })
		lastText = text
		lines += text.split('\n').length - 1

		while (true) {
			const result = await reader.read()
			if (result.done) break

			text = decoder.decode(result.value, { stream: true })
			if (text.length === 0) continue

			lastText = text
			lines += text.split('\n').length - 1
		}

		if (!lastText.endsWith('\n')) {
			lines++
		}

		return lines
	} finally {
		reader.releaseLock()
	}
}
