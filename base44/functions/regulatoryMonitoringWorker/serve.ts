import { handleRegulatoryMonitoringWorker } from './entry.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

guardedScheduledServe({"worker_key":"regulatoryMonitoringWorker","cadence_seconds":86400},handleRegulatoryMonitoringWorker);
