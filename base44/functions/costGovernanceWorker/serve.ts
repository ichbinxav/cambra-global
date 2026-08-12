import { handleCostGovernanceWorker } from './entry.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

guardedScheduledServe({"worker_key":"costGovernanceWorker","cadence_seconds":3600},handleCostGovernanceWorker);
