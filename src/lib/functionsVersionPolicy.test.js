import { describe, expect, it } from 'vitest';
import { resolveFunctionsVersionPolicy } from './functionsVersionPolicy';

describe('functions version policy', () => {
	it('removes a stale persisted version on the canonical production host', () => {
		expect(resolveFunctionsVersionPolicy({
			hostname: 'cambra.global',
			storedValue: 'old-function-version',
		})).toEqual({ value: null, clearStored: true, persistValue: null });
	});

	it('honors an explicit one-page production version without persisting it', () => {
		expect(resolveFunctionsVersionPolicy({
			hostname: 'www.cambra.global',
			queryValue: 'requested-version',
			storedValue: 'old-function-version',
		})).toEqual({ value: 'requested-version', clearStored: true, persistValue: null });
	});

	it('keeps Base44 preview version pins working', () => {
		expect(resolveFunctionsVersionPolicy({
			hostname: 'cambra-global-d7ac1fab.base44.app',
			queryValue: 'preview-version',
			storedValue: 'older-preview-version',
		})).toEqual({ value: 'preview-version', clearStored: false, persistValue: 'preview-version' });
	});

	it('falls back to a stored version outside the canonical production host', () => {
		expect(resolveFunctionsVersionPolicy({
			hostname: 'localhost',
			storedValue: 'local-preview-version',
		})).toEqual({ value: 'local-preview-version', clearStored: false, persistValue: null });
	});
});
