import { VsFile } from '@repo/icons/vs/VsFile'
import { MtHtml } from '@repo/icons/mt/MtHtml'
import { MtJson } from '@repo/icons/mt/MtJson'
import { MtMarkdown } from '@repo/icons/mt/MtMarkdown'
import { MtJavascript } from '@repo/icons/mt/MtJavascript'
import { MtTypescript } from '@repo/icons/mt/MtTypescript'
import { MtCss } from '@repo/icons/mt/MtCss'
import { MtNodejs } from '@repo/icons/mt/MtNodejs'
import { MtPython } from '@repo/icons/mt/MtPython'
import { MtRust } from '@repo/icons/mt/MtRust'
import { MtGo } from '@repo/icons/mt/MtGo'
import { MtLua } from '@repo/icons/mt/MtLua'
import { MtZig } from '@repo/icons/mt/MtZig'
import { MtCpp } from '@repo/icons/mt/MtCpp'
import { MtReact } from '@repo/icons/mt/MtReact'
import type { Component } from 'solid-js'
import type { IconProps } from '@repo/icons'

export const getIconForFile = (name: string): Component<IconProps> => {
	const ext = name.split('.').pop()?.toLowerCase()

	switch (ext) {
		case 'html':
		case 'htm':
			return MtHtml
		case 'json':
			return MtJson
		case 'md':
		case 'markdown':
			return MtMarkdown
		case 'js':
		case 'mjs':
		case 'cjs':
			return MtJavascript
		case 'ts':
		case 'mts':
		case 'cts':
			return MtTypescript
		case 'tsx':
		case 'jsx':
			return MtReact
		case 'css':
			return MtCss
		case 'py':
			return MtPython
		case 'rs':
			return MtRust
		case 'go':
			return MtGo
		case 'lua':
			return MtLua
		case 'zig':
			return MtZig
		case 'cpp':
		case 'cxx':
		case 'cc':
		case 'c':
		case 'h':
			return MtCpp
		default:
			if (name === 'package.json') return MtNodejs
			return VsFile as Component<IconProps>
	}
}
