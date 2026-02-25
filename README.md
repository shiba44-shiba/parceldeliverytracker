# 📦 Parcel Delivery Tracker

A lightweight, browser-based parcel tracking web application that monitors your shipments and notifies you instantly when there is a status update — via **Chrome desktop notifications** and **email alerts**.

> **No installation required.** Open `index.html` in Chrome (or any modern browser) and start tracking.

---

## Table of Contents

1. [Features](#features)
2. [Quick Start](#quick-start)
3. [How It Works](#how-it-works)
4. [Detailed Usage Guide](#detailed-usage-guide)
   - [Adding a Parcel](#1-adding-a-parcel)
   - [Viewing Tracking Updates](#2-viewing-tracking-updates)
   - [Refreshing Status](#3-refreshing-status)
   - [Removing a Parcel](#4-removing-a-parcel)
   - [Setting Up Email Notifications](#5-setting-up-email-notifications)
   - [Enabling Chrome Notifications](#6-enabling-chrome-notifications)
   - [Connecting a Real Tracking API](#7-connecting-a-real-tracking-api)
5. [Supported Carriers](#supported-carriers)
6. [API Integration](#api-integration)
7. [Performance & Optimisation](#performance--optimisation)
8. [Project Structure](#project-structure)
9. [Deploying to the Web](#deploying-to-the-web)
10. [Frequently Asked Questions](#frequently-asked-questions)
11. [Troubleshooting](#troubleshooting)
12. [Contributing](#contributing)
13. [License](#license)

---

## Features

| Feature | Description |
|---|---|
| **Track any parcel** | Enter a tracking number and (optionally) select the carrier. |
| **Auto-refresh** | Status is polled automatically every **5 minutes**. |
| **Chrome notifications** | Receive a desktop notification the moment a status change is detected. |
| **Email alerts** | Get an email when your parcel's status changes — you choose the address. |
| **Multi-carrier support** | Works with USPS, UPS, FedEx, DHL, Royal Mail, Australia Post, Canada Post, China Post, and more. |
| **API-powered** | Integrates with the [TrackingMore](https://www.trackingmore.com/) API for real tracking data. |
| **Demo mode** | Works out of the box with simulated data — no API key required to explore the UI. |
| **Offline capable** | Service Worker caches the app shell so it loads even without internet. |
| **CPU/GPU optimised** | Animations use GPU-composited properties (`transform`, `opacity`); DOM updates are batched via `requestAnimationFrame`. |
| **Simple UI** | Clean, responsive design that works on desktop and mobile Chrome. |
| **Zero dependencies** | Pure HTML, CSS and vanilla JavaScript — no frameworks, no build step. |

---

## Quick Start

### Option A – Open the file directly

1. **Download or clone** this repository:
   ```bash
   git clone https://github.com/shiba44-shiba/parceldeliverytracker.git
   ```
2. Open `index.html` in **Google Chrome** (or any modern browser).
3. Start tracking!

### Option B – Serve locally (recommended for full PWA features)

```bash
# If you have Node.js installed:
cd parceldeliverytracker
npx serve . -p 3000

# Then open http://localhost:3000 in Chrome.
```

> **Why serve locally?** Service Workers and some notification features require an `http://` or `https://` origin — they will not work over `file://`.

### Option C – Deploy to the web

Upload the entire folder to any static hosting provider (GitHub Pages, Netlify, Vercel, Cloudflare Pages). See [Deploying to the Web](#deploying-to-the-web) for step-by-step guides.

---

## How It Works

```
┌──────────────────────────────────────────────────┐
│                   Browser (Chrome)                │
│                                                   │
│  ┌────────┐   ┌────────────┐   ┌──────────────┐  │
│  │  UI    │──▶│  app.js    │──▶│  tracker.js  │──┼──▶ TrackingMore API
│  │(HTML/  │   │ (orchestr- │   │  (API calls) │  │    (or demo data)
│  │ CSS)   │◀──│  ation)    │◀──│              │  │
│  └────────┘   └─────┬──────┘   └──────────────┘  │
│                     │                             │
│            ┌────────┴────────┐                    │
│            ▼                 ▼                    │
│   ┌─────────────┐   ┌────────────┐               │
│   │notifications│   │  email.js  │               │
│   │   .js       │   │ (mailto:)  │               │
│   │ (desktop)   │   └────────────┘               │
│   └─────────────┘                                │
│                                                   │
│   ┌─────────────┐                                │
│   │   sw.js     │  ← Service Worker (offline)    │
│   └─────────────┘                                │
└──────────────────────────────────────────────────┘
```

1. **You enter a tracking number** in the input field and click **Track Parcel**.
2. `app.js` calls `tracker.js`, which contacts the TrackingMore API (or returns demo data if no API key is set).
3. The result is stored in `localStorage` and rendered in the parcel list.
4. Every **5 minutes**, `app.js` polls all non-delivered parcels for updates.
5. If a status change or new checkpoint is detected:
   - A **Chrome desktop notification** pops up (if enabled).
   - An **email draft** opens in your default mail client (if enabled).
6. The **Service Worker** (`sw.js`) caches static assets so the app loads offline.

---

## Detailed Usage Guide

### 1. Adding a Parcel

1. Locate the **"Add Tracking Number"** section.
2. Type or paste your tracking number into the text field.
3. *(Optional)* Select the carrier from the dropdown. Choose **"Auto-detect carrier"** if you are unsure.
4. Click **Track Parcel** (or press **Enter**).
5. The parcel appears at the top of the **Tracked Parcels** list.

> 💡 **Tip:** You can add as many parcels as you like. They are saved in your browser's local storage and persist across page reloads.

### 2. Viewing Tracking Updates

Each tracked parcel card shows:

- **Tracking number** and **carrier** name.
- A colour-coded **status badge**: 🟢 Delivered · 🔵 In Transit · 🟡 Pending · 🔴 Exception · ⚪ Unknown.
- **"Show updates"** — click to expand the full checkpoint history.
- **"Last checked"** timestamp.

### 3. Refreshing Status

- **Automatic:** The app checks every 5 minutes in the background while the page is open.
- **Manual (all):** Click the **🔄 Refresh All** button at the top of the parcel list.
- **Manual (single):** Click the **🔄 Refresh** button on an individual parcel card.

### 4. Removing a Parcel

Click the **✕ Remove** button on a parcel card. The parcel is immediately deleted from local storage.

### 5. Setting Up Email Notifications

1. In the **Notification Settings** section, enter the email address where you want to receive alerts.
2. Click **Save Email**.
3. Make sure the **"Enable email notifications"** checkbox is ticked.

When a parcel's status changes, the app will open a pre-filled email draft in your default mail application (e.g. Gmail, Outlook). Simply click **Send**.

> **Note:** The app uses a `mailto:` link, which works universally without any API keys or third-party accounts. If you want fully automated server-side emails, you can extend `email.js` to use a service like [EmailJS](https://www.emailjs.com/).

### 6. Enabling Chrome Notifications

1. Make sure the **"Enable Chrome notifications"** checkbox is ticked.
2. The first time a parcel update occurs (or when you toggle the checkbox on), Chrome will ask for permission — click **Allow**.
3. You will now see desktop notifications when:
   - A parcel's status changes (e.g. from *Pending* → *In Transit*).
   - A new tracking checkpoint is added.

> **Requirements:**
> - The page must be open in a browser tab (or the app must be served over `http://` / `https://`).
> - Notifications must be allowed in Chrome's site settings.

### 7. Connecting a Real Tracking API

By default the app runs in **demo mode**, displaying simulated tracking data so you can explore all the features. To get **real** tracking data:

1. Create a free account at [TrackingMore](https://www.trackingmore.com/).
2. Go to your dashboard and copy your **API Key**.
3. In the app's **Notification Settings** section, paste the key into the **"Tracking API Key"** field.
4. Click **Save Key**.
5. All subsequent tracking lookups will use the real API.

> **Free tier:** TrackingMore offers a free plan with a generous number of monthly tracking queries.

---

## Supported Carriers

When using the TrackingMore API, the app supports **1,200+ carriers worldwide**. The dropdown includes the most popular ones:

| Carrier | Slug |
|---|---|
| USPS | `usps` |
| UPS | `ups` |
| FedEx | `fedex` |
| DHL | `dhl` |
| Royal Mail | `royal-mail` |
| Australia Post | `australia-post` |
| Canada Post | `canada-post` |
| Yanwen | `yanwen` |
| China Post | `china-post` |
| China EMS | `china-ems` |

Select **Auto-detect carrier** and the API will attempt to identify the carrier from the tracking number format.

---

## API Integration

The app is designed to work with the **[TrackingMore API v4](https://www.trackingmore.com/docs/trackingmore/d1fedfc13afbf-api-overview)**.

### Endpoints Used

| Action | Method | Endpoint |
|---|---|---|
| Create a tracking | `POST` | `/v4/trackings/create` |
| Get tracking info | `POST` | `/v4/trackings/get` |

### Request Headers

```
Content-Type: application/json
Tracking-Api-Key: YOUR_API_KEY
```

### Extending to Other APIs

`js/tracker.js` is modular. You can replace the API calls with any tracking provider (AfterShip, Ship24, EasyPost, etc.) by editing the `createTracking` and `getTracking` functions. The app only expects the normalised shape returned by the `_normalise()` function:

```js
{
  trackingNumber: 'ABC123',
  carrier: 'usps',
  status: 'in-transit',        // delivered | in-transit | pending | exception | unknown
  statusText: 'In Transit',
  updates: [
    { time: '2025-01-15T10:30:00Z', message: 'Arrived at facility', location: 'New York, NY' }
  ],
  lastChecked: '2025-01-15T12:00:00Z'
}
```

---

## Performance & Optimisation

The app is built with performance in mind:

### CPU Optimisation
- **No frameworks / build tools** — zero overhead from virtual DOMs or bundlers.
- **Batched DOM updates** — all rendering is done via `documentFragment` in a single reflow.
- **`requestAnimationFrame`** — DOM writes are scheduled to align with the browser's paint cycle.
- **Event delegation** — parcel action buttons share a single event listener on the container.
- **Minimal polling** — only non-delivered parcels are re-checked; delivered parcels are skipped.
- **`AbortController`** — stale API requests are cancelled before starting new ones.

### GPU Optimisation
- **Composited animations** — all animations use `transform` and `opacity` only (GPU-accelerated, no layout/paint).
- **`will-change` hints** — applied sparingly to animated elements to allow the browser to promote them to their own compositing layer.
- **`contain: layout`** — on card elements, tells the browser their layout is independent, reducing recalculation scope.
- **No box-shadow animations** — static shadows only; animated shadows cause expensive repaints.

### Network
- **Service Worker** caches the app shell for instant repeat loads and offline use.
- **Network-first strategy** ensures you always get the latest data when online, with cache fallback.

### Memory
- **No global leaks** — all modules use the revealing module pattern (IIFE).
- **Event listeners** are attached once and use delegation.
- **localStorage** is read once at boot; writes happen only on state change.

---

## Project Structure

```
parceldeliverytracker/
├── index.html          # Main HTML page
├── manifest.json       # PWA web app manifest
├── sw.js               # Service Worker for offline caching
├── package.json        # npm metadata (for local dev server)
├── .gitignore          # Git ignore rules
├── README.md           # This file
├── css/
│   └── styles.css      # All styles (responsive, GPU-optimised)
└── js/
    ├── app.js          # Main orchestration, polling, rendering
    ├── tracker.js      # Tracking API integration + demo data
    ├── notifications.js# Chrome desktop notifications
    └── email.js        # Email notification (mailto:)
```

---

## Deploying to the Web

### GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Source**, select the branch (e.g. `main`) and folder (`/ (root)`).
4. Click **Save**. Your app will be live at `https://<username>.github.io/parceldeliverytracker/`.

### Netlify

1. Go to [netlify.com](https://www.netlify.com/) and sign in.
2. Click **Add new site → Import an existing project**.
3. Connect your GitHub repo.
4. Set the publish directory to `/` (root).
5. Click **Deploy**. Done!

### Vercel

1. Go to [vercel.com](https://vercel.com/) and sign in.
2. Click **New Project → Import Git Repository**.
3. Select the repo. Vercel will auto-detect it as a static site.
4. Click **Deploy**.

### Any Static Host

Upload the entire project folder to any web server or static hosting service. No build step is needed.

---

## Frequently Asked Questions

### Do I need an API key to use the app?
**No.** Without an API key the app runs in **demo mode** with simulated tracking data. This lets you explore all the features. To track real parcels, add a free [TrackingMore](https://www.trackingmore.com/) API key in the settings.

### Does the app work offline?
**Partially.** The Service Worker caches the app interface so it loads without internet. However, fetching new tracking data requires a network connection.

### Will I get notifications if the browser tab is closed?
**No.** The Chrome Notification API requires the page to be open in a tab. For background push notifications, you would need a server-side component (not included in this lightweight version).

### Is my data stored on a server?
**No.** All data (tracked parcels, settings, email address) is stored locally in your browser's `localStorage`. Nothing is sent to any server except the tracking API requests.

### Can I use this on my phone?
**Yes.** The UI is responsive and works on mobile browsers. On Android Chrome you can even **"Add to Home Screen"** to use it like a native app (PWA).

### How do I change the polling interval?
Open `js/app.js` and change the `POLL_INTERVAL` constant (value is in milliseconds). The default is `300000` (5 minutes).

### Can I use a different tracking API?
**Yes.** See the [API Integration](#api-integration) section. The `tracker.js` module is designed to be swapped out easily.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| **Notifications not appearing** | Make sure you clicked "Allow" when Chrome asked for permission. Check `chrome://settings/content/notifications` to verify the site is allowed. |
| **"API error" when adding a parcel** | Double-check your TrackingMore API key. Ensure the tracking number and carrier are correct. |
| **Email not opening** | The app uses a `mailto:` link. Make sure you have a default email client configured in your OS. |
| **App not loading offline** | Service Workers require `http://` or `https://`. Open the app via `npx serve` or deploy to a web host. |
| **Parcel stuck on "Pending"** | Some carriers take time to scan packages. Try refreshing manually or verify the tracking number on the carrier's website. |
| **Demo data keeps changing** | This is expected. Demo mode cycles through simulated statuses every 5 minutes to demonstrate the notification flow. |

---

## Contributing

Contributions are welcome! To get started:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Make your changes.
4. Test locally by opening `index.html` or running `npx serve .`.
5. Commit and push: `git push origin feature/my-feature`.
6. Open a Pull Request.

Please keep the zero-dependency philosophy — avoid adding frameworks or build tools unless absolutely necessary.

---

## License

This project is released under the [MIT License](https://opensource.org/licenses/MIT). Feel free to use, modify, and distribute it.