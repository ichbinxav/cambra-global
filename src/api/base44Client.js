import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Create a client with authentication required.
const client = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// Base44 currently returns the body of quota-consolidated logical routes as a
// JSON string even when the HTTP content type is application/json. Normalize
// only valid JSON containers at the single client boundary so every UI caller
// receives the same contract as a physical function. Plain-text responses and
// downloads are preserved byte-for-byte.
export function normalizeBase44FunctionResponse(response) {
  if (!response || typeof response.data !== 'string') return response;
  let value = response.data;
  for (let layer = 0; layer < 4 && typeof value === 'string'; layer += 1) {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('"')) break;
    try { value = JSON.parse(trimmed); }
    catch { break; }
  }
  return value === response.data ? response : { ...response, data: value };
}

const rawInvoke = client.functions.invoke.bind(client.functions);
client.functions.invoke = async (...args) => normalizeBase44FunctionResponse(await rawInvoke(...args));

export const base44 = client;
