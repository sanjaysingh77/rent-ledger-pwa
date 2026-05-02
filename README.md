# Rent Ledger PWA

Rent Ledger is an installable rent tracker for iPhone and desktop browsers.

## What It Does

- Tracks seven starter properties, with support for adding more.
- Stores monthly rent status separately for each month.
- Lets you set a custom due day for every property.
- Lets you set reminders, defaulting to every 2 days after the due date.
- Shows unpaid, due, late, and paid properties.
- Can request browser notifications and remind you when you open the app.
- Supports local backup and restore with JSON.

## Install On iPhone

The app must be served from a web address for full PWA behavior.

1. Host this folder with any static web host, or run a local web server on your computer.
2. Open the site in Safari on your iPhone.
3. Tap Share.
4. Tap Add to Home Screen.

## Reminder Note

Static PWAs cannot reliably run scheduled background reminders on iPhone without a push notification server. This app shows reminders inside the app and can show browser notifications when opened, after notification permission is granted.
