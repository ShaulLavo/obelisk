import { describe, it, expect } from 'vitest'
import {
	getStatusDescription,
	getStatusClassName,
	getStatusBgColor,
	getStatusBadgeColor,
	getStatusIcon,
	getStatusShortText,
} from './sync-status-tracker'
import type { SyncStatusInfo, SyncStatusType } from './types'

const ALL_STATUS_TYPES: SyncStatusType[] = [
	'synced',
	'dirty',
	'external-changes',
	'conflict',
	'error',
	'not-watched',
]

describe('sync-status-tracker', () => {
	describe('getStatusDescription', () => {
		it('returns description for all status types', () => {
			for (const type of ALL_STATUS_TYPES) {
				const status: SyncStatusInfo = { type, lastSyncTime: 0, hasLocalChanges: false, hasExternalChanges: false }
				expect(getStatusDescription(status)).toBeTruthy()
			}
		})

		it('returns error message when status is error with message', () => {
			const status: SyncStatusInfo = {
				type: 'error',
				lastSyncTime: 0,
				hasLocalChanges: false,
				hasExternalChanges: false,
				errorMessage: 'Custom error',
			}
			expect(getStatusDescription(status)).toBe('Custom error')
		})
	})

	describe('getStatusClassName', () => {
		it('returns class name for all status types', () => {
			for (const type of ALL_STATUS_TYPES) {
				const status: SyncStatusInfo = { type, lastSyncTime: 0, hasLocalChanges: false, hasExternalChanges: false }
				expect(getStatusClassName(status)).toMatch(/^sync-status-/)
			}
		})
	})

	describe('getStatusBgColor', () => {
		it('returns bg color for all status types', () => {
			for (const type of ALL_STATUS_TYPES) {
				expect(getStatusBgColor(type)).toMatch(/^bg-/)
			}
		})
	})

	describe('getStatusBadgeColor', () => {
		it('returns badge color for all status types', () => {
			for (const type of ALL_STATUS_TYPES) {
				expect(getStatusBadgeColor(type)).toContain('bg-')
				expect(getStatusBadgeColor(type)).toContain('text-')
			}
		})
	})

	describe('getStatusIcon', () => {
		it('returns icon for all status types', () => {
			for (const type of ALL_STATUS_TYPES) {
				expect(getStatusIcon(type)).toBeTruthy()
			}
		})
	})

	describe('getStatusShortText', () => {
		it('returns short text for all status types', () => {
			for (const type of ALL_STATUS_TYPES) {
				expect(getStatusShortText(type)).toBeTruthy()
			}
		})
	})
})
