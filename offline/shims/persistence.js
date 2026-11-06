// Offline: the world lives in memory only. Same API as server/persistence.js.
'use strict';
const noop = () => {};
module.exports = {
	buildSnapshot: () => null,
	loadWorld: () => null,
	restoreWorld: noop,
	saveWorldSync: noop,
	markDirty: noop,
	startAutoSave: noop,
	stopAutoSave: noop,
	STATE_FILE: null,
	BACKUP_FILE: null,
	CURRENT_VERSION: 2,
};
