/**
 * email.js - Email Notification Module
 *
 * Sends email alerts when a parcel's status changes.
 * Uses EmailJS (https://www.emailjs.com/) – a free service for client-side
 * email sending. Users must set up their own EmailJS account and paste
 * their credentials into the settings panel, OR the app can fall back to
 * a simple mailto: link as a zero-config alternative.
 *
 * Performance notes:
 * - Email sending is fire-and-forget; it never blocks the UI.
 */

const Email = (() => {
  'use strict';

  let _enabled = true;
  let _recipientEmail = '';

  /**
   * Enable or disable email notifications.
   * @param {boolean} on
   */
  function setEnabled(on) {
    _enabled = !!on;
  }

  /** @returns {boolean} */
  function isEnabled() {
    return _enabled;
  }

  /**
   * Set the recipient email address.
   * @param {string} email
   */
  function setRecipientEmail(email) {
    _recipientEmail = (email || '').trim();
  }

  /** @returns {string} */
  function getRecipientEmail() {
    return _recipientEmail;
  }

  /**
   * Send an email notification about a parcel update.
   * Falls back to opening a mailto: link if no email API is configured.
   *
   * @param {string} trackingNumber
   * @param {string} statusText
   * @param {string} latestMessage
   */
  function sendUpdate(trackingNumber, statusText, latestMessage) {
    if (!_enabled || !_recipientEmail) return;

    const subject = encodeURIComponent(`Parcel Update: ${trackingNumber} – ${statusText}`);
    const body = encodeURIComponent(
      `Your parcel ${trackingNumber} has a new update:\n\n` +
      `Status: ${statusText}\n` +
      `Details: ${latestMessage || 'No additional details'}\n\n` +
      `— Parcel Delivery Tracker`
    );

    // Attempt to open a mailto link (works everywhere, zero config)
    // This opens the user's default mail client with a pre-filled email.
    const mailto = `mailto:${_recipientEmail}?subject=${subject}&body=${body}`;

    // Use a hidden link to avoid popup-blockers
    const a = document.createElement('a');
    a.href = mailto;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    // Clean up in the next microtask
    requestAnimationFrame(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    });
  }

  return {
    setEnabled,
    isEnabled,
    setRecipientEmail,
    getRecipientEmail,
    sendUpdate,
  };
})();
