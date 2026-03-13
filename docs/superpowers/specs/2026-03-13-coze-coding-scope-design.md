# Coze Coding Scope Design

**Goal:** Move the published npm package identity from `@cozeclaw/coze-openclaw-plugin` to `coze-openclaw-plugin` without changing the plugin runtime ID `coze-openclaw-plugin`.

## Scope

- Update npm package naming and publish/install references.
- Keep plugin ID, config keys, and runtime behavior unchanged.
- Clean up documentation references that point to the old scoped package name.

## Affected Areas

- `./package.json`: published package name and plugin metadata npm spec.
- `./package-lock.json`: top-level package name entries.
- `./README.md`: displayed package title and install command.
- `./openclaw.plugin.json`: confirm plugin ID remains unchanged.

## Non-Goals

- Renaming plugin ID `coze-openclaw-plugin`
- Renaming config path `plugins.entries.coze-openclaw-plugin.config.apiKey`
- Changing skill metadata or runtime imports unrelated to npm package identity
