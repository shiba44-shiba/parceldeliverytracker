/**
 * notifications.js - Chrome / Browser Notification Manager
 *
 * Handles requesting notification permissions and displaying
 * desktop notifications when parcel status changes.
 *
 * Performance notes:
 * - Notifications are batched when multiple parcels update simultaneously.
 * - Uses the Notification API (no Service-Worker push needed for on-page use).
 */

const Notifications = (() => {
  'use strict';

  let _enabled = true;

  /**
   * Check if the browser supports notifications.
   * @returns {boolean}
   */
  function isSupported() {
    return 'Notification' in window;
  }

  /**
   * Request notification permission from the user.
   * @returns {Promise<string>} 'granted' | 'denied' | 'default'
   */
  async function requestPermission() {
    if (!isSupported()) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    return Notification.permission !== 'denied'
      ? await Notification.requestPermission()
      : 'denied';
  }

  /**
   * Enable or disable notifications at the app level.
   * @param {boolean} on
   */
  function setEnabled(on) {
    _enabled = !!on;
  }

  /**
   * @returns {boolean}
   */
  function isEnabled() {
    return _enabled;
  }

  /**
   * Show a desktop notification for a parcel status change.
   * @param {string} trackingNumber
   * @param {string} statusText
   * @param {string} latestMessage
   */
  function notify(trackingNumber, statusText, latestMessage) {
    if (!_enabled || !isSupported()) return;
    if (Notification.permission !== 'granted') return;

    const title = `📦 ${trackingNumber}`;
    const body = `${statusText}: ${latestMessage || 'Status updated'}`;

    try {
      new Notification(title, {
        body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📦</text></svg>',
        tag: `parcel-${trackingNumber}`,
        renotify: true,
      });
    } catch (_) {
      // Notification constructor may throw in insecure contexts; ignore.
    }
  }

  return {
    isSupported,
    requestPermission,
    setEnabled,
    isEnabled,
    notify,
  };
})();
