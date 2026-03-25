# Tranzmit SDK

This folder contains the browser SDK shipped by Tranzmit.

## Widget SDK

Load `tranzmit-widget.js` in a client app to poll for triggered voice interview invites.

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

## Replay SDK

For rrweb replay capture, use the snippet surfaced in dashboard settings:

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

## Required values
- `apiKey`: Tranzmit project API key.
- `endpoint`: The Tranzmit app base URL.
- `distinctId`: Stable logged-in user identifier for widget targeting.
- `interviewApiKey`: Optional key forwarded to the interview embed.
