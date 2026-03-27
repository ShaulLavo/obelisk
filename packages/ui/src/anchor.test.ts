import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import {
	createAnchorName,
	resetAnchorCounter,
	getPositionArea,
	getFlipStrategy,
	getGapMargin,
	getArrowPlacement,
	getArrowAlignment,
	createAnchor,
	isPointInPolygon,
	isPointInRect,
	createSafePolygon,
	createSafePolygonHandler,
	type Placement,
} from './anchor'

describe('anchor.ts', () => {
	describe('createAnchorName', () => {
		beforeEach(() => {
			resetAnchorCounter()
		})

		it('generates unique names with default prefix', () => {
			const name1 = createAnchorName()
			const name2 = createAnchorName()
			const name3 = createAnchorName()

			expect(name1).toBe('--anchor-1')
			expect(name2).toBe('--anchor-2')
			expect(name3).toBe('--anchor-3')
		})

		it('uses custom prefix', () => {
			const name = createAnchorName('tooltip')
			expect(name).toBe('--tooltip-1')
		})

		it('generates valid CSS dashed-ident format', () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z]+$/.test(s)),
					(prefix) => {
						resetAnchorCounter()
						const name = createAnchorName(prefix)
						// Must start with -- and contain the prefix
						expect(name.startsWith('--')).toBe(true)
						expect(name.includes(prefix)).toBe(true)
						// Must be a valid CSS custom property name
						expect(/^--[a-z]+-\d+$/.test(name)).toBe(true)
					}
				),
				{ numRuns: 50 }
			)
		})
	})

	describe('getPositionArea', () => {
		it('maps all placements correctly', () => {
			const mappings: [Placement, string][] = [
				['top', 'top'],
				['top-start', 'top start'],
				['top-end', 'top end'],
				['bottom', 'bottom'],
				['bottom-start', 'bottom start'],
				['bottom-end', 'bottom end'],
				['left', 'left'],
				['left-start', 'left start'],
				['left-end', 'left end'],
				['right', 'right'],
				['right-start', 'right start'],
				['right-end', 'right end'],
			]

			for (const [placement, expected] of mappings) {
				expect(getPositionArea(placement)).toBe(expected)
			}
		})
	})

	describe('getFlipStrategy', () => {
		it('returns flip-block for vertical placements', () => {
			const verticalPlacements: Placement[] = [
				'top',
				'top-start',
				'top-end',
				'bottom',
				'bottom-start',
				'bottom-end',
			]

			for (const placement of verticalPlacements) {
				expect(getFlipStrategy(placement)).toBe('flip-block')
			}
		})

		it('returns flip-inline for horizontal placements', () => {
			const horizontalPlacements: Placement[] = [
				'left',
				'left-start',
				'left-end',
				'right',
				'right-start',
				'right-end',
			]

			for (const placement of horizontalPlacements) {
				expect(getFlipStrategy(placement)).toBe('flip-inline')
			}
		})
	})

	describe('getGapMargin', () => {
		it('returns correct margin property for each placement', () => {
			// top placements need margin-bottom (gap below the tooltip)
			expect(getGapMargin('top')).toBe('margin-bottom')
			expect(getGapMargin('top-start')).toBe('margin-bottom')
			expect(getGapMargin('top-end')).toBe('margin-bottom')

			// bottom placements need margin-top
			expect(getGapMargin('bottom')).toBe('margin-top')
			expect(getGapMargin('bottom-start')).toBe('margin-top')
			expect(getGapMargin('bottom-end')).toBe('margin-top')

			// left placements need margin-right
			expect(getGapMargin('left')).toBe('margin-right')
			expect(getGapMargin('left-start')).toBe('margin-right')
			expect(getGapMargin('left-end')).toBe('margin-right')

			// right placements need margin-left
			expect(getGapMargin('right')).toBe('margin-left')
			expect(getGapMargin('right-start')).toBe('margin-left')
			expect(getGapMargin('right-end')).toBe('margin-left')
		})
	})

	describe('getArrowPlacement', () => {
		it('returns opposite side for arrow', () => {
			// tooltip on top -> arrow on bottom of tooltip
			expect(getArrowPlacement('top')).toBe('bottom')
			expect(getArrowPlacement('top-start')).toBe('bottom')
			expect(getArrowPlacement('top-end')).toBe('bottom')

			// tooltip on bottom -> arrow on top
			expect(getArrowPlacement('bottom')).toBe('top')
			expect(getArrowPlacement('bottom-start')).toBe('top')
			expect(getArrowPlacement('bottom-end')).toBe('top')

			// tooltip on left -> arrow on right
			expect(getArrowPlacement('left')).toBe('right')
			expect(getArrowPlacement('left-start')).toBe('right')
			expect(getArrowPlacement('left-end')).toBe('right')

			// tooltip on right -> arrow on left
			expect(getArrowPlacement('right')).toBe('left')
			expect(getArrowPlacement('right-start')).toBe('left')
			expect(getArrowPlacement('right-end')).toBe('left')
		})
	})

	describe('getArrowAlignment', () => {
		it('returns correct alignment', () => {
			expect(getArrowAlignment('top')).toBe('center')
			expect(getArrowAlignment('top-start')).toBe('start')
			expect(getArrowAlignment('top-end')).toBe('end')

			expect(getArrowAlignment('bottom')).toBe('center')
			expect(getArrowAlignment('bottom-start')).toBe('start')
			expect(getArrowAlignment('bottom-end')).toBe('end')

			expect(getArrowAlignment('left')).toBe('center')
			expect(getArrowAlignment('left-start')).toBe('start')
			expect(getArrowAlignment('left-end')).toBe('end')

			expect(getArrowAlignment('right')).toBe('center')
			expect(getArrowAlignment('right-start')).toBe('start')
			expect(getArrowAlignment('right-end')).toBe('end')
		})
	})

	describe('createAnchor', () => {
		beforeEach(() => {
			resetAnchorCounter()
		})

		it('generates anchor styles', () => {
			const anchor = createAnchor()

			expect(anchor.name).toBe('--anchor-1')
			expect(anchor.anchorStyle).toEqual({ 'anchor-name': '--anchor-1' })
		})

		it('generates positioned styles', () => {
			const anchor = createAnchor()
			const styles = anchor.positionedStyle('top', 8)

			expect(styles.position).toBe('fixed')
			expect(styles['position-anchor']).toBe('--anchor-1')
			expect(styles['position-area']).toBe('top')
			expect(styles['position-try-fallbacks']).toBe('flip-block')
			expect(styles['margin-bottom']).toBe('8px')
		})

		it('uses custom name when provided', () => {
			const anchor = createAnchor({ name: '--my-custom-anchor' })

			expect(anchor.name).toBe('--my-custom-anchor')
			expect(anchor.anchorStyle['anchor-name']).toBe('--my-custom-anchor')
		})

		it('uses custom prefix', () => {
			const anchor = createAnchor({ prefix: 'tooltip' })

			expect(anchor.name).toBe('--tooltip-1')
		})
	})

	describe('isPointInPolygon', () => {
		it('detects point inside triangle', () => {
			const triangle = {
				points: [
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
					{ x: 5, y: 10 },
				],
			}

			// Center of triangle should be inside
			expect(isPointInPolygon({ x: 5, y: 3 }, triangle)).toBe(true)

			// Point outside should be false
			expect(isPointInPolygon({ x: 0, y: 10 }, triangle)).toBe(false)
			expect(isPointInPolygon({ x: 10, y: 10 }, triangle)).toBe(false)
			expect(isPointInPolygon({ x: -1, y: 0 }, triangle)).toBe(false)
		})

		it('detects point inside rectangle polygon', () => {
			const rect = {
				points: [
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
					{ x: 10, y: 10 },
					{ x: 0, y: 10 },
				],
			}

			// Inside
			expect(isPointInPolygon({ x: 5, y: 5 }, rect)).toBe(true)
			expect(isPointInPolygon({ x: 1, y: 1 }, rect)).toBe(true)
			expect(isPointInPolygon({ x: 9, y: 9 }, rect)).toBe(true)

			// Outside
			expect(isPointInPolygon({ x: -1, y: 5 }, rect)).toBe(false)
			expect(isPointInPolygon({ x: 11, y: 5 }, rect)).toBe(false)
			expect(isPointInPolygon({ x: 5, y: -1 }, rect)).toBe(false)
			expect(isPointInPolygon({ x: 5, y: 11 }, rect)).toBe(false)
		})

		it('property: point clearly inside is detected', () => {
			fc.assert(
				fc.property(
					// Generate a simple axis-aligned rectangle
					fc.integer({ min: 0, max: 100 }),
					fc.integer({ min: 0, max: 100 }),
					fc.integer({ min: 10, max: 50 }),
					fc.integer({ min: 10, max: 50 }),
					(x, y, width, height) => {
						const rect = {
							points: [
								{ x, y },
								{ x: x + width, y },
								{ x: x + width, y: y + height },
								{ x, y: y + height },
							],
						}

						// Center of rectangle should always be inside
						const center = { x: x + width / 2, y: y + height / 2 }
						expect(isPointInPolygon(center, rect)).toBe(true)
					}
				),
				{ numRuns: 100 }
			)
		})
	})

	describe('isPointInRect', () => {
		it('detects point inside DOMRect', () => {
			const rect = {
				left: 10,
				right: 100,
				top: 20,
				bottom: 80,
			} as DOMRect

			// Inside
			expect(isPointInRect({ x: 50, y: 50 }, rect)).toBe(true)
			expect(isPointInRect({ x: 10, y: 20 }, rect)).toBe(true) // Edge
			expect(isPointInRect({ x: 100, y: 80 }, rect)).toBe(true) // Edge

			// Outside
			expect(isPointInRect({ x: 9, y: 50 }, rect)).toBe(false)
			expect(isPointInRect({ x: 101, y: 50 }, rect)).toBe(false)
			expect(isPointInRect({ x: 50, y: 19 }, rect)).toBe(false)
			expect(isPointInRect({ x: 50, y: 81 }, rect)).toBe(false)
		})
	})

	describe('createSafePolygon', () => {
		it('creates polygon for right placement', () => {
			const triggerRect = {
				left: 100,
				right: 150,
				top: 100,
				bottom: 130,
			} as DOMRect

			const contentRect = {
				left: 160,
				right: 260,
				top: 90,
				bottom: 200,
			} as DOMRect

			const cursor = { x: 125, y: 115 }

			const polygon = createSafePolygon(triggerRect, contentRect, cursor, 'right')

			// Should have 3 points (triangle from cursor to content edges)
			expect(polygon.points).toHaveLength(3)

			// First point should be cursor
			expect(polygon.points[0]).toEqual(cursor)

			// Other points should be at content's left edge
			expect(polygon.points[1]?.x).toBe(contentRect.left)
			expect(polygon.points[2]?.x).toBe(contentRect.left)
		})

		it('creates polygon for left placement', () => {
			const triggerRect = {
				left: 200,
				right: 250,
				top: 100,
				bottom: 130,
			} as DOMRect

			const contentRect = {
				left: 50,
				right: 150,
				top: 90,
				bottom: 200,
			} as DOMRect

			const cursor = { x: 225, y: 115 }

			const polygon = createSafePolygon(triggerRect, contentRect, cursor, 'left')

			// Should have 3 points
			expect(polygon.points).toHaveLength(3)

			// First point should be cursor
			expect(polygon.points[0]).toEqual(cursor)

			// Other points should be at content's right edge
			expect(polygon.points[1]?.x).toBe(contentRect.right)
			expect(polygon.points[2]?.x).toBe(contentRect.right)
		})
	})

	describe('createSafePolygonHandler', () => {
		it('tracks safe zone correctly', () => {
			const handler = createSafePolygonHandler('right')

			const triggerRect = {
				left: 100,
				right: 150,
				top: 100,
				bottom: 130,
			} as DOMRect

			const contentRect = {
				left: 160,
				right: 260,
				top: 80,
				bottom: 150,
			} as DOMRect

			const cursor = { x: 125, y: 115 }

			// Before update, nothing is in safe zone
			expect(handler.isInSafeZone({ x: 125, y: 115 })).toBe(false)

			// Update with rects
			handler.update(triggerRect, contentRect, cursor)

			// Point inside content rect should be safe
			expect(handler.isInSafeZone({ x: 200, y: 100 })).toBe(true)

			// Point inside polygon (between cursor and content) should be safe
			// This is a point on the path from cursor toward content
			expect(handler.isInSafeZone({ x: 145, y: 115 })).toBe(true)

			// Point far away should not be safe
			expect(handler.isInSafeZone({ x: 0, y: 0 })).toBe(false)
			expect(handler.isInSafeZone({ x: 500, y: 500 })).toBe(false)
		})

		it('getPolygon returns current polygon', () => {
			const handler = createSafePolygonHandler('right')

			// Initially null
			expect(handler.getPolygon()).toBe(null)

			const triggerRect = { left: 0, right: 50, top: 0, bottom: 30 } as DOMRect
			const contentRect = { left: 60, right: 160, top: 0, bottom: 100 } as DOMRect

			handler.update(triggerRect, contentRect, { x: 25, y: 15 })

			const polygon = handler.getPolygon()
			expect(polygon).not.toBe(null)
			expect(polygon?.points).toHaveLength(3)
		})
	})
})
