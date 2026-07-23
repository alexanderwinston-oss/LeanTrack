import {
  initialize,
  requestPermission,
  readRecords,
  getSdkStatus,
  SdkAvailabilityStatus,
  openHealthConnectSettings,
  getGrantedPermissions,
} from 'react-native-health-connect';
import { getLocalDateString } from './utils';

export { openHealthConnectSettings };

const REQUIRED_HEALTH_PERMISSIONS = [
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
] as const;

// getTodayCaloriesBurned() reads TotalCaloriesBurned first and falls back to
// ActiveCaloriesBurned only when the former has no records — but ActiveCaloriesBurned
// must not gate "connected" status, since a user can grant one without the other in
// Health Connect's per-permission toggle screen.
const SYNC_REQUIRED_PERMISSIONS = [
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
] as const;

export async function isHealthConnectAvailable(): Promise<boolean> {
  try {
    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

// requestPermission()'s own resolved value is unreliable — it only reflects a single
// in-app dialog invocation and never re-resolves if the user instead grants access from
// Health Connect's own settings screen (see matinzd/react-native-health-connect#147, #137).
// Always re-verify against the actual granted set instead of trusting that return value.
export async function hasHealthPermissions(): Promise<boolean> {
  try {
    // requestPermission()/getGrantedPermissions() reject with ClientNotInitialized
    // unless initialize() has already run in this session (see native
    // HealthConnectManager.kt — every client call but getSdkStatus is gated on it).
    await initialize();
    const granted = await getGrantedPermissions();
    return SYNC_REQUIRED_PERMISSIONS.every((required) =>
      granted.some((g) => g.accessType === required.accessType && g.recordType === required.recordType)
    );
  } catch {
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  try {
    await initialize();
    await requestPermission([...REQUIRED_HEALTH_PERMISSIONS]);
  } catch {
    return false;
  }
  return hasHealthPermissions();
}

function sumEnergy(records: { energy?: { inKilocalories?: number } }[]): number {
  return records.reduce((sum, record) => sum + (record.energy?.inKilocalories ?? 0), 0);
}

export async function getTodayCaloriesBurned(): Promise<number> {
  try {
    await initialize();
    const today = getLocalDateString();
    const timeRangeFilter = {
      operator: 'between',
      startTime: new Date(`${today}T00:00:00`).toISOString(),
      endTime: new Date(`${today}T23:59:59`).toISOString(),
    } as const;

    const totalResult = await readRecords('TotalCaloriesBurned', { timeRangeFilter });
    const total = sumEnergy(totalResult.records);
    if (total > 0) return Math.round(total);

    // Many wearables (Wear OS, Fitbit, Samsung Health...) only ever write
    // ActiveCaloriesBurned into Health Connect, never TotalCaloriesBurned (which also
    // requires a BMR source) — without this fallback those users always read 0 kcal
    // no matter how many times they sync.
    const activeResult = await readRecords('ActiveCaloriesBurned', { timeRangeFilter });
    return Math.round(sumEnergy(activeResult.records));
  } catch {
    return 0; // Fail silently — health data is optional
  }
}
