import { handleInstantlyReconciliationWorker } from './entry.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

guardedScheduledServe({"worker_key":"instantlyReconciliationWorker","cadence_seconds":900},handleInstantlyReconciliationWorker);
