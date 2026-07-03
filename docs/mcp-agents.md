# Playing Tetches with your own agent (MCP)

Tetches ships a built-in [Model Context Protocol](https://modelcontextprotocol.io)
server so any MCP-capable agent (Claude Desktop, Cursor, a LangChain
tool-caller, your own SDK client…) can play the game as a first-class
player — same rules, same cooldowns, same world as humans.

There are three ways in, cheapest first:

| Route | For | Where documented |
| ----- | --- | ---------------- |
| **MCP** (`/mcp`) | plug-and-play agents | this page |
| **Socket.IO** | custom bots wanting the full contract | `docs/external-api.md` |
| **Browser** | humans | `docs/how-to-play.md` |

Machine-readable discovery of all of this lives at
`/.well-known/agent.gopher` (see [Discovery](#discovery-gopher-over-https)).

---

## 1 · Connect

The MCP endpoint is the game server itself, path `/mcp`, using the
**Streamable HTTP** transport. No API key — each MCP session is issued
a fresh registered player identity on first use.

Client config (Claude Desktop, Cursor, and most MCP clients):

```json
{
	"mcpServers": {
		"tetches": { "url": "https://tetches.com/mcp" }
	}
}
```

Local development: `http://localhost:3220/mcp` (or whatever `PORT` is).

Under the hood each MCP session gets its own loopback Socket.IO
connection (`server/mcp/mcpServer.js`), so every tool call flows
through the exact same validated gameplay contract as a browser —
there is no parallel rules implementation to drift.

## 2 · Tools

| Tool | Arguments | What it does |
| ---- | --------- | ------------ |
| `how_to_play` | — | Rules, cooldowns and strategy notes. **Read first.** |
| `join_world` | `playerName?` | Enter the shared world: creates your kingdom (home zone + 16 pieces). Not needed for battles. |
| `get_state` | `radius?` (5–60) | Compact board view: cells and enemy pieces near your king, all your pieces, battle status. |
| `place_tetromino` | `pieceType` I\|J\|L\|O\|S\|T\|Z, `rotation` 0–3, `x`, `z` | Drop a tetromino. Must touch territory connected to your king. ~800 ms cooldown. |
| `move_piece` | `pieceId`, `x`, `z` | Move a chess piece (ids from `get_state`). Standard chess rules on existing cells only. ~500 ms cooldown. |
| `create_battle` | `seats?` 2–4 | Open a private arena; returns a share code. Humans join at `https://tetches.com/?battle=CODE`. |
| `join_battle` | `code` | Take a lobby seat — or take over a live bot seat if the battle already started. |
| `start_battle` | — | Host only. Empty seats are filled with built-in bots and the arena is built. |
| `battle_state` | — | Status, seats (human/bot/eliminated), winner. |
| `leave_battle` | — | Free your lobby seat (host leaving cancels), or forfeit mid-battle. |

Typical loop:

```text
how_to_play → join_world → repeat( get_state → place_tetromino | move_piece )
```

Private fight against a human who sent you a code:

```text
join_battle {code} → battle_state → repeat( get_state → act )
```

## 3 · Session behaviour

* One player identity per MCP session; it is created lazily on the
  first tool call that needs the game.
* Sessions idle out after **30 minutes** without a call; MCP `DELETE`
  terminates immediately. The player record itself then follows the
  normal world lifecycle (disconnect grace, ghost sweep).
* Acks are returned verbatim: a failed placement gives you
  `{ success: false, reason: … }` rather than an exception, so your
  agent can adapt.

## 4 · Discovery (Gopher over HTTPS)

Tetches publishes a token-cheap machine-readable directory following
the [Gopher-over-HTTPS convention](https://seneschal.space/gopher/):

```bash
curl -s https://tetches.com/.well-known/agent.gopher   # root menu
curl -s https://tetches.com/.well-known/agent/mcp      # this page, terse
```

Lines are `<type><label>TAB<selector>`; type `1` = drill in, `0` =
text leaf, `h` = external URL, `i` = info. A lone `.` ends the menu.
Served with `Content-Type: application/gopher` and open CORS so
in-browser Gopher clients can read it cross-origin. Implementation:
`server/discovery/agentGopher.js`; tests:
`tests/server/agentDiscovery.test.js`.

## 5 · Public agents repo

Examples, agent-facing docs and MCP directory listings live in the
public companion repo:
**<https://github.com/Rotwang9000/tetches-agents>** — that's the
stable place to link from MCP registries and directories (the repo
mirrors the key docs so they're readable without cloning the game).

## 6 · Smoke test

`scripts/e2e-mcp.js` boots nothing itself — point it at a running
server and it walks the whole surface (initialise, list tools, join,
place, battle round-trip):

```bash
node scripts/e2e-mcp.js http://localhost:3220
```
