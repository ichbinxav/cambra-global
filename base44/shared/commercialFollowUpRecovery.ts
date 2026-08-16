export const COMMERCIAL_FOLLOW_UP_RECOVERY_CONTRACT_VERSION = 'commercial-follow-up-recovery-v1.0.0';

export async function readCriticalFollowUpCollection<T>(
  dependency: string,
  exclusiveLimit: number,
  read: () => Promise<unknown>,
): Promise<T[]> {
  let value: unknown;
  try {
    value = await read();
  } catch {
    throw new Error(`critical_read_failed:${dependency}`);
  }
  if (!Array.isArray(value)) {
    throw new Error(`critical_read_ambiguous:${dependency}`);
  }
  if (value.length >= exclusiveLimit) {
    throw new Error(`critical_read_truncated:${dependency}`);
  }
  return value as T[];
}

export function commercialFollowUpRecoveryState(
  failures: unknown[],
  pending = 0,
) {
  const failed = Array.isArray(failures) ? failures.length : 1;
  const pendingCount = Math.max(0, Math.floor(Number(pending || 0)));
  const complete = failed === 0 && pendingCount === 0;
  return {
    data_complete: true,
    recovery_status: complete ? 'COMPLETE' as const : failed > 0 ? 'DEGRADED' as const : 'PARTIAL' as const,
    recovery_complete: complete,
    failed,
    pending: pendingCount,
  };
}

export function commercialFollowUpResultIsComplete(result: any) {
  return result?.ok === true &&
    result?.data_complete === true &&
    result?.recovery_status === 'COMPLETE' &&
    result?.recovery_complete === true &&
    Number(result?.failed || 0) === 0;
}

export function commercialFollowUpResultIsPartial(result: any) {
  return result?.ok === true &&
    result?.data_complete === true &&
    result?.recovery_status === 'PARTIAL' &&
    result?.recovery_complete === false &&
    Number(result?.failed || 0) === 0 &&
    Number(result?.pending || 0) > 0;
}
