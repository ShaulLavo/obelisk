# Vibe

Vibe is the early scaffold for a full-stack, vibe-forward coding platform: Solid + Tailwind UI in `apps/web`, Bun + Elysia API in `apps/server`, and shared packages (`packages/fs`, `packages/code-editor`, `packages/ui`, `packages/eslint-config`, `packages/typescript-config`) wired together with Turborepo.

## Quick start

```bash
# install (uses bun workspaces)
bun install

# run everything in dev mode
bun run dev

# focus a single app
bun run dev --filter=web     # Solid frontend (Vite)
bun run dev --filter=server  # Bun/Elysia API
```

## Environment variables

- Each app keeps its own `.env` file (see `apps/web/.env.example` and `apps/server/.env.example`). Copy the examples to `.env` inside each package and tweak ports/origins as needed.
- Values defined in an app's `.env` override the repo-root `.env`, but the root file still works as a fallback while migrating.
- `turbo.json` now tracks the `.env*` files and the `VITE_*`/`WEB_ORIGIN` variables in task hashes, so changing ports or origins will bust the cache.
- The server also reads `WEB_ORIGIN` for non-Vite deployments; keep it in sync with `VITE_WEB_ORIGIN` unless you have a separate origin in production.

## Build & lint

```bash
bun run build   # turbo build all
bun run lint    # eslint across packages
```

## Notes

- Target Node/Bun 18+.
- Source of truth lives in `apps/web/src` and `packages/fs` for the virtual filesystem building blocks; server endpoints are in `apps/server/src`.
- This README stays short on purpose—treat this repo as a playground while the platform takes shape.
