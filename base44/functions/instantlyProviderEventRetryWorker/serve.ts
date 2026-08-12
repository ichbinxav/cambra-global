import { handleInstantlyProviderEventRetryWorker } from './entry.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

guardedScheduledServe({"worker_key":"instantlyProviderEventRetryWorker","cadence_seconds":300},handleInstantlyProviderEventRetryWorker);
