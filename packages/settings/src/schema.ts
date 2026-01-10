import { z } from 'zod'

/**
 * Schema for validating individual setting definitions.
 */
export const settingSchema = z.object({
	id: z.string(),
	default: z.unknown(),
	description: z.string().optional(),
	options: z
		.union([
			z.array(z.string()),
			z.array(z.object({ value: z.string(), label: z.string() })),
		])
		.optional(),
	experimental: z.boolean().optional(),
	icon: z.string().optional(),
})

export type Setting = z.infer<typeof settingSchema>

/**
 * Schema for validating category definitions (recursive).
 */
export const categorySchema: z.ZodType<Category> = z.lazy(() =>
	z.object({
		id: z.string(),
		label: z.string(),
		icon: z.string().optional(),
		settings: z.array(settingSchema).optional(),
		children: z.array(categorySchema).optional(),
	})
)

export type Category = {
	id: string
	label: string
	icon?: string
	settings?: Setting[]
	children?: Category[]
}

/**
 * Validates a schema JSON file. Throws if invalid.
 */
export function validateSchema(json: unknown): Category {
	return categorySchema.parse(json)
}

/**
 * Validates multiple schema files.
 */
export function validateSchemas(schemas: unknown[]): Category[] {
	return schemas.map((schema) => validateSchema(schema))
}

/**
 * Extracts all default values from a category tree.
 * Returns flat key-value map: { "terminal.font.size": 14, ... }
 */
export function extractDefaults(
	category: Category,
	prefix = ''
): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	const path = prefix ? `${prefix}.${category.id}` : category.id

	if (category.settings) {
		for (const setting of category.settings) {
			const key = `${path}.${setting.id}`
			if (setting.default !== undefined) {
				result[key] = setting.default
			}
		}
	}

	if (category.children) {
		for (const child of category.children) {
			Object.assign(result, extractDefaults(child, path))
		}
	}

	return result
}

/**
 * Extracts defaults from multiple categories.
 */
export function extractDefaultsFromSchemas(
	schemas: Category[]
): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const schema of schemas) {
		Object.assign(result, extractDefaults(schema))
	}
	return result
}

/**
 * Finds a setting by its dot-notation key in the category tree.
 */
export function findSetting(
	categories: Category[],
	key: string
): Setting | undefined {
	const parts = key.split('.')

	function search(nodes: Category[], depth: number): Setting | undefined {
		const targetId = parts[depth]
		const node = nodes.find((n) => n.id === targetId)
		if (!node) return undefined

		// If we're at the last part, look in settings
		if (depth === parts.length - 2) {
			const settingId = parts[parts.length - 1]
			return node.settings?.find((s) => s.id === settingId)
		}

		// Otherwise, recurse into children
		if (node.children) {
			return search(node.children, depth + 1)
		}

		return undefined
	}

	return search(categories, 0)
}
