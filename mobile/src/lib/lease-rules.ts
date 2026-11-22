/**
 * Lease rules are off until the hunter turns them on.
 * Someone who already saved a manager or a pre-shot record keeps that working.
 */

export function migrateLeaseRules(input: {
  chosen: boolean;
  enabled: boolean;
  managerName: string;
  managerPhone: string;
  savedRecords: number;
}): { chosen: boolean; enabled: boolean } {
  if (input.chosen) return { chosen: true, enabled: input.enabled };
  const kept = input.managerName.trim().length > 0
    || input.managerPhone.trim().length > 0
    || input.savedRecords > 0;
  return { chosen: true, enabled: kept };
}

/** The record line shows only when he opted in and the server flag is still on. */
export function showPreShotRecord(leaseRules: boolean, remoteEnabled: boolean): boolean {
  return leaseRules && remoteEnabled;
}
