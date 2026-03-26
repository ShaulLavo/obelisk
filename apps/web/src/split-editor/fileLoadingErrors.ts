/**
 * Re-export from canonical location in the fs module.
 *
 * fileLoadingErrors was moved to `fs/fileLoadingErrors.ts` because
 * it is fundamentally about file-system operations and was causing a
 * bidirectional dependency between the fs and split-editor modules.
 * This re-export keeps existing split-editor-internal imports working.
 */
export {
	type FileLoadingErrorType,
	type FileLoadingError,
	MAX_FILE_SIZE,
	MAX_RETRY_ATTEMPTS,
	RETRY_BASE_DELAY,
	createFileTooLargeError,
	classifyError,
	calculateRetryDelay,
	shouldRetry,
	getErrorTitle,
} from '../fs/fileLoadingErrors'
