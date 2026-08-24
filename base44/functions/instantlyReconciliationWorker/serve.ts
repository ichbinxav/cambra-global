import { handleInstantlyReconciliationWorker } from './entry.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

guardedScheduledServe({"worker_key":"instantlyReconciliationWorker","cadence_seconds":900},createClientFromRequest,handleInstantlyReconciliationWorker);
