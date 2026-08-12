import { handleProductionReadinessWorker } from './entry.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

guardedScheduledServe({"worker_key":"productionReadinessWorker","cadence_seconds":86400},handleProductionReadinessWorker);
