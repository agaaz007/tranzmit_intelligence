/**
 * Tranzmit Replay Snippet
 * Captures real DOM recordings via rrweb and sends them to the Tranzmit API.
 *
 * Prerequisites:
 *   - rrweb must be loaded before this script (e.g., via CDN or npm)
 *   - Mixpanel SDK must be loaded for session ID correlation
 *
 * Configuration (set before loading this script):
 *   window.TRANZMIT_CONFIG = {
 *     apiKey: 'tranzmit_...',          // Required: your Tranzmit API key
 *     endpoint: 'https://your-app.com' // Required: your Tranzmit instance URL
 *   };
 */
(function () {
  'use strict';

  var config = window.TRANZMIT_CONFIG;
  if (!config || !config.apiKey || !config.endpoint) {
    console.warn('[Tranzmit] Missing TRANZMIT_CONFIG. Set { apiKey, endpoint } before loading this script.');
    return;
  }

  var API_KEY = config.apiKey;
  var ENDPOINT = config.endpoint.replace(/\/$/, '') + '/api/ingest/replay';
  var FLUSH_INTERVAL_MS = 10000; // 10 seconds
  var MAX_BUFFER_SIZE = 200;     // flush if buffer exceeds this

  var buffer = [];
  var chunkIndex = 0;
  var sessionId = null;
  var distinctId = null;
  var stopFn = null;
  var flushTimer = null;

  // Try to read Mixpanel session ID (deferred — Mixpanel may not be ready yet)
  function resolveSessionId() {
    if (sessionId) return sessionId;

    try {
      if (typeof mixpanel !== 'undefined' && mixpanel.get_property) {
        sessionId = mixpanel.get_property('$session_id');
        distinctId = mixpanel.get_property('$distinct_id') || mixpanel.get_distinct_id?.() || null;
      }
    } catch (e) {
      // Mixpanel not available yet
    }

    // Fallback: generate a random session ID
    if (!sessionId) {
      sessionId = 'tr_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    return sessionId;
  }

  function flush() {
    if (buffer.length === 0) return;

    var sid = resolveSessionId();
    var events = buffer.slice();
    var idx = chunkIndex;

    buffer = [];
    chunkIndex++;

    var payload = JSON.stringify({
      sessionId: sid,
      distinctId: distinctId,
      chunkIndex: idx,
      events: events,
    });

    // Prefer sendBeacon for reliability during page unload
    var beaconUrl = ENDPOINT + '?key=' + encodeURIComponent(API_KEY);
    var sent = false;

    if (typeof navigator.sendBeacon === 'function') {
      try {
        sent = navigator.sendBeacon(beaconUrl, new Blob([payload], { type: 'application/json' }));
      } catch (e) {
        // Fall through to fetch
      }
    }

    if (!sent) {
      try {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tranzmit-api-key': API_KEY,
          },
          body: payload,
          keepalive: true,
        }).catch(function () {
          // Silently fail — don't break the host page
        });
      } catch (e) {
        // Silently fail
      }
    }
  }

  function startRecording() {
    if (typeof rrweb === 'undefined' || typeof rrweb.record !== 'function') {
      console.warn('[Tranzmit] rrweb not found. Load rrweb before this script.');
      return;
    }

    stopFn = rrweb.record({
      emit: function (event) {
        buffer.push(event);
        if (buffer.length >= MAX_BUFFER_SIZE) {
          flush();
        }
      },
      maskAllInputs: true,
      sampling: {
        mousemove: 50,
        scroll: 150,
        input: 'last',
      },
    });

    // Periodic flush
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

    // Flush on visibility change and before unload
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    });

    window.addEventListener('beforeunload', function () {
      flush();
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startRecording);
  } else {
    startRecording();
  }

  // Expose stop function for manual control
  window.TRANZMIT_STOP = function () {
    if (stopFn) stopFn();
    if (flushTimer) clearInterval(flushTimer);
    flush();
  };
})();
