(function () {
  'use strict';
  var scripts = document.querySelectorAll('script[data-api-key]');
  var tag = scripts[scripts.length - 1];
  if (!tag) return;
  var KEY = tag.getAttribute('data-api-key');
  if (!KEY) return;
  var ENDPOINT = (tag.getAttribute('data-endpoint') || window.location.origin).replace(/\/$/, '');
  var URL = ENDPOINT + '/api/ingest/errors';
  var buffer = [], counts = {}, distinctId = null;

  function getDistinctId() {
    if (distinctId) return distinctId;
    try { if (typeof mixpanel !== 'undefined' && mixpanel.get_distinct_id) distinctId = mixpanel.get_distinct_id(); } catch (e) {}
    return distinctId;
  }

  function add(type, msg, stack) {
    if (!msg) return;
    var k = type + ':' + msg;
    counts[k] = (counts[k] || 0) + 1;
    if (counts[k] > 3) return;
    buffer.push({ errorType: type, errorMessage: String(msg).substring(0, 4096), stackTrace: stack ? String(stack).substring(0, 8192) : null, url: window.location.href, timestamp: new Date().toISOString(), sessionId: null });
    if (buffer.length >= 10) flush();
  }

  function flush() {
    if (!buffer.length) return;
    var errors = buffer.splice(0);
    var payload = JSON.stringify({ errors: errors, distinctId: getDistinctId() });
    var beaconUrl = URL + '?key=' + encodeURIComponent(KEY);
    var sent = false;
    if (navigator.sendBeacon) try { sent = navigator.sendBeacon(beaconUrl, new Blob([payload], { type: 'application/json' })); } catch (e) {}
    if (!sent) try { fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tranzmit-api-key': KEY }, body: payload, keepalive: true }).catch(function () {}); } catch (e) {}
  }

  var origOnError = window.onerror;
  window.onerror = function (msg, src, line, col, err) {
    add('javascript', String(msg), err && err.stack ? err.stack : src ? 'at ' + src + ':' + line + ':' + col : null);
    if (typeof origOnError === 'function') return origOnError.apply(this, arguments);
    return false;
  };
  window.addEventListener('unhandledrejection', function (e) {
    var msg = 'Unhandled Promise Rejection', stack = null;
    if (e.reason) { msg = e.reason.message || (typeof e.reason === 'string' ? e.reason : String(e.reason)); stack = e.reason.stack || null; }
    add('unhandled_rejection', msg, stack);
  });
  setInterval(flush, 5000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('beforeunload', flush);
})();
