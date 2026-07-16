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

// Only TotalCaloriesBurned is actually read (see getTodayCaloriesBurned below) —
// ActiveCaloriesBurned is requested for possible future use but must not gate
// "connected" status, since a user can grant one without the other in Health Connect's
// per-permission toggle screen.
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
    await requestPermission([...REQUIRED_HEALTH_PERMISSIONS]);
  } catch {
    return false;
  }
  return hasHealthPermissions();
}

export async function getTodayCaloriesBurned(): Promise<number> {
  try {
    await initialize();
    const today = getLocalDateString();
    const startTime = new Date(`${today}T00:00:00`).toISOString();
    const endTime = new Date(`${today}T23:59:59`).toISOString();

    const result = await readRecords('TotalCaloriesBurned', {
      timeRangeFilter: {
        operator: 'between',
        startTime,
        endTime,
      },
    });

    const total = result.records.reduce((sum, record) => {
      return sum + (record.energy?.inKilocalories ?? 0);
    }, 0);

    return Math.round(total);
  } catch {
    return 0; // Fail silently — health data is optional
  }
}
