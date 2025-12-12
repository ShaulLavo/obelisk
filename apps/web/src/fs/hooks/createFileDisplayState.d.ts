export declare const createFileDisplayState: () => {
	selectedFileSize: import('solid-js').Accessor<number | undefined>
	setSelectedFileSize: import('solid-js').Setter<number | undefined>
	selectedFilePreviewBytes: import('solid-js').Accessor<
		Uint8Array<ArrayBufferLike> | undefined
	>
	setSelectedFilePreviewBytes: import('solid-js').Setter<
		Uint8Array<ArrayBufferLike> | undefined
	>
	selectedFileContent: import('solid-js').Accessor<string>
	setSelectedFileContent: import('solid-js').Setter<string>
	selectedFileLoading: import('solid-js').Accessor<boolean>
	setSelectedFileLoading: import('solid-js').Setter<boolean>
	error: import('solid-js').Accessor<string | undefined>
	setError: import('solid-js').Setter<string | undefined>
	loading: import('solid-js').Accessor<boolean>
	setLoading: import('solid-js').Setter<boolean>
}
//# sourceMappingURL=createFileDisplayState.d.ts.map
