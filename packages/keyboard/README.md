# @repo/keyboard

Utilities for parsing and formatting keyboard shortcuts shared across the monorepo.

## Keymap

`createKeymapController` pairs the existing parser primitives with a runtime keybinding registry and a focus-aware command resolver. Keybindings stay global while scopes (layers) decide which command handles a binding:

```ts
import { createKeymapController } from '@repo/keyboard'

const keymap = createKeymapController({
	contextResolver: () => ({ focus: focusManager.current })
})

const paletteBinding = keymap.registerKeybinding({ shortcut: 'meta+p' })
keymap.registerCommand({
	id: 'workbench.showCommandPalette',
	run: ctx => palette.open(ctx.app.focus)
})

keymap.bindCommand({
	scope: 'global',
	bindingId: paletteBinding.id,
	commandId: 'workbench.showCommandPalette'
})

// Alternatively bind directly by shortcut when you don't care about the id.
keymap.bindCommand({
	scope: 'editor',
	commandId: 'editor.toggleComment',
	shortcut: 'meta+/',
	when: ctx => ctx.binding.meta?.onlyWhenSelection
})

keymap.setActiveScopes(['editor', 'global'])
keymap.attach(window)
```

- Keybindings declare shortcuts once (strings or sequences) and may specify `priority`, `preventDefault`, etc. IDs are optional—auto-generated handles are returned when you register.
- Commands decide when they are applicable via optional `when`/`isEnabled` predicates that receive both the binding data and the latest app context, and scoped bindings can add their own predicates on top.
- Active scopes are fully app-controlled, so focus changes just reorder which command tables the controller consults.

## Tests

Run tests for this package with:

```bash
bun run test --filter=@repo/keyboard
```
