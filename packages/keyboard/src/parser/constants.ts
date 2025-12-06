import type { DigitKey, Modifier, SpecialKey } from './types'

export const modifierAliases: Record<string, Modifier> = {
	ctrl: 'ctrl',
	control: 'ctrl',
	'⌃': 'ctrl',
	shift: 'shift',
	'⇧': 'shift',
	alt: 'alt',
	option: 'alt',
	'⌥': 'alt',
	cmd: 'meta',
	command: 'meta',
	meta: 'meta',
	'⌘': 'meta'
}

export const symbolToDigit: Record<string, DigitKey> = {
	')': '0',
	'!': '1',
	'@': '2',
	'#': '3',
	$: '4',
	'%': '5',
	'^': '6',
	'&': '7',
	'*': '8',
	'(': '9'
}

export const specialKeyMap: Record<string, SpecialKey> = {
	bracketleft: '[',
	'[': '[',
	'{': '[',
	bracketright: ']',
	']': ']',
	'}': ']',

	minus: '-',
	'-': '-',
	_: '-',

	equal: '=',
	'=': '=',
	plus: '+',
	'plus-sign': '+',
	'+': '+',

	semicolon: ';',
	';': ';',
	':': ';',

	comma: '<',
	',': '<',
	'<': '<',

	period: '>',
	'.': '>',
	'>': '>',

	quote: '"',
	"'": '"',
	'"': '"',

	backquote: 'backquote',
	'`': 'backquote',
	'~': 'backquote',

	backslash: '|',
	'\\': '|',
	'|': '|',

	slash: '?',
	'/': '?',
	'?': '?',

	space: 'space',
	' ': 'space',
	'␣': 'space',

	tab: 'tab',
	'⇥': 'tab',

	escape: 'esc',
	esc: 'esc',

	backspace: 'delete',
	delete: 'delete',
	del: 'delete',
	'⌫': 'delete',

	enter: 'enter',
	return: 'enter',
	'⏎': 'enter',
	'↵': 'enter',
	'↩': 'enter',

	arrowup: '↑',
	up: '↑',
	'↑': '↑',

	arrowdown: '↓',
	down: '↓',
	'↓': '↓',

	arrowleft: '←',
	left: '←',
	'←': '←',

	arrowright: '→',
	right: '→',
	'→': '→',

	home: 'home',
	end: 'end',
	pageup: 'pageUp',
	pagedown: 'pageDown',

	capslock: 'capsLock',
	caps: 'capsLock',
	cap: 'capsLock',
	'⇪': 'capsLock',

	contextmenu: 'contextMenu',
	apps: 'contextMenu',
	menu: 'contextMenu'
}
