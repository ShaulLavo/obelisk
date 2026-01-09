export type SettingType = 'boolean' | 'string' | 'number'

export type SettingDefinition = {
	key: string                    // Dot-notation key, e.g., "editor.fontSize"
	type: SettingType
	default: unknown
	description: string
	category: string               // Category ID, e.g., "editor"
	subcategory?: string           // Subcategory ID, e.g., "font"
	options?: { value: string; label: string }[]  // For enum-like strings
	experimental?: boolean
}

export type SettingsCategory = {
	id: string
	label: string
	icon?: string
	subcategories?: SettingsCategory[]
}

export type SettingsSchema = {
	categories: SettingsCategory[]
	settings: SettingDefinition[]
}