/**
 * Shaktris Game Server — thin entrypoint.
 *
 * Everything game-related lives in `server/`.  This file only:
 *
 *   • loads environment variables,
 *   • bootstraps the world + sockets + Express app via `server/bootstrap.js`,
 *   • binds the HTTP server to the configured port.
 *
 * `npm run dev` and the deploy script both invoke this file.
 */

require('dotenv').config();

const { bootstrap } = require('./server/bootstrap');

// Accept PORT=0 explicitly (OS picks ephemeral port — used by integration
// tests). Only fall back to the default when the env var is genuinely unset
// or unparseable.
const parsedPort = process.env.PORT == null || process.env.PORT === ''
	? null
	: Number(process.env.PORT);
const PORT = Number.isFinite(parsedPort) ? parsedPort : 3022;
const PROJECT_ROOT = __dirname;

const { server } = bootstrap({ projectRoot: PROJECT_ROOT });

server.listen(PORT, () => {
	const address = server.address();
	const actualPort = address && address.port ? address.port : PORT;
	console.log(`Shaktris server running on port ${actualPort}`);
	console.log(`- Game:    http://localhost:${actualPort}/`);
	console.log(`- 2D Mode: http://localhost:${actualPort}/2d`);
	console.log(`- API:     http://localhost:${actualPort}/api`);
});

module.exports = { server };
