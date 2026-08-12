import { handleAutonomousCompanyOrchestrator } from './entry.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

guardedScheduledServe({"worker_key":"autonomousCompanyOrchestrator","cadence_seconds":21600},handleAutonomousCompanyOrchestrator);
