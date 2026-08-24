import { handleAutonomousCompanyOrchestrator } from './entry.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

guardedScheduledServe({"worker_key":"autonomousCompanyOrchestrator","cadence_seconds":21600},createClientFromRequest,handleAutonomousCompanyOrchestrator);
