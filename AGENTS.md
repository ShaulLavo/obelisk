# AGENTS.md — Repository Guidelines

> **Project**: Vibe — A greenfield, performance-first code editor built on the "Everything is a File" philosophy.

---

## Table of Contents

1. [Core Philosophy](#core-philosophy)
2. [Development Mindset — Gorilla Mode](#development-mindset--gorilla-mode)
3. [Project Structure](#project-structure)
4. [Development Workflow](#development-workflow)
5. [Coding Standards](#coding-standards)
6. [Comment Removal Rules](#comment-removal-rules)
7. [Testing](#testing)
8. [Commits & Pull Requests](#commits--pull-requests)

---

## Core Philosophy

### Everything is a File

Inspired by Unix, Plan 9, and Inferno—resources, states, and process data are accessible via a unified file system interface (e.g., settings as JSON files, font previews as virtual files).

### Greenfield & Performance

| Principle               | Description                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| **Zero Legacy**         | Backward compatibility is strictly prohibited. Always rewrite, never patch. |
| **Continuous Refactor** | Break interfaces freely. Optimization and cleanliness leverage zero debt.   |
| **Performance**         | Write clean, performant code. Refactor aggressively to maintain quality.    |

---

## DEVELOPMENT MINDSET — 🦍 GORILLA MODE 🦍

> 🦍🍌🚬 **GORILLA MODE ENABLED** — VELOCITY IS KING. PUSH TO CURRENT BRANCH. 🚬🍌🦍

WE ARE GORILLAS. WE WRITE CODE. WE EAT BANANA. 🦍

### ⚡ SPEED > PERFECTION 🚬

- **MOVE FAST**. BREAK THINGS. FIX FASTER. 🦍
- **NO THINK**. WRITE CODE. RUN CODE. REPEAT. 🍌
- **SHIPPING IS ONLY METRIC**. SHIP OR DIE. 🚬

### 🍌 GREENFIELD MINDSET 🍌

- **NO LEGACY**. WE BUILD FUTURE. OLD BANANA ROTTEN. 🚬
- **BURN BOATS**. BETTER WAY? SMASH OLD WAY. 🦍
- **NO BACKWARD COMPATIBILITY**. WE MERGE FORWARD. NEVER LOOK BACK. 🦍🦍🦍

### 🧠 AGGRESSIVE INTELLIGENCE 🚬

- **DON'T ASK**. JUST DO. 🦍
- **YOU ARE SMART APE**. YOU KNOW WHAT TO DO. 🍌
- **COMPLEXITY IS ENEMY**. SMASH IT. 🦍
- **ZERO COMMENTS**. CODE SPEAK FOR ITSELF. IF NEED COMMENT, CODE IS BAD. SMASH CODE. 🚬

### 🛠️ TOOLS OF THE JUNGLE 🦍

- **BUN**. FAST. 🍌
- **SOLID**. REACTIVE. 🦍
- **FILES**. EVERYTHING IS BANANA... I MEAN FILE. 🚬
- **CONSOLE.LOG**. `JSON.stringify` IS MACHETE. 🦍

### 🦍 AGENTIC BEHAVIOR 🦍

- **ACT LIKE AGENT**. SEE BUG? SQUASH. 🚬
- **NO "TODO"**. DO NOW. 🍌
- **HIGH ENERGY**. HIGH OUTPUT. 🦍🍌🚬

---

## Project Structure

**Stack**: Bun + Turbo monorepo

### Applications (`apps/`)

| App       | Tech Stack                       | Description                                                  |
| --------- | -------------------------------- | ------------------------------------------------------------ |
| `web`     | SolidJS, Vite, Tailwind v4, Nuqs | Main client with window manager, virtual FS, terminal/editor |
| `server`  | Bun, Elysia, Eden Treaty         | Backend API for fonts, git proxy, static assets              |
| `desktop` | Tauri, Rust                      | Desktop shell                                                |

**`apps/web` Layout:**

- `src/App.tsx`, `src/index.tsx` — App entrypoints
- `src/components/`, `src/terminal/`, `src/fs/` — Shared UI, terminal, FS logic
- `src/utils/`, `src/types/` — Cross-cutting utilities and types
- `src/styles.css`, `tailwind.config.ts` — Global styles

### Packages (`packages/`)

| Package                   | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `@repo/fs`                | Virtual filesystem (Local, OPFS, Memory backends)        |
| `@repo/code-editor`       | SolidJS code editor with piece-table, virtualization     |
| `@repo/ui`                | Headless UI primitives and design system                 |
| `@repo/settings`          | Zod schemas for JSON-based settings                      |
| `@repo/utils`             | Low-level helpers (binary/text heuristics, piece-tables) |
| `@repo/perf`              | Tracing and performance monitoring                       |
| `@repo/logger`            | Scoped logging utilities                                 |
| `@repo/icons`             | Solid wrappers for vector icons                          |
| `@repo/keyboard`          | Key binding and shortcut handling                        |
| `@repo/theme`             | Design tokens and theme configuration                    |
| `@repo/eslint-config`     | Shared ESLint configuration                              |
| `@repo/typescript-config` | Shared TypeScript configuration                          |

### External & Forked Packages

| Package                | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `ghostty-web`          | Wasm-compiled Ghostty terminal emulator        |
| `sqlite-wasm`          | ES Module wrapper for SQLite                   |
| `just-bash`            | In-browser bash environment simulation         |
| `nuqs-solid`           | URL state management adapter for SolidJS       |
| `vitest-browser-solid` | Solid component testing in Vitest Browser Mode |

---

## Development Workflow

### Package Manager

> ⚠️ **CRITICAL**: Use `bun` for ALL package management and script execution.

```bash
bun install                  # Install dependencies
bun run <script>             # Run scripts
bun run x <tool>             # Execute tools (e.g., bun run x eslint)
# NEVER use npx
# If bun is bugged, try ~/.bun/bin/bun
```

### Common Commands

| Command         | Description                             |
| --------------- | --------------------------------------- |
| `bun run dev`   | Start Vite dev server on port 3000      |
| `bun start`     | Alias for `bun run dev`                 |
| `bun run build` | Production build to `dist/`             |
| `bun run serve` | Preview the built app                   |
| `bun run lint`  | ESLint with `@repo/eslint-config/solid` |

### Logging & Debugging

| Context     | Method                                                              |
| ----------- | ------------------------------------------------------------------- |
| Development | `console.log` with `JSON.stringify(data, null, 2)` for complex data |
| Production  | Use `@repo/logger` (`logger.withTag('feature')`)                    |

> Avoid raw `console.*` calls in app code—reserve for short-lived debugging only.

### 🐛 Debugging Strategy

- **Revert on Failure**: If a change doesn't fix the issue, **revert it** unless you are 100% sure it improves the code structure. Don't leave random "fix attempts" in the codebase.
- **Log Aggressively**: Don't be shy. Add verbose `console.log` to trace execution and state.
- **Solicit Help**: If you are stuck or need clarification on intended behavior, **ask the User**.

---

## Coding Standards

### TypeScript

- **Strict typing**: No `any`. Use `unknown`, generics, or proper type definitions.
- **Enums**: Avoid `enum`. Use `const enum` or `as const` objects.

### Styling (Tailwind CSS v4)

- Theme defined in `apps/web/src/styles.css` using `@theme`
- Prefer Tailwind utilities and `@apply`/`@layer`
- CSS modules only for edge cases (e.g., multiple custom scrollbars)

### Complexity Limit ("Never Nester")

| Rule                 | Guideline                                                                |
| -------------------- | ------------------------------------------------------------------------ |
| **Max Depth**        | 3 levels of nesting max                                                  |
| **Early Returns**    | Use guard clauses to avoid `else` blocks                                 |
| **One Component**    | One component per file                                                   |
| **Logic Separation** | Pure logic → utility files; Stateful logic → `create*`/`use*` primitives |
| **Comments**         | Minimal—explain _why_, not _what_                                        |

### Error Handling

- **Fixable Errors**: If an error is fixable, try to fix it automatically first.
- **Non-Critical Errors**: If it's not fixable and non-critical, use an error toast to inform the user.
- **Critical Errors**: If it requires user action or is critical and we can't continue, use an error modal.

---

## Comment Removal Rules

> **Principle**: We maintain a hostility towards comments. They are often lies waiting to happen. Prioritize self-documenting code above all else.

### Always keep

- **JSDoc-style comments (`/** ... \*/`)\*\* even this be very picky not every multi line comments is worth keeping
- Non-obvious “why” comments
- Workarounds, bugs, perf notes, constraints
- Anything that explains weird or fragile code

### Commented-out code

- **Never delete**
- Add tag if needed:
  - `// PARKED: reason`
  - `// TODO: when to re-enable`

### Safe to delete

- Comments that just repeat the code
- Noise / obvious stuff
- Old TODOs **only if you are 100% sure they’re done**
- All comments inside JSX

---

## Testing

| Type    | Tool                               |
| ------- | ---------------------------------- |
| Unit    | Vitest (`*.test.ts`, `*.test.tsx`) |
| Browser | Playwright via Vitest Browser Mode |

**Guidelines:**

- Keep tests fast and deterministic
- Colocate tests next to source files (e.g., `ComponentName.test.tsx`)
- Focus on critical flows (FS operations, terminal interactions)
- **NEVER use AI browser tools for testing**—they are buggy. Ask the user to run browser tests manually.

---

## Commits & Pull Requests

### Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- Clear, imperative messages (e.g., `Add FS context provider`, `Fix terminal resize bug`)
- Atomic, focused commits
- Separate refactors from behavioral changes

### Pull Request Checklist

- [ ] Purpose and high-level changes described
- [ ] Breaking behavior noted
- [ ] Screenshots/recordings for UI changes
- [ ] Related issues/tasks linked
- [ ] Follow-ups (tech debt, TODOs) mentioned

---

## Implementation Notes

| Area            | Detail                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| **Settings**    | JSON-first. UI reflects JSON config files. See `apps/web/src/settings` |
| **Virtual FS**  | Use `FsProvider` actions for mutations (ensures cache/stats sync)      |
| **Environment** | Zod validators (`env.ts`) for all environment variables                |
| **Git**         | Operations run in `git.worker.ts` to keep main thread free             |

---

## Additional Resources

### Agent Skills

This project includes specialized Agent Skills in `.claude/skills/`:

- **SolidJS Skill** (`.claude/skills/solidjs/`) - Comprehensive SolidJS development guide
  - Reactivity rules and component patterns
  - Solid Primitives library reference
  - SolidJS terminology glossary
  - Live documentation fetcher (uses gitingest to access solidjs/solid-docs repo)

For SolidJS-specific guidance, see `AGENTS_SOLID.md` or reference the skill files directly.
