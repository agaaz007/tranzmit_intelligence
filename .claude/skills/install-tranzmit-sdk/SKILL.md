---
name: install-tranzmit-sdk
description: Install the Tranzmit SDK into a client codebase. Use when asked to add the Tranzmit widget, install the Tranzmit replay script, wire Tranzmit into a website or app, or generate the exact integration snippet for a client repo.
---

Install Tranzmit into an existing client codebase with the smallest framework-appropriate change.

## What this skill does
- Detects whether the repo is Next.js, React, plain HTML, or another browser app.
- Finds the best place to inject Tranzmit once for the whole app.
- Wires `window.TRANZMIT_WIDGET_CONFIG` or `window.TRANZMIT_CONFIG` without breaking SSR.
- Reuses the production SDK URLs and snippet shape from this repo.
- Verifies the app still builds or lint-checks when practical.

## Workflow
1. Inspect the repo to identify framework, root layout, and how the app exposes the current user ID.
2. Decide which Tranzmit integration is needed:
   - **Widget SDK** for triggered voice interview popups.
   - **Replay SDK** for rrweb session replay capture.
3. Read only the relevant reference file:
   - `references/widget-integration.md`
   - `references/replay-integration.md`
4. Install the snippet in the narrowest stable root location.
5. Replace placeholders with real values from the client repo when available:
   - Tranzmit project API key
   - Tranzmit app endpoint
   - stable logged-in user `distinctId`
   - optional `interviewApiKey`
6. If secrets or env vars are missing, leave a clearly named env placeholder instead of hardcoding fake values.
7. Validate with the lightest useful command available.

## Rules
- Prefer one global install over duplicating snippets across pages.
- Do not install browser-only code inside server-only files without a client boundary.
- Keep the host app's existing auth/user-loading pattern intact.
- If the repo already has Tranzmit installed, update it in place instead of adding a second copy.
- If the client repo is public, prefer env vars or app config over copying credentials into source.

## Inputs to find or ask for
- Project API key from Tranzmit dashboard settings/triggers.
- Production Tranzmit app base URL.
- Logged-in user identifier for `distinctId`.
- Whether they want widget, replay, or both.

## Output expectations
- Modified app code with Tranzmit installed.
- One short note explaining where it was added.
- One short verification note.
