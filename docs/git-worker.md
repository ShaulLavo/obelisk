# Git Worker (isomorphic-git) Plan + Usage

## Goal

Provide a Web Worker-backed git clone flow that:

- Uses isomorphic-git internals for pack parsing in the worker.
- Clones the full working tree into the current VFS directory.
- Integrates with the terminal via a `git clone` custom command.
- Supports optional CORS proxying through the Elysia server.

## Architecture

- `apps/web/src/workers/git.worker.ts`
  - Uses isomorphic-git `clone` with a memory-backed filesystem.
  - Reads the checked-out working tree and streams blobs back via Comlink callbacks.
- `apps/web/src/workers/gitClient.ts`
  - Wraps the worker with Comlink and proxies callbacks.
- `apps/web/src/git/gitService.ts`
  - Writes files into the VFS, ensures directories exist, and refreshes the tree.
- `apps/web/src/terminal/justBashAdapter.ts`
  - Adds `git clone` command with progress output.
- `apps/server/src/index.ts`
  - Optional `/git/proxy` route for CORS-constrained git hosts.

## Data Flow (Clone)

1. Terminal command parses `git clone` args.
2. `gitService.cloneIntoVfs` checks target directory, then calls the worker.
3. Worker:
   - `isomorphic-git` clones into a memory filesystem.
   - The working tree is enumerated and streamed back via `onFile`.
4. Main thread writes files into VFS as they arrive.
5. `FsActions.refresh()` rebuilds the tree and syncs UI state.

## Command UX

```
git clone <repo-url> [dir] [--ref <ref>] [--proxy <url>] [--token <token>]
```

- `dir` defaults to the repo name (without `.git`).
- `--ref` defaults to `HEAD`.
- `--token` overrides `GIT_TOKEN` if set in the shell environment.
- `--proxy` should point to `/git/proxy` when cloning from hosts without CORS.

## CORS Proxy

Many git hosts (GitHub/GitLab) do not send `Access-Control-Allow-Origin` for git-upload-pack.
Use the Elysia proxy in that case:

- Server route: `POST /git/proxy?url=<encoded-git-upload-pack-url>`
- Required env var:
  - `GIT_PROXY_ALLOWED_HOSTS` (comma-separated list, e.g. `github.com,gitlab.com`)

Example:

```
GIT_PROXY_ALLOWED_HOSTS=github.com,gitlab.com
```

Client usage:

```
git clone https://github.com/org/repo.git --proxy http://localhost:3001/git/proxy
```

Note: the worker will auto-append `?` for the proxy to match isomorphic-git’s `corsProxy` format.

## Implementation Plan (Detailed)

1. Worker scaffolding
   - Create `git.worker.ts` with Comlink `clone` + `init`.
   - Set `globalThis.Buffer = Buffer` for isomorphic-git internals.
2. Wire protocol + pack parsing
   - Implement `ls-refs`, `git-upload-pack` requests, and pack parsing.
   - Parse commit + tree objects via `GitCommit` + `GitTree`.
3. Tree walk + blob streaming
   - Traverse tree entries to collect blob oids.
   - Read blobs from the pack index and stream each file via `onFile`.
4. VFS integration
   - Create `gitService.cloneIntoVfs` to:
     - Validate/prepare target directory.
     - Write files as they stream in.
     - Refresh FS tree on completion.
5. Terminal command
   - Add `git clone` to `justBashAdapter`.
   - Surface progress updates in the terminal.
6. Optional proxy
   - Add `/git/proxy` in the Elysia server.
   - Validate host against `GIT_PROXY_ALLOWED_HOSTS`.
7. Docs + next steps
   - Document usage and limitations.
   - Track TODOs for `.git` metadata and additional commands.

## Current Limitations

- Only clones the working tree (no `.git` metadata yet).
- No `git pull`, `git status`, `git log`, or `git push`.
- Large repos may be slow or memory-heavy in the browser.

## Next Steps

- Persist `.git` objects/refs to enable additional commands.
- Add incremental fetch / progress metrics.
- Support sparse checkout flags for large repos.
