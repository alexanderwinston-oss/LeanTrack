import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'LeanTrack',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleAllNotifications(settings: { notifications_enabled: boolean }): Promise<void> {
  if (!settings.notifications_enabled) return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Meal reminders: 8h, 12h30, 19h30
  const mealReminders = [
    { hour: 8, minute: 0, title: '🥣 Petit-déjeuner', body: "N'oublie pas de logger ton petit-déjeuner !" },
    { hour: 12, minute: 30, title: '🥗 Déjeuner', body: "C'est l'heure du déjeuner. Pense à le noter !" },
    { hour: 19, minute: 30, title: '🍽️ Dîner', body: "N'oublie pas de logger ton dîner !" },
  ];

  for (const r of mealReminders) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute },
    });
  }

  // Water reminders: every 2h from 8h to 22h
  for (let h = 8; h <= 22; h += 2) {
    await Notifications.scheduleNotificationAsync({
      content: { title: '💧 Hydratation', body: 'Pense à boire un verre d\'eau !' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: h, minute: 0 },
    });
  }

  // Movement reminders: every 2h from 9h to 18h
  for (let h = 9; h <= 18; h += 2) {
    await Notifications.scheduleNotificationAsync({
      content: { title: '🚶 Bouger', body: 'Lève-toi et marche 5 minutes !' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: h, minute: 30 },
    });
  }
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
