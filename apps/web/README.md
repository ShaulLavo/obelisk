# Vibe Web (Solid + Vite)

SolidJS front-end for the Vibe workspace: resizable file/tree + terminal UI backed by the shared `@repo/fs` and `@repo/code-editor` packages. See the repo root `README.md` for monorepo-wide commands and context.

## Prerequisites

- Node/Bun 18+
- Bun package manager (`curl -fsSL https://bun.sh/install | bash`)
- Modern browser with File System Access API enabled for local file trees

## Local setup

1. Install deps at repo root (copies tree-sitter assets during postinstall):
   ```bash
   bun install
   ```
2. Create the app env file and tweak ports/origins as needed:
   ```bash
   cp apps/web/.env.example apps/web/.env
   ```
3. Start the web client in dev mode:
   ```bash
   bun run dev --filter web   # or: cd apps/web && bun run dev
   ```
4. Open the printed Vite URL (defaults to http://localhost:5173).

## Scripts

- `bun run dev --filter web` / `bun start` – Vite dev server
- `bun run build --filter web` – production build
- `bun run serve --filter web` – preview the production build
- `bun run lint --filter web` – eslint (uses `@repo/eslint-config`)
- `bun run test --filter web` – unit tests (Vitest, node project)
- `bun run test --filter web -- --project browser` – browser tests (Playwright)

## Testing

- Manual: run `bun run dev --filter web`, open the app, verify file browsing (local/OPFS/memory), editor loading, and terminal commands (`help`, `echo`, `clear`).
- Unit: `bun run test --filter web` (or `bun run test` from `apps/web/`).
- Browser: `bun run test --filter web -- --project browser` (only when you need browser coverage).

## Notes

- Tree-sitter wasm/assets are fetched via `bun run copy-tree-sitter-assets` during install; rerun it if you bump parsers.
- Env resolution follows the repo pattern: `apps/web/.env` overrides root `.env`; Vite picks up `VITE_*` variables.

## Preview

Example UI preview (placeholder): ![Vibe web preview](https://dummyimage.com/1200x720/0b1221/ffffff&text=Vibe+web+client+preview)
