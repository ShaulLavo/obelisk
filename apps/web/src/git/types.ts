export type GitProgressStage =
	| 'refs'
	| 'pack'
	| 'walk'
	| 'objects'
	| 'done'
	| 'error'

export type GitProgressMessage = {
	stage: GitProgressStage
	message: string
	detail?: Record<string, unknown>
}

export type GitProgressCallback = (
	message: GitProgressMessage
) => void | Promise<void>

export type GitFile = {
	path: string
	content: Uint8Array
	mode?: string
}

export type GitFileCallback = (file: GitFile) => void | Promise<void>

export type GitWorkerConfig = {
	proxyUrl?: string
	authToken?: string
	userAgent?: string
}

export type GitCloneRequest = {
	repoUrl: string
	ref?: string
	proxyUrl?: string
	authToken?: string
}

export type GitCloneResult = {
	commitHash: string
	ref: string
	fileCount: number
}

export type GitWorkerApi = {
	init: (config?: GitWorkerConfig) => void
	clone: (
		request: GitCloneRequest,
		onProgress?: GitProgressCallback,
		onFile?: GitFileCallback
	) => Promise<GitCloneResult>
}
