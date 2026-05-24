# Longships, sail adverts, and viking knights

> Status: **boats live; viking-knight ride documented + scaffolded.**
> Last updated: May 2026.

The user asked us to step back from the per-cell sponsorship mechanic
(it was visually noisy and complicated for first-time players) and
move advertising onto something simpler and thematic: **Viking
longships drifting around the islands**, with adverts displayed on
their sails. The longships are also intended to become a travel
mechanic for knights ("go viking") in a follow-up change. This doc
captures the moving parts so the next person to pick it up has a
clear roadmap.

---

## Server

### `server/world/boats.js` — `createBoatManager`

```js
const { createBoatManager } = require('./world/boats');
const advertisers = require('../routes/advertisers');

const boatManager = createBoatManager({
    io,
    pickAdvertiser: advertisers.pickAdvertiserForBoat,
    persistence,
});

boatManager.start();
```

- Spawns `BOAT_COUNT` (6) longships once on `start()`.
- Each boat orbits the world at `BOAT_LOOP_RADIUS` (≈28 units) with a
  per-boat radius/phase jitter so they don't queue up in a single
  line.
- A 200 ms tick advances positions; a 500 ms broadcast emits
  `boats_update` to every connected socket.
- Every ~90 s each boat asks `pickAdvertiserForBoat` for a fresh
  banner so the same boat doesn't carry the same ad indefinitely.
- New clients can request the current snapshot with the
  `get_boats` socket event (`cb({ boats, ts })`).

### `routes/advertisers.js` — `pickAdvertiserForBoat()`

A small wrapper round the existing `bidRanking` array. Returns a
sanitised advertiser blob
(`{ id, name, adImage, adLink, adText, placeholder }`); if no paid
advertisers are active it falls back to a frozen
`PLACEHOLDER_SAIL_AD` (`{ id: 'sail-placeholder', name: 'Your Ad
Here', adLink: '/advertise', placeholder: true, … }`) so every
boat always has *something* to show and the user can click through
to the sign-up form. Boats keep their own rotation index so they
don't fight the `/api/advertisers/next` endpoint for slot order.

### Boat data shape (over the wire)

```js
{
    id: 'boat-3-x9q4',
    kind: 'longship',
    position: { x, y, z },     // world-space
    heading: Number,            // radians, where 0 = +Z
    passengers: [],             // see "viking knights" below
    advertiser: {               // null if no advertisers configured
        id: 'adv-1',
        name: 'Mead Hall',
        adImage: '/uploads/abc.png',
        adLink: 'https://example.com',
        adText: 'Drink deep!',
    },
}
```

---

## Client

### `public/js/boatsRenderer.js`

- `initBoatGroup()` lazily creates a single `THREE.Group` named
  `boatFleet` once the scene exists.
- `syncBoats(boats)` is called from the network event handler in
  `enhanced-gameCore/networkEvents.js` whenever a `boats_update`
  arrives. It diff-and-reconciles the visible fleet against the
  server snapshot: builds a Viking longship mesh for any new
  boats, removes vanished ones, updates target positions on
  existing ones for interpolation.
- `animateBoats(timeSec)` runs from the main game loop; it bobs
  each boat on the swell, interpolates from prev → target across
  ~600 ms, and applies the latest heading.

Each longship is built from primitives (hull box + two prow/stern
cones, mast + spar cylinders, double-sided sail plane, six
coloured shield decals along each side).

### Sail texturing

Every sail is drawn onto a 360 × 280 canvas:

1. A red/white viking stripe pattern as the background.
2. The advertiser's image composited on top (if any), centred and
   scaled to fit in the upper ~68 % of the sail.
3. A dark banner across the bottom 32 % with the advertiser's
   name (cropped to 22 chars). Placeholder boats use a yellow
   accent so the call-to-action stands out.

Each composited texture is cached by
`${advertiser.id}::${advertiser.adImage || ''}` so the same
advertiser appearing on multiple boats decodes the image once.
Image loading is async — the canvas is shown immediately with the
stripes + brand banner, then the image gets blitted in on top
once it loads and the texture is flagged `needsUpdate`.

### Boats are clickable

`tryBoatClick(mouse)` (also exported from `boatsRenderer.js`)
raycasts against the `boatFleet` group and returns
`{ advertiser, boatId }` for the boat under the cursor. The
top-level click handler in `public/js/inputManager.js` calls it
before doing any chess raycasting, so a click on a passing
longship always wins over a same-frame chess interaction:

- paid ad → `window.open(advertiser.adLink, '_blank')`
- placeholder → opens `/advertise` so the user can buy a sail

Click handling is intentionally phase-independent: boats are
clickable in both tetris and chess phases.

### Network bridge

`'boats_update'` is in the `SIMPLE_FORWARD_EVENTS` array in
`public/js/utils/network/socketEventBridge.js`, so the
NetworkManager passes the event straight through to subscribers
without any custom routing.

---

## Viking knights (planned)

The user's request was: *"make them a bit viking as I have an idea
that perhaps we can let knights become viking and travel on these
boats."*

The plumbing is partially in place — every boat already carries
`passengers: []` over the wire and the manager exposes
`addPassenger(boatId, payload)` / `removePassenger(boatId, predicate)`.
The remaining work for a first cut:

1. **Eligibility check** in the chess-move validator: a knight
   on a cell adjacent to a boat's "dock waypoint" can issue a
   `chess_move` whose destination is the boat itself (encoded as
   `{ boardX: -1, boardZ: -1, boatId: '…' }` or similar — pick a
   sentinel that the validator routes off-board).
2. **Server**: when the move is accepted, remove the knight from
   `world.chessPieces`, push a `{ pieceId, type, player, type: 'knight' }`
   payload to `boatManager.addPassenger`, and emit a new
   `knight_embarked` event so other clients can play the boarding
   animation.
3. **Server**: every time a boat reaches a dock waypoint, surface a
   `knight_disembark_offered` event to the passenger's owner. They
   can choose a target island cell within a small radius; if they
   pick one, the knight is removed from `boat.passengers` and
   re-added to `world.chessPieces` at the chosen position.
4. **Client**: render the passenger as a tiny knight figure
   straddling the mast. Toast + small UI when an embark/disembark
   offer is open.

Until that lands, boats are *passive set-dressing* — no boarding
flow, no passengers, no ad-revenue mechanic beyond impression
counting that the existing `routes/advertisers.js` already does.

### Why knights specifically?

- Already the only piece allowed to leap in classic chess; "vikings
  who jump from longship to shore" maps naturally onto that.
- Also the only piece that survives island-decay (see
  `players-bible.md` §10 "Knight exception"), so leaving a knight
  stranded waiting for a boat is in keeping with the rest of the
  rules.

---

## Tests

- `tests/server/boats.test.js` covers spawn count, orbit radius,
  movement between ticks, and the passenger add/remove round-trip.

## See also

- `server/world/boats.js`
- `public/js/boatsRenderer.js`
- `public/js/utils/network/socketEventBridge.js` (event list)
- `docs/players-bible.md` §15 "Special Rules / Edge Cases" — knight
  survival rule + longship fleet bullet
