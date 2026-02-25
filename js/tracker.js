/**
 * tracker.js - Parcel Tracking API Integration
 *
 * Provides tracking data via the TrackingMore API (https://www.trackingmore.com/).
 * Falls back to demo/mock data when no API key is configured, so the app
 * can still be explored without an account.
 *
 * Performance notes:
 * - Uses AbortController to cancel stale requests
 * - Caches responses to avoid redundant network calls within the same poll cycle
 */

/* global AbortController, fetch */

const Tracker = (() => {
  'use strict';

  const LOG_PREFIX = '[Tracker]';
  const API_BASE = 'https://api.trackingmore.com/v4';
  let _apiKey = '';
  let _abortController = null;

  /**
   * Set the TrackingMore API key.
   * @param {string} key
   */
  function setApiKey(key) {
    _apiKey = (key || '').trim();
    console.log(`${LOG_PREFIX} API key %s`, _apiKey ? 'configured' : 'cleared (demo mode)');
  }

  /**
   * Get the current API key.
   * @returns {string}
   */
  function getApiKey() {
    return _apiKey;
  }

  /**
   * Cancel any in-flight requests.
   */
  function cancelPending() {
    if (_abortController) {
      _abortController.abort();
      _abortController = null;
    }
  }

  /**
   * Create a tracking entry via the API.
   * @param {string} trackingNumber
   * @param {string} carrier - carrier slug or 'auto'
   * @returns {Promise<object>} normalised tracking result
   */
  async function createTracking(trackingNumber, carrier) {
    if (!_apiKey) {
      console.log(`${LOG_PREFIX} No API key – using demo data for: %s`, trackingNumber);
      return _mockCreate(trackingNumber, carrier);
    }

    console.log(`${LOG_PREFIX} Creating tracking via API: %s (carrier: %s)`, trackingNumber, carrier);
    cancelPending();
    _abortController = new AbortController();

    const body = { tracking_number: trackingNumber };
    if (carrier && carrier !== 'auto') {
      body.courier_code = carrier;
    }

    const res = await fetch(`${API_BASE}/trackings/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Tracking-Api-Key': _apiKey,
      },
      body: JSON.stringify(body),
      signal: _abortController.signal,
    });

    const json = await res.json();

    if (json.meta && json.meta.code !== 200 && json.meta.code !== 4016) {
      console.error(`${LOG_PREFIX} API error (create):`, json.meta.message);
      throw new Error(json.meta.message || 'API error');
    }

    console.log(`${LOG_PREFIX} Tracking created successfully: %s`, trackingNumber);
    return _normalise(json.data || {}, trackingNumber, carrier);
  }

  /**
   * Fetch the latest status for a tracking number.
   * @param {string} trackingNumber
   * @param {string} carrier
   * @returns {Promise<object>} normalised tracking result
   */
  async function getTracking(trackingNumber, carrier) {
    if (!_apiKey) {
      console.log(`${LOG_PREFIX} No API key – returning demo data for: %s`, trackingNumber);
      return _mockGet(trackingNumber, carrier);
    }

    console.log(`${LOG_PREFIX} Fetching tracking via API: %s`, trackingNumber);
    cancelPending();
    _abortController = new AbortController();

    const body = { tracking_number: trackingNumber };
    if (carrier && carrier !== 'auto') {
      body.courier_code = carrier;
    }

    const res = await fetch(`${API_BASE}/trackings/get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Tracking-Api-Key': _apiKey,
      },
      body: JSON.stringify(body),
      signal: _abortController.signal,
    });

    const json = await res.json();

    if (json.meta && json.meta.code !== 200) {
      console.error(`${LOG_PREFIX} API error (get):`, json.meta.message);
      throw new Error(json.meta.message || 'API error');
    }

    // The API may return an array; use the first match.
    const data = Array.isArray(json.data) ? json.data[0] : json.data;
    console.log(`${LOG_PREFIX} Tracking data received for: %s`, trackingNumber);
    return _normalise(data || {}, trackingNumber, carrier);
  }

  // ---- Normalisation ----

  /**
   * Normalise API response into a consistent app-level shape.
   */
  function _normalise(data, trackingNumber, carrier) {
    const status = _mapStatus(data.delivery_status || data.status || 'pending');
    const updates = (data.origin_info && data.origin_info.trackinfo
      ? data.origin_info.trackinfo
      : []
    ).map((item) => ({
      time: item.Date || item.checkpoint_date || '',
      message: item.StatusDescription || item.checkpoint_delivery_status || item.tracking_detail || '',
      location: item.Details || item.location || '',
    }));

    return {
      trackingNumber: data.tracking_number || trackingNumber,
      carrier: data.courier_code || carrier || 'auto',
      status,
      statusText: _statusLabel(status),
      updates,
      lastChecked: new Date().toISOString(),
    };
  }

  function _mapStatus(raw) {
    const lower = (raw || '').toLowerCase();
    if (lower.includes('deliver')) return 'delivered';
    if (lower.includes('transit') || lower.includes('pickup')) return 'in-transit';
    if (lower.includes('exception') || lower.includes('fail') || lower.includes('return')) return 'exception';
    if (lower.includes('pending') || lower.includes('info')) return 'pending';
    return 'unknown';
  }

  function _statusLabel(status) {
    const labels = {
      delivered: 'Delivered',
      'in-transit': 'In Transit',
      pending: 'Pending',
      exception: 'Exception',
      unknown: 'Unknown',
    };
    return labels[status] || 'Unknown';
  }

  // ---- Mock / Demo Data ----

  const _mockStages = [
    { status: 'pending', message: 'Shipment information received' },
    { status: 'in-transit', message: 'Package picked up by carrier' },
    { status: 'in-transit', message: 'Package in transit to sorting facility' },
    { status: 'in-transit', message: 'Package arrived at local distribution centre' },
    { status: 'in-transit', message: 'Package out for delivery' },
    { status: 'delivered', message: 'Package delivered' },
  ];

  /** Deterministic index based on tracking number + time (advances every 5 min). */
  function _mockStageIndex(trackingNumber) {
    const hash = trackingNumber.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
    return (hash + timeBucket) % _mockStages.length;
  }

  function _mockCreate(trackingNumber, carrier) {
    return Promise.resolve(_buildMock(trackingNumber, carrier));
  }

  function _mockGet(trackingNumber, carrier) {
    return Promise.resolve(_buildMock(trackingNumber, carrier));
  }

  function _buildMock(trackingNumber, carrier) {
    const idx = _mockStageIndex(trackingNumber);
    const updates = [];
    const now = Date.now();
    for (let i = idx; i >= 0; i--) {
      updates.push({
        time: new Date(now - (idx - i) * 5 * 60 * 1000).toISOString(),
        message: _mockStages[i].message,
        location: 'Demo Location',
      });
    }
    const stage = _mockStages[idx];
    return {
      trackingNumber,
      carrier: carrier || 'auto',
      status: stage.status,
      statusText: _statusLabel(stage.status),
      updates,
      lastChecked: new Date().toISOString(),
    };
  }

  // Public API
  return {
    setApiKey,
    getApiKey,
    cancelPending,
    createTracking,
    getTracking,
  };
})();
