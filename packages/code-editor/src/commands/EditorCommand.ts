/**
 * EditorCommand — typed commands separated from DOM event handling.
 *
 * InputController translates DOM events into these commands.
 * CommandRouter translates these commands into EditorTransactions.
 *
 * This separation keeps browser quirks out of command semantics.
 */

// ---------------------------------------------------------------------------
// Text input (from beforeinput/input, not keydown)
// ---------------------------------------------------------------------------

export type InsertTextCommand = {
	type: 'insert-text'
	text: string
}

export type InsertNewlineCommand = {
	type: 'insert-newline'
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

export type DeleteBackwardCommand = {
	type: 'delete-backward'
	byWord: boolean
}

export type DeleteForwardCommand = {
	type: 'delete-forward'
	byWord: boolean
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export type MoveCursorCommand = {
	type: 'move-cursor'
	direction: 'left' | 'right' | 'up' | 'down'
	byWord: boolean
	extend: boolean
}

export type MoveCursorHomeCommand = {
	type: 'move-cursor-home'
	extend: boolean
	toDocument: boolean
}

export type MoveCursorEndCommand = {
	type: 'move-cursor-end'
	extend: boolean
	toDocument: boolean
}

export type MoveCursorPageCommand = {
	type: 'move-cursor-page'
	direction: 'up' | 'down'
	extend: boolean
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export type SelectAllCommand = {
	type: 'select-all'
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type UndoCommand = {
	type: 'undo'
}

export type RedoCommand = {
	type: 'redo'
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

export type CopyCommand = {
	type: 'copy'
}

export type CutCommand = {
	type: 'cut'
}

export type PasteCommand = {
	type: 'paste'
	text: string
}

// ---------------------------------------------------------------------------
// Structural
// ---------------------------------------------------------------------------

export type IndentCommand = {
	type: 'indent'
}

export type DedentCommand = {
	type: 'dedent'
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

export type SaveCommand = {
	type: 'save'
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

export type EditorCommand =
	| InsertTextCommand
	| InsertNewlineCommand
	| DeleteBackwardCommand
	| DeleteForwardCommand
	| MoveCursorCommand
	| MoveCursorHomeCommand
	| MoveCursorEndCommand
	| MoveCursorPageCommand
	| SelectAllCommand
	| UndoCommand
	| RedoCommand
	| CopyCommand
	| CutCommand
	| PasteCommand
	| IndentCommand
	| DedentCommand
	| SaveCommand
