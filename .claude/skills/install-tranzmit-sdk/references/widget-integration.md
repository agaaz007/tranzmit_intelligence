# Widget SDK integration

Use this when the client wants the voice interview popup widget.

## Required config
```html
<script>
  window.TRANZMIT_WIDGET_CONFIG = {
    apiKey: 'tranzmit_...',
    endpoint: 'https://app.tranzmit.com',
    distinctId: currentUser.id,
    interviewApiKey: 'optional_interview_key'
  };
</script>
<script src="https://app.tranzmit.com/tranzmit-widget.js"></script>
```

## Framework notes

### Next.js App Router
- Install from a small client component rendered once in `src/app/layout.tsx` or the authenticated app layout.
- Use `next/script` or a client `useEffect` block.
- Guard browser access with `'use client'`.

### Next.js Pages Router
- Install in `_app.tsx` or a shared authenticated layout.
- Use `next/script` for the SDK script.

### React / Vite
- Install in the root app component or authenticated shell.
- Append the script once from `useEffect`.

### Plain HTML
- Add the config block before the SDK `<script>` tag near the end of `body`.

## Distinct ID guidance
- Use the same stable user ID the product analytics tool uses when possible.
- Good options: authenticated user ID, analytics distinct ID, account ID.
- Avoid ephemeral values like random session IDs unless the product truly works per-session.

## Verification
- Confirm the config object is present in the browser.
- Confirm only one copy of `tranzmit-widget.js` loads.
- Confirm the app still renders for signed-out users if the host app supports that state.
