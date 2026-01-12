import { render } from '@solidjs/testing-library'
import { describe, it, expect } from 'vitest'
import { SyncStatusIndicator } from './SyncStatusIndicator'
import type { SyncStatusInfo } from '@repo/code-editor/sync'

describe('SyncStatusIndicator', () => {
	it('renders synced status correctly', () => {
		const status: SyncStatusInfo = {
			type: 'synced',
			lastSyncTime: Date.now(),
			hasLocalChanges: false,
			hasExternalChanges: false,
		}

		const { container } = render(() => <SyncStatusIndicator status={status} />)
		// Synced status intentionally renders nothing (file is in normal state)
		expect(container.querySelector('span')).toBeFalsy()
	})

	it('renders dirty status correctly', () => {
		const status: SyncStatusInfo = {
			type: 'dirty',
			lastSyncTime: Date.now(),
			hasLocalChanges: true,
			hasExternalChanges: false,
		}

		const { container } = render(() => <SyncStatusIndicator status={status} />)
		expect(container.querySelector('span')).toBeTruthy()
	})

	it('renders conflict status correctly', () => {
		const status: SyncStatusInfo = {
			type: 'conflict',
			lastSyncTime: Date.now(),
			hasLocalChanges: true,
			hasExternalChanges: true,
		}

		const { container } = render(() => <SyncStatusIndicator status={status} />)
		expect(container.querySelector('span')).toBeTruthy()
	})

	it('renders error status correctly', () => {
		const status: SyncStatusInfo = {
			type: 'error',
			lastSyncTime: Date.now(),
			hasLocalChanges: false,
			hasExternalChanges: false,
			errorMessage: 'Test error',
		}

		const { container } = render(() => <SyncStatusIndicator status={status} />)
		expect(container.querySelector('span')).toBeTruthy()
	})

	it('handles undefined status', () => {
		const { container } = render(() => <SyncStatusIndicator />)
		// Undefined status (not-watched) intentionally renders nothing
		expect(container.querySelector('span')).toBeFalsy()
	})

	it('applies custom size', () => {
		const status: SyncStatusInfo = {
			type: 'dirty',
			lastSyncTime: Date.now(),
			hasLocalChanges: true,
			hasExternalChanges: false,
		}

		const { container } = render(() => <SyncStatusIndicator status={status} size={20} />)
		const span = container.querySelector('span')
		expect(span?.style.width).toBe('20px')
		expect(span?.style.height).toBe('20px')
	})
})