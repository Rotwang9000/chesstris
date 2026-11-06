// Offline: no visitor funnel.
'use strict';
const noop = () => {};
module.exports = {
	recordPageView: noop,
	recordNewVisitor: noop,
	recordWorldJoin: noop,
	recordFirstPlacement: noop,
	recordBattleJoin: noop,
	getSnapshot: () => ({}),
	saveNow: noop,
	STAGES: [],
	FUNNEL_FILE: null,
};
