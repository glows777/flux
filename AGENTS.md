# AGENTS.md

## Working Style

### Design and Architecture Work

For architecture discussions, refactors, and new feature design, do not jump straight to a solution.

Required flow:

1. Read the relevant source files first.
2. Restate:
   - how the current system works
   - what the user wants to change
   - what constraints or assumptions apply
3. Wait for confirmation or correction before proposing a design.

This project values correct understanding before design iteration.

### Execution Work

For implementation tasks such as code edits, tests, commits, pushes, PR prep, branch cleanup, and tags:

- once the user has clearly approved execution, proceed directly
- do not stop for repeated confirmations between routine steps
- ask again only for irreversible or destructive actions

## Development Preferences

- Package manager and runtime: `bun`
- AI tooling in this repo: Claude Code and Codex
- When installing shared skills, prefer setups that work for both agents
- UI implementation should match `.dev-docs/versions/v0.01/prd.tsx`
- UI visual direction: dark theme (`#030303`) with emerald accent
- Feature changes should also update `docs/PRD.md` when applicable

## Documentation Layout

- `.dev-docs/`: private working area for specs, plans, and versioned design files
- `.dev-docs/bug-report/`: tracked bug writeups and follow-up notes
- `.claude/docs/`: project reference docs for architecture, APIs, and data models
- `docs/`: public repo docs intended to be committed

## Architecture Summary

Three-package monorepo:

- `@flux/shared`: shared types and schema
- `@flux/server`: Hono API and AI runtime, port `3001`
- `@flux/web`: Next.js frontend, port `3000`, connects via `NEXT_PUBLIC_SERVER_URL`

Primary stack:

- Next.js 16
- Hono
- Prisma 7 with PostgreSQL and vector extension
- Vercel AI SDK
- Bun

Key subsystems:

- AI runtime with plugin architecture and dual runtime routing
- Market data via Alpha Vantage with Yahoo Finance fallback, RSS fallback chain, and FMP earnings
- Trading via Alpaca paper trading, realtime order sync, and Discord notifications
- Multi-channel delivery across web, Discord, and cron with a unified channel abstraction
- Memory system using chunked documents and `vector(768)` semantic search
- Scheduling and health monitoring via `CronScheduler` and `HeartbeatMonitor`

See `.claude/docs/architecture.md` for the fuller reference.

## Dependency Constraints

- Charts: use `recharts`, not `chart.js`, `d3`, or `visx`
- Cron scheduling: use `croner`, not `node-cron` or `node-schedule`
- Route validation: use `@hono/standard-validator` with `sValidator` and `zod`
- HTML to Markdown: use `turndown`, not handwritten regex or `cheerio`
- External HTTP requests: use `proxyFetch` from `proxy-fetch.ts`, not raw `fetch`, `Bun.fetch`, or `axios`

## Git and Commit Safety

Never stage these paths:

- `.env*` except `.env.*.example`
- `.claude/worktrees/`
- `.dev-docs/`
- `docs/bug-report/`
- `docs/superpowers/specs/`
- `docs/superpowers/plans/`

Rules:

1. Spec and plan files must live in `.dev-docs/`, not `docs/superpowers/`.
2. Before every commit, run `git diff --cached --name-only` and verify forbidden files are not staged.
3. Do not use `git add -A` or `git add .`; stage explicit paths only.
4. If delegating work to another agent, include the same staging restrictions in that prompt.

## Database and Testing Rules

- After changes, prefer running the full test suite with `bun run test:all`
- Do not use plain `bun test` as a substitute for the full test workflow
- If module exports change, update related mocks in `packages/server/__tests__/{integration,e2e}/{setup.ts,helpers/mock-boundaries.ts}` as needed
- For Prisma schema updates, use `bun run db:push` and `bun run db:generate`
- Do not use `prisma migrate dev` in this repo

## Service Cleanup

After running real integration or E2E flows that start local services, shut down the web and server processes on ports `3000` and `3001`.

## Notes

- Discord behavior, worktree habits, and Claude-specific operational details still live in `.claude/CLAUDE.md`
- When a rule is project-specific and not Claude-specific, prefer keeping it aligned between `AGENTS.md` and `.claude/CLAUDE.md`
