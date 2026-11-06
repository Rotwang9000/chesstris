# Offline mode and the phone app

Offline mode runs the whole game on the device: battles against computer
opponents, no server and no network. It's the basis for the Android/iOS app.

## Trying it

- In a browser: `https://tetches.com/?offline=1`. Add `&seaScale=0.2` to run the
  sea 5× faster for testing.
- As a self-contained folder: `npm run build:app` writes `app/www/` (about 4.4 MB),
  which runs from any static file server with no internet.

## How it works

The game's own server code runs in a Web Worker inside the page:

| Piece | File |
|---|---|
| Service wiring, shared by the Node server and the engine | `server/services.js` |
| Worker entry: an empty world, battles only | `offline/engine.js` |
| In-memory stand-in for the socket.io server | `offline/fakeIo.js` |
| Browser versions of Node-only modules (persistence, logging, metrics, Sentry, funnel, HTTP API, crypto, Buffer/process) | `offline/shims/` |
| Engine bundler → `public/dist/offline-engine.js` | `scripts/build-offline.js` |
| socket.io-client lookalike that talks to the worker | `public/js/offline/localSocket.js` |
| The `?offline=1` / `window.__TETCHES_OFFLINE__` switch | `public/js/offline/offlineMode.js` |
| Self-contained app folder: local three.js and font, no socket.io | `scripts/build-app.js` |

The client code is unchanged apart from choosing the local socket. When
offline, the UI does the following:

- The welcome screen offers Battle only.
- The battle menu picks opponents (1–3 bots), difficulty and Quick or Classic,
  then starts the game straight away.
- Ads, accounts, world codes and invite links are hidden (`<html data-offline>`).

The world starts empty on each launch, and nothing is saved yet.

## Next steps

1. **Android app (Capacitor).** This needs JDK 21 and the Android SDK
   command-line tools. Capacitor wraps `app/www/`, and `npx cap add android`
   then builds an APK or AAB.
2. **Google Play.** An organisation developer account avoids the 12-tester
   closed-testing rule.
3. **Polish:**
   - stats or a win streak saved on the device;
   - an app icon and splash screen;
   - pass-and-play;
   - pausing the engine when the app goes to the background.
