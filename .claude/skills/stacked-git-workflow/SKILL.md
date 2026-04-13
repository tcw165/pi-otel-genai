---
name: stacked-git-workflow
description: Manage changes in stacked PRs using Graphite CLI (gt). Use for pushing changes, creating stacked PRs, submitting code for review, rebasing stacks, navigating branches, syncing with trunk, and dependent/stacked Git changes. Includes recommended workflow patterns.
---

# Stacked Git Workflow with Graphite CLI (gt)

Graphite simplifies stacked PR workflows on GitHub. Each branch only has one commit, and is in a stack builds on top of the previous one, keeping changes small, focused, and reviewable.

## Commands:
- `git` Git CLI
- `gt` Graphite CLI

## Key Concepts

- **Stack**: A sequence of PRs, each building off its parent. e.g. `main ← PR1 ← PR2 ← PR3`
- **Trunk**: The base branch stacks merge into (usually `main`)
- **Downstack**: PRs below the current one (ancestors)
- **Upstack**: PRs above the current one (descendants)

## Setup

```bash
git init  # Initialize git repository
```

## Discover Graphite CLI Features

```bash
gt --help
```

## Creating & Stacking All Changes

```bash
# Create a new branch with staged changes (stacks on current branch)
gt create -m "description of changes"

# Follow the step of syncing-and-rebasing
...

# Push to remote
gt submit --stack
```

## Syncing & Rebasing

```bash
# Sync trunk from remote, rebase all stacks, clean up merged branches
gt sync
```

## Resolve Merge Conflict

```bash
# Restack all branches in the current stack (fix parent history)
gt sync && gt restack

# Iteratively resolve conflict
...

# Continue the rebase and restacking
gt continue
```

## Submit Current PR

```bash
gt submit
```

## Submitting Entire PRs Stack

```bash
gt submit --stack
```

## Navigating Stacks

```bash
gt up [steps]              # Move to child branch
gt down [steps]            # Move to parent branch
gt top                     # Jump to tip of current stack
gt bottom                  # Jump to branch closest to trunk
gt checkout [branch]       # Interactive branch selector (or specify branch)
gt log                     # Visual graph of current stack
gt log short               # Compact view
gt log long                # Detailed view
```

## Branch Management

```bash
gt delete [name]           # Delete branch, restack children onto parent
gt rename [name]           # Rename branch and update metadata
gt fold                    # Fold branch's changes into its parent
gt split                   # Split current branch into multiple branches
gt squash                  # Squash all commits in branch into one
gt track [branch]          # Start tracking an existing branch with Graphite
gt untrack [branch]        # Stop tracking a branch
gt move                    # Rebase current branch onto a different target
gt reorder                 # Interactively reorder branches in the stack
gt pop                     # Delete current branch but keep working tree changes
gt undo                    # Undo the most recent Graphite mutation
```

## Freezing (Exclude from Submit)

```bash
gt freeze [branch]         # Freeze branch + downstack (excluded from submit)
gt unfreeze [branch]       # Unfreeze branch + upstack
```

## Conflict Resolution

```bash
gt continue                # Continue after resolving a rebase conflict
gt abort                   # Abort the current rebase
```

## Branch Info

```bash
gt info [branch]           # Display info about current/specified branch
gt parent                  # Show parent branch
gt children                # Show child branches
gt trunk                   # Show trunk branch
```

## GitHub / Graphite Web

```bash
gt pr [branch]             # Open PR page in browser
gt dash                    # Open Graphite dashboard
gt merge                   # Merge PRs from trunk to current branch via Graphite
gt get [branch]            # Sync a branch/PR from remote
```

## ⚠️ STRICT WORKFLOW - Always Follow This Flow

**Never use raw git commands like `git commit` or `git push origin main`. Always use Graphite.**

### Step 1: Stage Changes with Git
```bash
git add <changes>
```
This is the ONLY place you use raw `git` - to stage files.

### Step 2: Commit with Graphite
**For a new PR:**
```bash
gt create -m "description of changes"
```

**For changes to an existing PR:**
```bash
gt modify
```

### Step 3: Submit to Cloud with Graphite
```bash
gt submit --stack
```

This creates PR(s) on GitHub + Graphite dashboard with the PR URL. Changes are NOT in trunk (`main`) until the PR is reviewed and merged.

---

**Key Rules:**
- ✅ Use `git add` to stage
- ✅ Use `gt create` for new PRs
- ✅ Use `gt modify` for existing PRs
- ✅ Use `gt submit --stack` to push
- ❌ Never use `git commit`
- ❌ Never use `git push origin main`
- ❌ Never use `git commit --amend`

---

## Workflow Scenarios

### Scenario 1: New Feature (Single PR)

```bash
# Step 1: Make changes
echo "new code" >> src/feature.ts

# Step 1: Stage changes
git add src/feature.ts

# Step 2: Create PR with Graphite (NOT git commit!)
gt create -m "add new feature"

# Step 3: Submit to cloud
gt submit

# PR URL shown in terminal — share for review
# After approval & merge on GitHub, changes appear in main
```

### Scenario 2: Feature Stack (Multiple Related PRs)

```bash
# Start from trunk
gt checkout main

# PR 1: Foundation
echo "base API" >> src/api.ts
git add src/api.ts
gt create -m "add base API endpoint"

# PR 2: Stack on top of PR 1
echo "business logic" >> src/logic.ts
git add src/logic.ts
gt create -m "add business logic"

# PR 3: Stack on top of PR 2
echo "ui component" >> src/ui.ts
git add src/ui.ts
gt create -m "add UI component"

# Step 3: Submit entire stack at once
gt submit --stack

# All three PRs created in dependency chain
# Review & merge in order: PR1 → PR2 → PR3
```

### Scenario 3: Updating an Existing PR

```bash
# Make changes
echo "bug fix" >> src/feature.ts

# Step 1: Stage changes
git add src/feature.ts

# Step 2: Update current PR with Graphite (NOT git commit --amend!)
gt modify

# Step 3: Resubmit
gt submit
```

### Scenario 4: Reviewing & Merging

```bash
# View your stacks
gt log

# Open PR in browser for review
gt pr

# After approval on GitHub, merge via Graphite or GitHub UI
# Then sync locally
gt sync

# Cleanup: gt sync removes merged branches automatically
```

---

## Typical Full Workflow

```bash
# Start from trunk
gt checkout main

# PR 1: API foundation
# (make changes)
git add src/api.ts
gt create -m "add API endpoint"

# PR 2: Frontend (stacked on PR 1)
# (make changes)
git add src/frontend.ts
gt create -m "add frontend for API"

# PR 3: Documentation (stacked on PR 2)
# (make changes)
git add docs/api.md
gt create -m "add API docs"

# Step 3: Submit entire stack
gt submit --stack

# After review feedback, update the PR that needs changes
gt checkout "add API endpoint"
# (make changes)
git add src/api.ts
gt modify

# Resubmit the updated PR and its stack
gt submit

# After all PRs are merged on GitHub, sync trunk
gt sync
```

## Tips

- Always use `gt sync` before starting new work to stay up to date
- Use `gt log` frequently to visualize your stack
- Prefer small, focused branches — that's the whole point of stacking
- **Always use `gt modify` for updates** (never `git commit --amend`)
- **Always use `gt create` for new PRs** (never `git commit`)
- **Always use `gt submit --stack`** (never `git push origin main`)
- Use `gt submit --stack` to push the entire stack at once
- If a rebase conflicts, resolve and run `gt continue`
- Use `gt undo` if something goes wrong
