/**
 * Placeholder entry so the `unimported` tool can traverse every exported module.
 * Import each component/util file so the analyzer sees their dependencies.
 *
 * Convention: kebab-case for shadcn/kobalte primitives (e.g., alert-dialog.tsx),
 * PascalCase for custom components (e.g., AnimatedModeToggle.tsx).
 */
import './accordion'
import './alert-dialog'
import './alert'
import './button'
import './dialog'
import './modal'
import './resizable'
import './stick-to-bottom'
import './toaster'
import './utils'
import './lib/utils'

export {}
