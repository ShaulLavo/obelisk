import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { ByteContentHandle, ByteContentHandleFactory } from './content-handle'

describe('ContentHandle', () => {
	describe('Property 7: Content Handle Round-Trip', () => {
		it('should round-trip bytes correctly', () => {
			fc.assert(
				fc.property(fc.uint8Array(), (bytes) => {
					const handle = ByteContentHandleFactory.fromBytes(bytes)
					const roundTripped = handle.toBytes()
					
					expect(roundTripped).toEqual(bytes)
				}),
				{ numRuns: 100 }
			)
		})

		it('should round-trip strings correctly', () => {
			fc.assert(
				fc.property(fc.string(), (str) => {
					const handle = ByteContentHandleFactory.fromString(str)
					const roundTripped = handle.toString()
					
					expect(roundTripped).toBe(str)
				}),
				{ numRuns: 100 }
			)
		})

		it('should maintain consistency between bytes and string conversions', () => {
			fc.assert(
				fc.property(fc.string(), (str) => {
					const handleFromString = ByteContentHandleFactory.fromString(str)
					
					const bytes = handleFromString.toBytes()
					const handleFromBytes = ByteContentHandleFactory.fromBytes(bytes)
					
					expect(handleFromString.equals(handleFromBytes)).toBe(true)
					expect(handleFromBytes.toString()).toBe(str)
				}),
				{ numRuns: 100 }
			)
		})

		it('should handle empty content correctly', () => {
			const emptyFromFactory = ByteContentHandleFactory.empty()
			const emptyFromBytes = ByteContentHandleFactory.fromBytes(new Uint8Array(0))
			const emptyFromString = ByteContentHandleFactory.fromString('')
			
			expect(emptyFromFactory.equals(emptyFromBytes)).toBe(true)
			expect(emptyFromFactory.equals(emptyFromString)).toBe(true)
			
			expect(emptyFromFactory.toBytes()).toEqual(new Uint8Array(0))
			expect(emptyFromFactory.toString()).toBe('')
		})
	})
})