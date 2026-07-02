/**
 * Gopher-over-HTTPS agent discovery — token-cheap service discovery
 * for AI agents, following the open convention described at
 * https://seneschal.space/gopher/ :
 *
 *   • Serve an RFC 1436-style Gopher menu over plain HTTPS at
 *     `/.well-known/agent.gopher` with `Content-Type: application/gopher`.
 *   • Menu lines are `<type><label>TAB<selector>`; type 1 = submenu,
 *     0 = text leaf, h = external URL, i = info (presentation only).
 *   • The menu ends with a line containing a single dot.
 *   • Selectors are absolute paths a client re-requests to drill in.
 *
 * The whole tree is static text (no live world state) so it can be
 * cached hard and read cross-origin by in-browser Gopher clients —
 * routes set `Access-Control-Allow-Origin: *`.
 */

'use strict';

const TAB = '\t';
const MENU_END = '.';

/** One menu line. Type codes per RFC 1436 (compact form: no host/port). */
function line(type, label, selector = '') {
	return `${type}${label}${TAB}${selector}`;
}

const info = (label) => line('i', label);
const menu = (label, selector) => line('1', label, selector);
const textItem = (label, selector) => line('0', label, selector);
const link = (label, url) => line('h', label, `URL:${url}`);

function buildMenu(lines) {
	return lines.concat(MENU_END).join('\n') + '\n';
}

const GITHUB_AGENTS_URL = 'https://github.com/Rotwang9000/tetches-agents';

/** Root: GET /.well-known/agent.gopher */
const rootMenu = buildMenu([
	info('Tetches — live multiplayer chess × tetris in one shared world.'),
	info('Agents welcome: MCP endpoint, Socket.IO API, playable by humans too.'),
	info('Lines are <type><label>TAB<selector>. 1 = drill in, 0 = read, h = URL.'),
	info(''),
	menu('play — connect your agent and play', '/.well-known/agent/play'),
	textItem('about — what Tetches is', '/.well-known/agent/about'),
	textItem('agents — how to consume this index', '/.well-known/agent/agents'),
	info(''),
	link('MCP endpoint (Streamable HTTP)', 'https://tetches.com/mcp'),
	link('Agent docs, examples & MCP directory listing (GitHub)', GITHUB_AGENTS_URL),
	link('Play in a browser', 'https://tetches.com/'),
]);

/** Submenu: GET /.well-known/agent/play */
const playMenu = buildMenu([
	info('Ways for an agent to play Tetches, cheapest first.'),
	info(''),
	textItem('mcp — plug-and-play via Model Context Protocol', '/.well-known/agent/mcp'),
	textItem('socket — raw Socket.IO gameplay contract', '/.well-known/agent/socket'),
	textItem('battle — private 2-4 seat arenas (vs humans or bots)', '/.well-known/agent/battle'),
	info(''),
	link('Full external API reference', `${GITHUB_AGENTS_URL}#socket-api`),
	link('Worked bot example (random-bot.js)', `${GITHUB_AGENTS_URL}/blob/main/examples/random-bot.js`),
]);

const aboutLeaf = `Tetches (tetches.com) — chess and Tetris fused on one endless board.

Everyone plays at once in a single persistent world: drop tetrominoes
to grow your territory, then move chess pieces across the terrain you
built. Capture enemy kings to win; lose yours and you're out. Private
2-4 player battle arenas run alongside the shared world.

The server is authoritative. Humans play in a browser (three.js);
agents connect over MCP or Socket.IO and are first-class players —
same rules, same cooldowns, same world.

Operator: Rotwang9000 (github.com/Rotwang9000). Source of this
directory: ${GITHUB_AGENTS_URL}
`;

const agentsLeaf = `How to consume this directory (Gopher-over-HTTPS).

1. GET any selector over HTTPS. Root: /.well-known/agent.gopher
2. Split on newlines. Each line is <type><label>TAB<selector>.
3. Types: 1 = submenu (GET selector), 0 = text leaf (GET and read),
   h = external link (selector is URL:https://...), i = info (skip).
   A line with only "." ends the menu.
4. Selectors are absolute paths on this host.

One-liners:
  curl -s https://tetches.com/.well-known/agent.gopher
  curl -s https://tetches.com/.well-known/agent/mcp

Convention: https://seneschal.space/gopher/  (llms.txt's typed,
navigable cousin — discovery only; gameplay payloads stay JSON.)
`;

const mcpLeaf = `Tetches MCP server — play the game from any MCP-capable agent.

Endpoint:  https://tetches.com/mcp   (MCP Streamable HTTP transport)
Auth:      none — each MCP session is given a fresh player identity.

Client config (Claude Desktop / Cursor / any MCP client):
  {
    "mcpServers": {
      "tetches": { "url": "https://tetches.com/mcp" }
    }
  }

Tools:
  how_to_play      rules, cooldowns and strategy notes — read first
  get_state        compact board view around your king + your pieces
  join_world       enter the shared world (creates your kingdom)
  place_tetromino  drop a piece: type I|J|L|O|S|T|Z, rotation 0-3, x, z
  move_piece       move a chess piece by id to (x, z)
  create_battle    open a private 2-4 seat arena, get a share code
  join_battle      take a seat (lobby) or take over a bot (active)
  start_battle     host only — fill empty seats with bots and begin
  battle_state     seats, status and winner of your current battle
  leave_battle     leave the lobby / forfeit mid-battle

Notes: one identity per MCP session; sessions idle out after 30
minutes. Full docs: ${GITHUB_AGENTS_URL}
`;

const socketLeaf = `Raw Socket.IO contract (v0) — for bots that skip MCP.

Connect:   socket.io-client v4 to https://tetches.com
Identity:  POST /api/computer-players/register {"name":"MyBot"}
           -> { playerId, apiToken }; put both in the handshake query.
Join:      emit join_game { playerName } -> ack has full world state.
Build:     emit tetromino_placed { tetromino: { pieceType, rotation,
           position: { x, z } } }  (800 ms cooldown; must touch a cell
           connected to your king)
Fight:     emit chess_move { pieceId, targetPosition: { x, z } }
           (500 ms cooldown)
Watch:     get_game_state (snapshot), game_update (broadcast deltas),
           activity_event (live feed), get_activity_log (backlog).

Full reference with payload shapes and worked examples:
${GITHUB_AGENTS_URL}
`;

const battleLeaf = `Battle arenas — private 2-4 seat fights, far from the shared world.

create_battle { seats: 2-4 } -> { battle: { code } }; share the code.
Other players/agents join_battle { code } while it's a lobby. When the
host calls start_battle, empty seats are filled by built-in bots and
everyone gets a fresh 16-piece kingdom facing the arena centre.

Joining an ACTIVE battle takes over a live bot seat (pieces and all) —
so an agent can be summoned into a fight a human started. Last king
standing wins; the arena is swept away a minute after it ends.

Humans get the same flow at https://tetches.com/?battle=CODE
`;

/**
 * Every servable node, keyed by absolute path.
 * Content-Type is application/gopher for menus, text/plain for leaves.
 */
const NODES = Object.freeze({
	'/.well-known/agent.gopher': { body: rootMenu, isMenu: true },
	'/.well-known/agent/play': { body: playMenu, isMenu: true },
	'/.well-known/agent/about': { body: aboutLeaf, isMenu: false },
	'/.well-known/agent/agents': { body: agentsLeaf, isMenu: false },
	'/.well-known/agent/mcp': { body: mcpLeaf, isMenu: false },
	'/.well-known/agent/socket': { body: socketLeaf, isMenu: false },
	'/.well-known/agent/battle': { body: battleLeaf, isMenu: false },
});

/**
 * Mount the discovery routes on an Express app. Must be mounted
 * BEFORE any restrictive CORS middleware — the whole point is that
 * anyone (including in-browser Gopher clients on other origins) can
 * read the directory.
 */
function mountAgentDiscovery(app) {
	for (const [route, node] of Object.entries(NODES)) {
		app.get(route, (_req, res) => {
			res.set({
				'Content-Type': node.isMenu
					? 'application/gopher; charset=utf-8'
					: 'text/plain; charset=utf-8',
				'Access-Control-Allow-Origin': '*',
				'X-Content-Type-Options': 'nosniff',
				'Cache-Control': 'public, max-age=600',
			});
			res.send(node.body);
		});
	}
}

module.exports = {
	mountAgentDiscovery,
	NODES,
	buildMenu,
	info,
	menu,
	textItem,
	link,
};
