import { handleProductionReadinessWorker } from './entry.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

guardedScheduledServe({"worker_key":"productionReadinessWorker","cadence_seconds":86400},createClientFromRequest,handleProductionReadinessWorker);
