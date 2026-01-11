import { modal, type ModalAction } from './modal'

export type ErrorDetails = {
	message: string
	stack?: string
	name?: string
	cause?: unknown
}

export type ErrorModalOptions = {
	title?: string
	error: Error | ErrorDetails | string
	actions?: ModalAction[]
	dismissable?: boolean
}

const formatError = (error: Error | ErrorDetails | string): ErrorDetails => {
	if (typeof error === 'string') {
		return { message: error }
	}
	
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
			cause: error.cause
		}
	}
	
	return error
}

const formatStackTrace = (stack?: string): string => {
	if (!stack) return ''
	
	// Clean up the stack trace for better readability
	return stack
		.split('\n')
		.filter(line => line.trim())
		.map(line => line.trim())
		.join('\n')
}

export { formatError, formatStackTrace }

export const showErrorModal = (options: ErrorModalOptions): string => {
	const errorDetails = formatError(options.error)
	const formattedStack = formatStackTrace(errorDetails.stack)
	
	const errorBody = () => {
		const parts = []
		
		if (errorDetails.name && errorDetails.name !== 'Error') {
			parts.push(`[${errorDetails.name}] ${errorDetails.message}`)
		} else {
			parts.push(errorDetails.message)
		}
		
		if (errorDetails.cause) {
			parts.push(`\nCause: ${String(errorDetails.cause)}`)
		}
		
		if (formattedStack) {
			parts.push(`\nStack Trace:\n\`\`\`\n${formattedStack}\n\`\`\``)
		}
		
		return parts.join('\n')
	}
	
	const defaultActions: ModalAction[] = [
		{
			id: 'close',
			label: 'Close',
			variant: 'secondary',
			autoClose: true
		}
	]
	
	return modal({
		heading: options.title || 'Error',
		body: errorBody(),
		dismissable: options.dismissable ?? true,
		actions: options.actions || defaultActions,
		contentClass: 'max-w-4xl max-h-[80vh]'
	})
}

// Convenience function for simple error display
export const showError = (error: Error | string, title?: string): string => {
	return showErrorModal({
		title: title || 'Error',
		error,
		dismissable: true
	})
}
