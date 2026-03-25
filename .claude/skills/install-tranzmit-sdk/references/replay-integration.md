# Replay SDK integration

Use this when the client wants rrweb session replay capture sent to Tranzmit.

## Required snippet
```html
<script src="https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb-all.min.js"></script>
<script>
  window.TRANZMIT_CONFIG = {
    apiKey: 'tranzmit_...',
    endpoint: 'https://app.tranzmit.com'
  };
</script>
<script src="https://app.tranzmit.com/tranzmit-replay.js"></script>
```

## Placement
- Install once in the global authenticated shell when possible.
- Make sure rrweb loads before `tranzmit-replay.js`.
- Avoid adding the snippet multiple times across route transitions.

## Verification
- Confirm `window.TRANZMIT_CONFIG` exists.
- Confirm rrweb is loaded before Tranzmit replay starts.
- Confirm replay requests go to the configured Tranzmit endpoint.
