import { handleProductionReadinessWorker } from './entry.ts';

Deno.serve(handleProductionReadinessWorker);
