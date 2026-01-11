import type { Component } from 'solid-js'
import { Button } from '@repo/ui/button'
import { SettingInput } from '@repo/ui/settings'
import { useSettings } from '../SettingsProvider'
import { FontFamilySelect } from './FontFamilySelect'
import { FontCategory, type FontCategoryType } from '../../fonts'
import type { FontModule } from '../../hooks/createFontZoomStore'

export type FontSubcategoryWithResetProps = {
	module: FontModule
	sizeKey: string
	familyKey: string
	sizeLabel: string
	sizeDescription: string
	familyLabel: string
	familyDescription: string
	fontCategory?: FontCategoryType
}

export const FontSubcategoryWithReset: Component<
	FontSubcategoryWithResetProps
> = (props) => {
	const [settingsState, settingsActions] = useSettings()

	const handleSizeChange = (value: unknown) => {
		settingsActions.setSetting(props.sizeKey, value)
	}

	const handleFamilyChange = (value: unknown) => {
		settingsActions.setSetting(props.familyKey, value)
	}

	const handleReset = () => {
		// Reset both the setting and the zoom
		settingsActions.resetSetting(props.sizeKey)
		settingsActions.resetZoom(props.module)
	}

	const currentSize = () =>
		settingsState.values[props.sizeKey] ??
		settingsState.defaults[props.sizeKey] ??
		14
	const zoomedSize = () => settingsActions.getZoomedFontSize(props.module)
	const hasZoom = () => zoomedSize() !== currentSize()
	const currentFamily = () =>
		settingsState.values[props.familyKey] ??
		settingsState.defaults[props.familyKey] ??
		''

	return (
		<div class="space-y-4 divide-y divide-border/60">
			<div class="py-2.5">
				<div class="flex items-center justify-between">
					<div class="flex-1">
						<SettingInput
							value={Number(currentSize())}
							type="number"
							onChange={handleSizeChange}
							label={props.sizeLabel}
							description={props.sizeDescription}
						/>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={handleReset}
						class="ml-4"
						disabled={
							!hasZoom() &&
							currentSize() === settingsState.defaults[props.sizeKey]
						}
					>
						Reset
					</Button>
				</div>
				{hasZoom() && (
					<div class="text-ui-xs text-muted-foreground mt-2">
						Current effective size: {String(zoomedSize())}px (base:{' '}
						{String(currentSize())}px)
					</div>
				)}
			</div>
			<div class="py-2.5">
				<FontFamilySelect
					value={String(currentFamily())}
					onChange={handleFamilyChange}
					label={props.familyLabel}
					description={props.familyDescription}
					category={props.fontCategory}
				/>
			</div>
		</div>
	)
}
