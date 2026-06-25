const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;

// Safe storage wrapper — Safari private mode and some iOS in-app browsers
// throw on localStorage access. Never let storage errors crash auth init.
const safeStorage = {
	getItem(key) {
		try { return windowObj.localStorage.getItem(key); } catch { return null; }
	},
	setItem(key, val) {
		try { windowObj.localStorage.setItem(key, val); } catch { /* ignore */ }
	},
	removeItem(key) {
		try { windowObj.localStorage.removeItem(key); } catch { /* ignore */ }
	},
};

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam) {
		safeStorage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		safeStorage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = safeStorage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

const getAppParams = () => {
	if (getAppParamValue("clear_access_token") === 'true') {
		safeStorage.removeItem('base44_access_token');
		safeStorage.removeItem('token');
	}
	return {
		appId: getAppParamValue("app_id", { defaultValue: import.meta.env.VITE_BASE44_APP_ID }),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: window.location.href }),
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
		appBaseUrl: getAppParamValue("app_base_url", { defaultValue: import.meta.env.VITE_BASE44_APP_BASE_URL }),
	}
}


export const appParams = {
	...getAppParams()
}