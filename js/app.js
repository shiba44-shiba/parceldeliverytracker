/**
 * app.js - Main Application Logic
 *
 * Orchestrates the tracker, notifications and email modules.
 * Polls for updates every 5 minutes and persists state in localStorage.
 *
 * Performance notes:
 * - Uses requestAnimationFrame for DOM writes to avoid layout thrashing.
 * - Batches DOM updates via documentFragment.
 * - Avoids synchronous localStorage reads during render.
 */

/* global Tracker, Notifications, Email */

const App = (() => {
  'use strict';

  // ---- State ----
  const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
  const STORAGE_KEY = 'parcelTracker_parcels';
  const SETTINGS_KEY = 'parcelTracker_settings';

  let _parcels = []; // { trackingNumber, carrier, status, statusText, updates[], lastChecked }
  let _pollTimer = null;

  // ---- DOM refs (cached once) ----
  let els = {};

  // ---- Init ----

  function init() {
    _cacheDom();
    _loadSettings();
    _loadParcels();
    _bindEvents();
    _render();
    _startPolling();

    // Request notification permission early (won't show prompt until user interacts)
    if (Notifications.isSupported() && Notification.permission === 'default') {
      // We'll request on first add instead to avoid the auto-prompt policy
    }

    // Register minimal service worker for PWA / offline caching
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  function _cacheDom() {
    els = {
      emailInput: document.getElementById('emailInput'),
      saveEmailBtn: document.getElementById('saveEmailBtn'),
      chromeNotifToggle: document.getElementById('chromeNotifToggle'),
      emailNotifToggle: document.getElementById('emailNotifToggle'),
      apiKeyInput: document.getElementById('apiKeyInput'),
      saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
      settingsStatus: document.getElementById('settingsStatus'),
      trackingInput: document.getElementById('trackingInput'),
      carrierSelect: document.getElementById('carrierSelect'),
      addTrackingBtn: document.getElementById('addTrackingBtn'),
      addStatus: document.getElementById('addStatus'),
      refreshAllBtn: document.getElementById('refreshAllBtn'),
      parcelList: document.getElementById('parcelList'),
    };
  }

  // ---- Settings ----

  function _loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.email) {
          Email.setRecipientEmail(s.email);
          els.emailInput.value = s.email;
        }
        if (typeof s.chromeNotif === 'boolean') {
          Notifications.setEnabled(s.chromeNotif);
          els.chromeNotifToggle.checked = s.chromeNotif;
        }
        if (typeof s.emailNotif === 'boolean') {
          Email.setEnabled(s.emailNotif);
          els.emailNotifToggle.checked = s.emailNotif;
        }
        if (s.apiKey) {
          Tracker.setApiKey(s.apiKey);
          els.apiKeyInput.value = s.apiKey;
        }
      }
    } catch (_) {
      // corrupt data – ignore
    }
  }

  function _saveSettings() {
    const settings = {
      email: Email.getRecipientEmail(),
      chromeNotif: Notifications.isEnabled(),
      emailNotif: Email.isEnabled(),
      apiKey: Tracker.getApiKey(),
    };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {
      // storage full – ignore
    }
  }

  // ---- Parcels Persistence ----

  function _loadParcels() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) _parcels = JSON.parse(raw);
    } catch (_) {
      _parcels = [];
    }
  }

  function _saveParcels() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_parcels));
    } catch (_) {
      // ignore
    }
  }

  // ---- Events ----

  function _bindEvents() {
    els.saveEmailBtn.addEventListener('click', () => {
      const email = els.emailInput.value.trim();
      if (!email || !_isValidEmail(email)) {
        _showStatus(els.settingsStatus, 'Please enter a valid email address.', 'error');
        return;
      }
      Email.setRecipientEmail(email);
      _saveSettings();
      _showStatus(els.settingsStatus, 'Email saved ✓', 'success');
    });

    els.saveApiKeyBtn.addEventListener('click', () => {
      Tracker.setApiKey(els.apiKeyInput.value);
      _saveSettings();
      _showStatus(els.settingsStatus, 'API key saved ✓', 'success');
    });

    els.chromeNotifToggle.addEventListener('change', () => {
      Notifications.setEnabled(els.chromeNotifToggle.checked);
      if (els.chromeNotifToggle.checked) {
        Notifications.requestPermission();
      }
      _saveSettings();
    });

    els.emailNotifToggle.addEventListener('change', () => {
      Email.setEnabled(els.emailNotifToggle.checked);
      _saveSettings();
    });

    els.addTrackingBtn.addEventListener('click', _addParcel);

    els.trackingInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') _addParcel();
    });

    els.refreshAllBtn.addEventListener('click', () => {
      _pollAll();
    });
  }

  // ---- Add Parcel ----

  async function _addParcel() {
    const num = els.trackingInput.value.trim();
    const carrier = els.carrierSelect.value;

    if (!num) {
      _showStatus(els.addStatus, 'Please enter a tracking number.', 'error');
      return;
    }

    if (_parcels.some((p) => p.trackingNumber === num)) {
      _showStatus(els.addStatus, 'This tracking number is already being tracked.', 'info');
      return;
    }

    // Request notification permission on first interaction
    Notifications.requestPermission();

    _showStatus(els.addStatus, 'Adding…', 'info');
    els.addTrackingBtn.disabled = true;

    try {
      const result = await Tracker.createTracking(num, carrier);
      _parcels.unshift(result);
      _saveParcels();
      _render();
      els.trackingInput.value = '';
      _showStatus(els.addStatus, 'Parcel added ✓', 'success');
    } catch (err) {
      _showStatus(els.addStatus, `Error: ${err.message}`, 'error');
    } finally {
      els.addTrackingBtn.disabled = false;
    }
  }

  // ---- Polling ----

  function _startPolling() {
    _stopPolling();
    _pollTimer = setInterval(_pollAll, POLL_INTERVAL);
  }

  function _stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  async function _pollAll() {
    if (_parcels.length === 0) return;

    // Process sequentially to avoid API rate limits
    for (let i = 0; i < _parcels.length; i++) {
      const p = _parcels[i];
      // Skip delivered parcels
      if (p.status === 'delivered') continue;

      try {
        const updated = await Tracker.getTracking(p.trackingNumber, p.carrier);
        const oldStatus = p.status;
        const oldUpdateCount = (p.updates || []).length;

        _parcels[i] = updated;

        // Detect changes
        const hasNewStatus = updated.status !== oldStatus;
        const hasNewUpdates = (updated.updates || []).length > oldUpdateCount;

        if (hasNewStatus || hasNewUpdates) {
          const latestMsg = updated.updates && updated.updates.length > 0
            ? updated.updates[0].message
            : '';

          Notifications.notify(updated.trackingNumber, updated.statusText, latestMsg);
          Email.sendUpdate(updated.trackingNumber, updated.statusText, latestMsg);
        }
      } catch (_) {
        // Network error – skip this parcel, try again next cycle
      }
    }

    _saveParcels();
    requestAnimationFrame(() => _render());
  }

  // ---- Rendering (batched via rAF) ----

  function _render() {
    const container = els.parcelList;

    if (_parcels.length === 0) {
      container.innerHTML =
        '<p class="empty-state">No parcels tracked yet. Add a tracking number above to get started.</p>';
      return;
    }

    // Build a document fragment for a single reflow
    const frag = document.createDocumentFragment();

    _parcels.forEach((p, idx) => {
      const div = document.createElement('div');
      div.className = 'parcel-item fade-in';
      div.setAttribute('data-tracking', p.trackingNumber);

      const statusClass = `status-${p.status || 'unknown'}`;
      const updatesHtml = (p.updates || [])
        .map(
          (u) =>
            `<li><span class="update-time">${_formatTime(u.time)}</span>${_escHtml(u.message)}${u.location ? ' – ' + _escHtml(u.location) : ''}</li>`
        )
        .join('');

      div.innerHTML = `
        <div class="parcel-header">
          <div>
            <span class="parcel-tracking-number">${_escHtml(p.trackingNumber)}</span>
            <span class="parcel-carrier">${_escHtml(p.carrier)}</span>
          </div>
          <span class="parcel-status ${statusClass}">${_escHtml(p.statusText || 'Unknown')}</span>
        </div>
        ${
          updatesHtml
            ? `<details class="parcel-updates"><summary>Show updates (${p.updates.length})</summary><ul class="update-list">${updatesHtml}</ul></details>`
            : ''
        }
        <p class="parcel-last-checked">Last checked: ${_formatTime(p.lastChecked)}</p>
        <div class="parcel-actions">
          <button class="btn btn-secondary btn-sm" data-refresh="${idx}">🔄 Refresh</button>
          <button class="btn btn-danger btn-sm" data-remove="${idx}">✕ Remove</button>
        </div>
      `;
      frag.appendChild(div);
    });

    container.innerHTML = '';
    container.appendChild(frag);

    // Bind per-parcel action buttons via event delegation
    container.addEventListener('click', _handleParcelAction, false);
  }

  function _handleParcelAction(e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const refreshIdx = btn.getAttribute('data-refresh');
    const removeIdx = btn.getAttribute('data-remove');

    if (refreshIdx !== null) {
      _refreshSingle(parseInt(refreshIdx, 10));
    } else if (removeIdx !== null) {
      _removeSingle(parseInt(removeIdx, 10));
    }
  }

  async function _refreshSingle(idx) {
    const p = _parcels[idx];
    if (!p) return;

    try {
      const updated = await Tracker.getTracking(p.trackingNumber, p.carrier);
      _parcels[idx] = updated;
      _saveParcels();
      _render();
    } catch (_) {
      // ignore
    }
  }

  function _removeSingle(idx) {
    _parcels.splice(idx, 1);
    _saveParcels();
    _render();
  }

  // ---- Helpers ----

  function _isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function _showStatus(el, msg, type) {
    el.textContent = msg;
    el.className = 'status-msg ' + (type || '');
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        el.textContent = '';
        el.className = 'status-msg';
      }, 3000);
    }
  }

  function _formatTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch (_) {
      return iso;
    }
  }

  function _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ---- Boot ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
