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

### Worktree Handoff and PR Workflow

Use worktrees for parallel agent implementation when the user wants isolated work, background progress, or an automatic PR/review/fix loop.

- Treat the main workspace as the planning, coordination, and review surface.
- Treat each worktree as an isolated implementation surface.
- Use one worktree and one branch per independent task, preferably `codex/<short-task>`.
- A worktree does not create a PR by itself. PRs are opened from the branch checked out in that worktree.
- Keep file ownership explicit when delegating: list allowed files, do-not-touch files, verification commands, and expected output.
- Do not let multiple agents edit the same shared files in parallel. Shared files such as `package.json`, lockfiles, Prisma schema, shared types, route registries, global styles, and test setup should have a single owner or be changed in a separate base PR.

Before handing off to a worktree:

1. Write or identify the relevant spec/plan in `.dev-docs/specs/` and `.dev-docs/plans/`.
2. Remember that `.dev-docs/` is ignored by Git and will not automatically follow a new worktree.
3. Put the essential spec/plan context directly in the handoff prompt, or provide absolute paths and then verify the worktree can read them.
4. Include `Goal`, `Context`, `Constraints`, `Done when`, allowed files, forbidden files, and verification commands.

For PR-based worktree completion:

1. Ensure the worktree is on a named branch, not detached HEAD.
2. Stage explicit files only.
3. Run the relevant verification, preferably `bun run test:all` before merge readiness.
4. Push the branch and open a draft PR to `main`.
5. Include PR body sections for Summary, Changed files / affected packages, Acceptance criteria, Verification commands and results, Risk areas, Rollback notes, and Review focus.
6. Use Codex/GitHub review and fix loops when useful, but keep human approval as the final merge gate for high-risk or product-direction changes.

Before deleting any worktree:

- inspect tracked, untracked, and ignored files, especially `.dev-docs/`
- inspect `git status`, `git diff`, `git diff --cached`, and recent commits
- copy or restore any useful ignored local documents back to the main workspace
- prefer `git worktree remove <path>` over deleting the directory manually

## Development Preferences

- Package manager and runtime: `bun`
- AI tooling in this repo: Claude Code and Codex
- Superpowers workflow is active in this repo
- When installing shared skills, prefer setups that work for both agents
- UI implementation should match `.dev-docs/versions/v0.01/prd.tsx`
- UI visual direction: dark theme (`#030303`) with emerald accent
- Feature changes should also update `docs/PRD.md` when applicable

## Documentation Layout

- `.dev-docs/`: Superpowers working area for specs, plans, and versioned design files
- `.dev-docs/bug-report/`: tracked bug writeups and follow-up notes
- `.claude/docs/`: project reference docs for architecture, APIs, and data models
- `docs/`: public repo docs intended to be committed

## Superpowers Workflow

- Write Superpowers specs to `.dev-docs/specs/`
- Write Superpowers plans to `.dev-docs/plans/`
- Treat `.dev-docs/versions/` as the place for versioned design artifacts such as `prd.tsx`
- Do not write new Superpowers specs or plans to `docs/superpowers/`

When writing a spec or design document, focus on the "why", not just the conclusion:

- explain the causal chain behind decisions
- avoid black-box phrasing like "after analysis"
- embed research where it affects a decision, instead of isolating it as a detached section
- write so someone can reconstruct the reasoning later without extra context

Reference: `.claude/docs/design-doc-methodology.md`

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
2. The default Superpowers spec/plan paths are overridden in this repo to `.dev-docs/specs/` and `.dev-docs/plans/`.
3. Before every commit, run `git diff --cached --name-only` and verify forbidden files are not staged.
4. Do not use `git add -A` or `git add .`; stage explicit paths only.
5. If delegating work to another agent, include the same staging restrictions in that prompt.

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
