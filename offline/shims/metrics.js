// Offline: no Prometheus.
'use strict';
const noop = () => {};
module.exports = {
	register: null,
	refreshWorldGauges: noop,
	incSocketEvent: noop,
	incApiRequest: noop,
	setSocketCount: noop,
	recordSaveResult: noop,
	renderMetrics: async () => '',
};
