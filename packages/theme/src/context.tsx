import {
	createContext,
	createEffect,
	createMemo,
	useContext,
	type JSX,
} from 'solid-js'
import { createStore, unwrap, type SetStoreFunction } from 'solid-js/store'
import { trackStore } from '@solid-primitives/deep'
import { useColorMode } from '@kobalte/core'
import type { ThemeMode, ThemePalette } from './types'
import { DARK_THEME, LIGHT_THEME } from './palettes'
import { syncToCssVars } from './cssVars'

type ThemeContextValue = {
	theme: ThemePalette
	setTheme: SetStoreFunction<ThemePalette>
	trackedTheme: () => ThemePalette
	isDark: () => boolean
}

const ThemeContext = createContext<ThemeContextValue>()

export const ThemeProvider = (props: { children: JSX.Element }) => {
	const { colorMode } = useColorMode()
	const isDark = createMemo(() => colorMode() === 'dark')
	const [theme, setTheme] = createStore<ThemePalette>(
		structuredClone(isDark() ? DARK_THEME : LIGHT_THEME)
	)

	createEffect(() => {
		setTheme(structuredClone(isDark() ? DARK_THEME : LIGHT_THEME))
	})

	/*
	 * Deeply tracked accessor for theme changes.
	 * Use this ONLY when you need to track the entire store inside a createEffect.
	 * This is a rare use case - usually you just want to access specific properties.
	 */
	const trackedTheme = () => {
		trackStore(theme)
		return theme
	}
	createEffect(() => {
		syncToCssVars(unwrap(trackedTheme()))
	})

	const value: ThemeContextValue = {
		theme,
		setTheme,
		trackedTheme,
		isDark,
	}

	return (
		<ThemeContext.Provider value={value}>
			{props.children}
		</ThemeContext.Provider>
	)
}

export const useTheme = () => {
	const ctx = useContext(ThemeContext)
	if (!ctx) {
		throw new Error('useTheme must be used within a ThemeProvider')
	}

	return ctx
}
