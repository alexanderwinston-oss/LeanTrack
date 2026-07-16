import {
  initialize,
  requestPermission,
  readRecords,
  getSdkStatus,
  SdkAvailabilityStatus,
  openHealthConnectSettings,
} from 'react-native-health-connect';
import { getLocalDateString } from './utils';

export { openHealthConnectSettings };

export async function isHealthConnectAvailable(): Promise<boolean> {
  try {
    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  try {
    const granted = await requestPermission([
      { accessType: 'read', recordType: 'TotalCaloriesBurned' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    ]);
    return granted.length > 0;
  } catch {
    return false;
  }
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
