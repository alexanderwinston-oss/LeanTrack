import {
  initialize,
  requestPermission,
  readRecords,
  getSdkStatus,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import { getLocalDateString } from './utils';

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
    const startTime = `${today}T00:00:00.000Z`;
    const endTime = `${today}T23:59:59.000Z`;

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
