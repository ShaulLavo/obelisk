# Editor & Layout

- [x] Resizable multi-pane layout with persisted sizes
- [ ] Pane drag/drop to rearrange/split; layout persistence after DnD
- [ ] Tabbed editors: dumb wrapper over existing K-recent cache (no extra buffering), dirty indicators, close + middle-click close, return to last active tab on close
- [ ] Tab drag/drop: reorder, move between panes, detach to new pane
- [ ] Cross-pane DnD to create splits by dropping tabs/files on edges/corners
- [ ] Minimap; code lens; peek/go-to definition/references; breadcrumbs
- [ ] Horizontal virtualization
- [ ] GPU rendering
- [ ] FAST scroll without gpu instant render

# File System & Explorer

- [x] Local/OPFS/memory FS roots via `FsProvider` with caching/lazy load
- [ ] Explorer DnD: move/copy files/folders (modifiers), hover-to-expand, conflict prompts, undo for moves
- [ ] External drop to upload/import; drag-out where the browser allows
- [ ] SCM view: git status, staging, commits, gutter blame, inline diffs

# Editing & Language Features

- [x] Piece-table-backed text editing with virtualized lines/cursor/selection
- [ ] Tree-sitter syntax highlighting (multi-language) + semantic tokens
- [x] Folding driven by syntax; outline/symbol view; breadcrumbs
- [ ] LSP client: hover, completion, signature help, rename, code actions, format, diagnostics, inlay hints
- [ ] Snippets and snippet contributions
- [ ] Formatter integration per language; on-save hooks

# Search & Navigation

- [ ] Command palette (global actions, jump-to-file/symbol, extensible commands)
- [ ] Workspace search: text (regex, include/exclude), replace-in-files
- [ ] Symbol search (workspace/file), fuzzy file search
- [ ] Custom search engine (mini-search-inspired): indexing strategy, incremental updates, memory caps
- [ ] Tree-sitter-aware indexing/tokenization; symbol extraction
- [ ] Stream-friendly indexing for large files; skip binaries via heuristics
- [ ] AI/vector hybrid search (optional embeddings for similarity)

# Terminal & Tasks

- [x] Basic xterm + local-echo scaffold (help/echo/clear)
- [ ] Real terminal sessions (PTY-backed), multi-session tabs, scrollback, resize/focus sync
- [ ] Terminal DnD: move tabs between panes; drop files to paste path/upload where supported
- [ ] Tasks/build integration; problem matchers

# Theming & Customization

- [x] Theming hooks (ThemedToaster, UI primitives)
- [ ] Theme packs (light/dark), full token color customization, icon themes
- [ ] Settings UI: searchable categories, user/workspace settings, JSON editor
- [ ] Keybinding editor with chords; import/export presets
- [ ] Workspace trust/multi-root support
- [ ] Custom scrollbar styling across app (replace native stopgap)

# Extensions & Ecosystem

- [ ] Extension system: manifest, activation events, contribution points (commands, keybindings, themes, snippets, languages)
- [ ] Sandboxed runtime for extensions; permissions; lifecycle management

# Viewing & Extras

- [x] Binary viewer (hex/ASCII preview with stats)
- [ ] Notebook/markdown preview (live/side-by-side)
- [ ] Diff/merge UI (2-way/3-way)

# Accessibility & UX

- [ ] Full keyboard equivalents for DnD actions; focus preservation
- [ ] Screen reader roles/labels; announcements for drops/actions
- [ ] High-contrast themes; zoom/font-size controls
- [ ] Persisted focus/selection after layout/tab moves

# Logging, Perf, Infrastructure

- [x] Perf scaffolding (`@repo/perf`)

# Testing

- [ ] Browser testing
- [ ] Add missing unit tests if any
