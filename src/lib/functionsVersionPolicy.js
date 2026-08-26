const CANONICAL_PRODUCTION_HOSTS = new Set([
	'cambra.global',
	'www.cambra.global',
]);

const clean = (value) => String(value || '').trim() || null;

export function resolveFunctionsVersionPolicy({
	hostname,
	queryValue,
	buildValue,
	storedValue,
} = {}) {
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
