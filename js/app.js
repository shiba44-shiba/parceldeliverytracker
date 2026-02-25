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

  // ---- Console Logger ----
  const LOG_PREFIX = '[ParcelTracker]';

  function _log(msg, ...args) {
    console.log(`${LOG_PREFIX} ${msg}`, ...args);
  }

  function _warn(msg, ...args) {
    console.warn(`${LOG_PREFIX} ${msg}`, ...args);
  }

  function _error(msg, ...args) {
    console.error(`${LOG_PREFIX} ${msg}`, ...args);
  }

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
    _log('Initialising Parcel Delivery Tracker…');
    _cacheDom();
    _loadSettings();
    _loadParcels();
    _bindEvents();
    _render();
    _startPolling();

    // Request notification permission early (won't show prompt until user interacts)
    if (Notifications.isSupported() && Notification.permission === 'default') {
      _log('Notification permission not yet requested – will prompt on first parcel add');
    }

    // Register minimal service worker for PWA / offline caching
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('sw.js')
        .then(() => _log('Service Worker registered successfully'))
        .catch((err) => _warn('Service Worker registration failed:', err.message));
    } else {
      _warn('Service Workers not supported in this browser');
    }

    _log('App ready – tracking %d parcel(s)', _parcels.length);
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
        _log('Loading saved settings');
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
          _log('API key loaded from settings');
        }
      } else {
        _log('No saved settings found – using defaults');
      }
    } catch (err) {
      _warn('Failed to load settings (corrupt data):', err.message);
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
      _log('Settings saved');
    } catch (err) {
      _warn('Failed to save settings (storage full?):', err.message);
    }
  }

  // ---- Parcels Persistence ----

  function _loadParcels() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _parcels = JSON.parse(raw);
        _log('Loaded %d parcel(s) from storage', _parcels.length);
      } else {
        _log('No saved parcels found');
      }
    } catch (err) {
      _warn('Failed to load parcels (corrupt data):', err.message);
      _parcels = [];
    }
  }

  function _saveParcels() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_parcels));
    } catch (err) {
      _warn('Failed to save parcels (storage full?):', err.message);
    }
  }

  // ---- Events ----

  function _bindEvents() {
    els.saveEmailBtn.addEventListener('click', () => {
      const email = els.emailInput.value.trim();
      if (!email || !_isValidEmail(email)) {
        _showStatus(els.settingsStatus, 'Please enter a valid email address.', 'error');
        _warn('Invalid email address entered');
        return;
      }
      Email.setRecipientEmail(email);
      _saveSettings();
      _log('Email address saved: %s', email);
      _showStatus(els.settingsStatus, 'Email saved ✓', 'success');
    });

    els.saveApiKeyBtn.addEventListener('click', () => {
      Tracker.setApiKey(els.apiKeyInput.value);
      _saveSettings();
      _log('API key updated');
      _showStatus(els.settingsStatus, 'API key saved ✓', 'success');
    });

    els.chromeNotifToggle.addEventListener('change', () => {
      Notifications.setEnabled(els.chromeNotifToggle.checked);
      _log('Chrome notifications %s', els.chromeNotifToggle.checked ? 'enabled' : 'disabled');
      if (els.chromeNotifToggle.checked) {
        Notifications.requestPermission();
      }
      _saveSettings();
    });

    els.emailNotifToggle.addEventListener('change', () => {
      Email.setEnabled(els.emailNotifToggle.checked);
      _log('Email notifications %s', els.emailNotifToggle.checked ? 'enabled' : 'disabled');
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
      _warn('Empty tracking number submitted');
      return;
    }

    if (_parcels.some((p) => p.trackingNumber === num)) {
      _showStatus(els.addStatus, 'This tracking number is already being tracked.', 'info');
      _log('Duplicate tracking number: %s', num);
      return;
    }

    // Request notification permission on first interaction
    Notifications.requestPermission();

    _showStatus(els.addStatus, 'Adding…', 'info');
    _log('Adding parcel: %s (carrier: %s)', num, carrier);
    els.addTrackingBtn.disabled = true;

    try {
      const result = await Tracker.createTracking(num, carrier);
      _parcels.unshift(result);
      _saveParcels();
      _render();
      els.trackingInput.value = '';
      _log('Parcel added successfully: %s [%s]', result.trackingNumber, result.statusText);
      _showStatus(els.addStatus, 'Parcel added ✓', 'success');
    } catch (err) {
      _error('Failed to add parcel %s:', num, err.message);
      _showStatus(els.addStatus, `Error: ${err.message}`, 'error');
    } finally {
      els.addTrackingBtn.disabled = false;
    }
  }

  // ---- Polling ----

  function _startPolling() {
    _stopPolling();
    _pollTimer = setInterval(_pollAll, POLL_INTERVAL);
    _log('Polling started (interval: %ds)', POLL_INTERVAL / 1000);
  }

  function _stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  async function _pollAll() {
    if (_parcels.length === 0) return;

    _log('Polling %d parcel(s) for updates…', _parcels.length);

    // Process sequentially to avoid API rate limits
    for (let i = 0; i < _parcels.length; i++) {
      const p = _parcels[i];
      // Skip delivered parcels
      if (p.status === 'delivered') {
        _log('Skipping delivered parcel: %s', p.trackingNumber);
        continue;
      }

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

          _log('Update detected for %s: %s → %s', updated.trackingNumber, oldStatus, updated.status);
          Notifications.notify(updated.trackingNumber, updated.statusText, latestMsg);
          Email.sendUpdate(updated.trackingNumber, updated.statusText, latestMsg);
        }
      } catch (err) {
        _warn('Failed to poll parcel %s: %s', p.trackingNumber, err.message);
      }
    }

    _saveParcels();
    _log('Polling complete');
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

    _log('Refreshing parcel: %s', p.trackingNumber);
    try {
      const updated = await Tracker.getTracking(p.trackingNumber, p.carrier);
      _parcels[idx] = updated;
      _saveParcels();
      _render();
      _log('Parcel refreshed: %s [%s]', updated.trackingNumber, updated.statusText);
    } catch (err) {
      _warn('Failed to refresh parcel %s: %s', p.trackingNumber, err.message);
    }
  }

  function _removeSingle(idx) {
    const p = _parcels[idx];
    _log('Removing parcel: %s', p ? p.trackingNumber : idx);
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
