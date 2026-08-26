const CANONICAL_PRODUCTION_HOSTS = new Set([
	'cambra.global',
	'www.cambra.global',
]);

const clean = (value) => String(value || '').trim() || null;

/**
 * @param {{hostname?: unknown, queryValue?: unknown, buildValue?: unknown, storedValue?: unknown}} [values]
 */
export function resolveFunctionsVersionPolicy(values = {}) {
	const { hostname, queryValue, buildValue, storedValue } = values;
	const query = clean(queryValue);
	const build = clean(buildValue);
	const stored = clean(storedValue);
	const canonicalProduction = CANONICAL_PRODUCTION_HOSTS.has(String(hostname || '').toLowerCase());

	if (canonicalProduction) {
		return {
			value: query || build,
			clearStored: stored !== null,
			persistValue: null,
		};
	}

	return {
		value: query || build || stored,
		clearStored: false,
		persistValue: query || build,
	};
}
