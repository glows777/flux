---
name: git-flow
description: "Flux project Git workflow management. Use when the user needs to create feature branches, push code and manage PRs, merge PRs, or sync latest main changes. Triggers on: 'new branch', 'push', 'update pr', 'merge pr', 'sync main', or invoking /git-flow directly."
---

# Git Flow

Git workflow for the Flux project. Keeps main history clean (one squash commit per PR) and feature branches linear via rebase.

## Workflow Overview

```
main ──────────────────────────────●──── (squash commit)
  \                               ↑
   └─ feat/v0.08-xxx ── push ── PR ── squash merge ── delete branch
```

Invoke with `/git-flow <phase>` or let the agent infer the phase from context.

| Phase | Description |
|-------|-------------|
| `new <branch>` | Create a feature branch from main |
| `push` | Push + create or update PR |
| `merge` | Squash merge + clean up branches |
| `sync` | Rebase main onto current branch |

---

## Phase 1: Create Feature Branch (`new`)

Create a feature branch from the latest main. Branch name is provided by the user, following the prefix convention.

```bash
git checkout main
git pull --rebase
git checkout -b <branch-name>
```

### Branch Naming

| Prefix | Purpose |
|--------|---------|
| `feat/` | New features (recommended format: `feat/<version>-<description>`) |
| `fix/` | Bug fixes |
| `refactor/` | Refactoring |
| `docs/` | Documentation changes |

If the user provides only a description without a prefix, automatically add the appropriate prefix based on the content.

---

## Phase 2: Push & Manage PR (`push`)

After every push, ensure the PR content stays in sync with the code.

### Steps

1. **Verify clean working tree**

   Run `git status`. If there are uncommitted changes, prompt the user to commit first (suggest using `/commit`). Do not commit on the user's behalf.

2. **Push to remote**

   ```bash
   # First push (no remote tracking branch)
   git push -u origin <branch>

   # Subsequent pushes
   git push
   ```

3. **Check if PR exists**

   ```bash
   gh pr list --head <branch> --json number,title,url,body
   ```

4. **Create or update PR**

   - **No PR exists -> Create**: Analyze `git log main..HEAD --oneline` and `git diff main...HEAD --stat` to generate the PR.
   - **PR exists -> Update**: Re-analyze the full diff and update the PR body.

### PR Structure Template

```markdown
## Summary
- Key changes (3-5 bullet points)

## Changes
| File | Description |
|------|-------------|
| ... | ... |

## Test plan
- [ ] Test items...
```

Title requirements: < 70 characters, use conventional commit prefix (`feat:`, `fix:`, etc.).

### Incremental Comments

When a push includes **significant new features, architectural changes, or important fixes**, append a comment via `gh pr comment` describing the incremental changes:

```markdown
## Update
- What was done and why

### New Commits
- `abc1234` feat: ...
- `def5678` fix: ...
```

Minor tweaks (typos, formatting) do not need a comment — just update the PR body. Rule of thumb: if it's a small adjustment to existing functionality, update the body only; if it introduces new components, new API endpoints, or changes the architectural direction, add a comment.

---

## Phase 3: Merge & Clean Up (`merge`)

### Steps

1. **Check mergeability**

   ```bash
   gh pr view <number> --json mergeable,mergeStateStatus
   ```

2. **Resolve conflicts if any**

   ```bash
   git fetch origin main
   git rebase origin/main
   # Resolve conflicts...
   git push --force-with-lease
   ```

3. **Squash merge**

   ```bash
   gh pr merge <number> --squash
   ```

   Each PR produces exactly one commit on main. The commit message uses the PR title.

4. **Switch back to main and update**

   ```bash
   git checkout main
   git pull --rebase
   ```

5. **Delete the branch**

   ```bash
   git branch -d <branch>
   git push origin --delete <branch>
   ```

Both local and remote branches must be deleted after merging.

---

## Phase 4: Sync Main (`sync`)

During feature branch development, rebase the latest main changes into the current branch.

```bash
git fetch origin main
git rebase origin/main
```

If there are conflicts, resolve them one by one and run `git rebase --continue`.

Then push:

```bash
git push --force-with-lease
```

### Safety Rules

- Always use `--force-with-lease`, never `--force`. `--force-with-lease` checks whether the remote branch has been updated by someone else, preventing accidental overwrites.
- Only force push on feature branches, never on main.

---

## Core Rules

These rules apply across all phases. Stop and confirm if any would be violated:

1. **Merge strategy**: Always Squash and merge (`--squash`) — one PR = one commit on main
2. **Sync strategy**: Always rebase, never introduce merge commits into feature branches
3. **Pull strategy**: `git pull --rebase` to maintain linear history
4. **Force push**: Only `--force-with-lease`, never `--force`
5. **Branch cleanup**: Always delete both local and remote branches after merge
6. **PR sync**: PR body must reflect the full scope of changes after every push
7. **No unsolicited commits**: If the working tree has uncommitted changes, prompt the user — do not commit on their behalf
