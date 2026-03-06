/**
 * Tranzmit Widget SDK v1.0
 * ─────────────────────────────────────────────────────────────────
 * Drop this script into any website, web app, or iOS/Android
 * WebView to enable targeted voice interview invites.
 *
 * HOW IT WORKS:
 *   1. The SDK polls your Tranzmit instance every 5 seconds.
 *   2. When you trigger a widget for a user from the dashboard,
 *      a small invite popup appears on their screen.
 *   3. Clicking it launches the full voice interview interface.
 *
 * SETUP:
 *   <script>
 *     window.TRANZMIT_WIDGET_CONFIG = {
 *       apiKey:          'tranzmit_...',           // Your Tranzmit project API key
 *       endpoint:        'https://app.tranzmit.com', // Your Tranzmit instance URL
 *       distinctId:      currentUser.id,           // The logged-in user's distinct ID
 *       interviewApiKey: 'your_interview_api_key'  // API key for the voice interview
 *     };
 *   </script>
 *   <script src="https://app.tranzmit.com/tranzmit-widget.js"></script>
 *
 * OPTIONAL CONFIG:
 *   pollInterval:    5000  — how often to check (ms, default 5000)
 *   interviewApiKey: '...' — API key passed to the voice interview embed
 *
 * STOP MANUALLY:
 *   window.TRANZMIT_WIDGET_STOP()
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ── Config ────────────────────────────────────────────────── */
  var cfg = window.TRANZMIT_WIDGET_CONFIG;
  if (!cfg || !cfg.apiKey || !cfg.endpoint || !cfg.distinctId) {
    if (cfg) {
      console.warn('[Tranzmit Widget] Missing required config: apiKey, endpoint, and distinctId are all required.');
    }
    return;
  }

  var BASE        = cfg.endpoint.replace(/\/$/, '');
  var CHECK_URL   = BASE + '/api/widget/check';
  var DONE_URL    = BASE + '/api/widget/complete';
  var SDK_URL     = 'https://tranzmit-button-sdk-react-app.vercel.app/embed.js';
  var SDK_BACKEND = 'https://tranzmit-button-sdk-react-app.vercel.app';
  var INTERVAL_MS = cfg.pollInterval || 5000;
  var WIDGET_ID   = '__tz_widget__';

  var shown      = false;
  var pollTimer  = null;
  var interviewLaunched = false;

  /* ── Polling ────────────────────────────────────────────────── */
  function poll() {
    if (shown) return;
    var url = CHECK_URL
      + '?key='        + encodeURIComponent(cfg.apiKey)
      + '&distinctId=' + encodeURIComponent(cfg.distinctId);

    fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.show && !shown) {
          shown = true;
          clearInterval(pollTimer);
          showWidget(data);
        }
      })
      .catch(function () { /* fail silently — never break the host page */ });
  }

  /* ── Report outcome ─────────────────────────────────────────── */
  function reportOutcome(triggerId, outcome) {
    fetch(DONE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerId: triggerId, outcome: outcome }),
    }).catch(function () {});
  }

  /* ── Remove popup ───────────────────────────────────────────── */
  function removeWidget() {
    var el = document.getElementById(WIDGET_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  /* ── Launch interview SDK ───────────────────────────────────── */
  function launchInterview(interviewApiKey) {
    if (interviewLaunched) return;
    var key = interviewApiKey || cfg.interviewApiKey || '';
    if (!key) {
      console.warn('[Tranzmit Widget] No interviewApiKey provided — interview may not load.');
    }
    interviewLaunched = true;
    var s = document.createElement('script');
    s.src = SDK_URL;
    s.setAttribute('data-api-key', key);
    s.setAttribute('data-backend-url', SDK_BACKEND);
    document.head.appendChild(s);
  }

  /* ── Escape HTML ────────────────────────────────────────────── */
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Render popup ───────────────────────────────────────────── */
  function showWidget(data) {
    var triggerId       = data.triggerId;
    var userName        = data.userName || 'there';
    var interviewApiKey = data.interviewApiKey || '';

    /* Inject one-time keyframe style */
    if (!document.getElementById('__tz_style__')) {
      var style = document.createElement('style');
      style.id = '__tz_style__';
      style.textContent = [
        '@keyframes __tz_in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',
        '@keyframes __tz_out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(12px)}}',
        '#' + WIDGET_ID + ' button:hover{opacity:0.88}',
      ].join('\n');
      document.head.appendChild(style);
    }

    var root = document.createElement('div');
    root.id = WIDGET_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Voice interview invite');
    root.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'width:288px',
      'border-radius:16px',
      'overflow:hidden',
      'box-shadow:0 8px 40px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.08)',
      'z-index:2147483647',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
      'animation:__tz_in 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
    ].join(';');

    root.innerHTML = [
      /* Header */
      '<div style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:14px 14px 12px;">',
      '  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">',
      '    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">',
      '      <div style="flex-shrink:0;width:34px;height:34px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;">',
      '        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">',
      '          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>',
      '          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>',
      '          <line x1="12" x2="12" y1="19" y2="22"/>',
      '        </svg>',
      '      </div>',
      '      <div style="min-width:0;">',
      '        <div style="color:#fff;font-size:13.5px;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">',
      '          Hey ' + esc(userName) + ', got a minute?',
      '        </div>',
      '        <div style="color:rgba(255,255,255,0.75);font-size:11.5px;margin-top:1px;">Quick 2-min voice chat</div>',
      '      </div>',
      '    </div>',
      '    <button id="__tz_close__" aria-label="Dismiss" style="flex-shrink:0;background:rgba(255,255,255,0.18);border:none;border-radius:50%;width:26px;height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;line-height:1;padding:0;transition:opacity 0.15s;">',
      '      &#x2715;',
      '    </button>',
      '  </div>',
      '</div>',
      /* Body */
      '<div style="background:#fff;padding:14px 14px 14px;">',
      '  <p style="margin:0 0 12px;color:#374151;font-size:13px;line-height:1.55;">',
      '    We\'d love to hear about your experience — it only takes a couple of minutes.',
      '  </p>',
      '  <button id="__tz_start__" style="display:block;width:100%;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;border:none;border-radius:10px;padding:10px 14px;font-size:13.5px;font-weight:600;cursor:pointer;transition:opacity 0.15s;letter-spacing:0.01em;">',
      '    Start Voice Interview &rarr;',
      '  </button>',
      '</div>',
    ].join('');

    document.body.appendChild(root);

    document.getElementById('__tz_close__').addEventListener('click', function () {
      reportOutcome(triggerId, 'dismissed');
      removeWidget();
    });

    document.getElementById('__tz_start__').addEventListener('click', function () {
      reportOutcome(triggerId, 'clicked');
      removeWidget();
      launchInterview(interviewApiKey);
    });
  }

  /* ── Boot ───────────────────────────────────────────────────── */
  function start() {
    poll();
    pollTimer = setInterval(poll, INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.addEventListener('beforeunload', function () {
    if (pollTimer) clearInterval(pollTimer);
  });

  /* ── Public API ─────────────────────────────────────────────── */
  window.TRANZMIT_WIDGET_STOP = function () {
    if (pollTimer) clearInterval(pollTimer);
    shown = true;
  };

})();
