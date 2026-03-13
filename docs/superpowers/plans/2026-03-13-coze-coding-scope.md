# Coze Coding Scope Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the published npm package and public install references from `@cozeclaw/coze-openclaw-plugin` to `coze-openclaw-plugin` while keeping the plugin runtime ID unchanged.

**Architecture:** Limit the change to packaging metadata and documentation. Preserve `coze-openclaw-plugin` as the runtime plugin ID and config namespace so no code path or user config behavior changes.

**Tech Stack:** npm package metadata, lockfile, Markdown documentation, OpenClaw plugin manifest

---

## Chunk 1: Package Identity

### Task 1: Update published package metadata

**Files:**
- Modify: `./package.json`
- Modify: `./package-lock.json`

- [ ] **Step 1: Update the package name**

Set the top-level package name to `coze-openclaw-plugin` in `./package.json`.

- [ ] **Step 2: Update plugin npm metadata**

Set `plugins[0].npmSpec` in `./package.json` to `coze-openclaw-plugin`.

- [ ] **Step 3: Update lockfile top-level package references**

Replace top-level `name` fields in `./package-lock.json` that refer to the root package with `coze-openclaw-plugin`.

## Chunk 2: Public Docs

### Task 2: Update user-facing package references

**Files:**
- Modify: `./README.md`
- Verify: `./openclaw.plugin.json`

- [ ] **Step 1: Update README package heading and install command**

Change displayed package references from `@cozeclaw/coze-openclaw-plugin` to `coze-openclaw-plugin`.

- [ ] **Step 2: Verify plugin ID stays unchanged**

Confirm `./openclaw.plugin.json` still uses `coze-openclaw-plugin`.

- [ ] **Step 3: Search for stale scoped references**

Run a repository search for `@cozeclaw/coze-openclaw-plugin` and remove or update remaining publish-related references.

## Chunk 3: Verification

### Task 3: Validate the rename

**Files:**
- Verify: `./package.json`
- Verify: `./package-lock.json`
- Verify: `./README.md`

- [ ] **Step 1: Run targeted search verification**

Run: `rg -n "@cozeclaw/coze-openclaw-plugin|coze-openclaw-plugin" ./package.json ./package-lock.json ./README.md ./openclaw.plugin.json`

Expected: New scope appears in package metadata and docs; old scope does not remain in changed files.

- [ ] **Step 2: Run diff format check**

Run: `git diff --check -- ./package.json ./package-lock.json ./README.md ./docs/superpowers/specs/2026-03-13-coze-coding-scope-design.md ./docs/superpowers/plans/2026-03-13-coze-coding-scope.md`

Expected: exit code `0`

- [ ] **Step 3: Commit**

```bash
git add ./package.json ./package-lock.json ./README.md ./docs/superpowers/specs/2026-03-13-coze-coding-scope-design.md ./docs/superpowers/plans/2026-03-13-coze-coding-scope.md
git commit -m "feat(build_agent): switch package scope to coze-coding"
```
