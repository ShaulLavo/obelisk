import { Component } from 'solid-js'
import { Button } from '@repo/ui/button'
import { showErrorModal, showError } from '@repo/ui/errorModal'

export const ErrorModalDemo: Component = () => {
	const showSimpleError = () => {
		showError('This is a simple error message')
	}

	const showComplexError = () => {
		const error = new Error('Database connection failed')
		error.name = 'ConnectionError'
		error.stack = `ConnectionError: Database connection failed
    at DatabaseService.connect (/app/services/database.js:45:12)
    at UserController.getUsers (/app/controllers/user.js:23:8)
    at Router.handle (/app/routes/api.js:67:15)
    at Server.handleRequest (/app/server.js:89:22)
    at IncomingMessage.<anonymous> (/app/server.js:156:7)
    at IncomingMessage.emit (events.js:314:20)
    at HTTPParser.parserOnIncoming (_http_server.js:901:12)`
		
		showErrorModal({
			title: 'Database Connection Error',
			error,
			actions: [
				{
					id: 'retry',
					label: 'Retry Connection',
					variant: 'default',
					onPress: () => {
						console.log('Retrying connection...')
					}
				},
				{
					id: 'close',
					label: 'Close',
					variant: 'secondary',
					autoClose: true
				}
			]
		})
	}

	const showErrorWithCause = () => {
		const rootCause = new Error('Network timeout')
		const error = new Error('Failed to fetch user data')
		error.cause = rootCause
		error.stack = `Error: Failed to fetch user data
    at ApiService.fetchUsers (/app/services/api.js:78:15)
    at UserStore.loadUsers (/app/stores/user.js:34:20)
    at UserList.onMount (/app/components/UserList.jsx:12:8)`
		
		showError(error, 'API Error')
	}

	return (
		<div class="flex gap-4 p-4">
			<Button onClick={showSimpleError}>
				Show Simple Error
			</Button>
			<Button onClick={showComplexError}>
				Show Complex Error
			</Button>
			<Button onClick={showErrorWithCause}>
				Show Error with Cause
			</Button>
		</div>
	)
}
