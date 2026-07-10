import { Album, Asset, getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';
import { getSetting, setSetting } from './db';

const ALBUM_NAME = 'LeanTrack Food';
const PHOTO_POPUP_SNOOZE_KEY = 'photo_popup_snoozed_until';
const SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function shouldShowPhotoPopup(): Promise<boolean> {
  const snoozedUntil = await getSetting(PHOTO_POPUP_SNOOZE_KEY);
  if (!snoozedUntil) return true;
  return Date.now() >= Number(snoozedUntil);
}

export async function snoozePhotoPopup(): Promise<void> {
  await setSetting(PHOTO_POPUP_SNOOZE_KEY, String(Date.now() + SNOOZE_DURATION_MS));
}

export async function saveToLeanTrackAlbum(uri: string): Promise<void> {
  try {
    // Only ever prompt once. Re-calling requestPermissionsAsync() when the
    // user already responded 'limited' re-triggers Android's native photo
    // reselection picker on every single capture — which looks exactly like
    // the gallery opening right after the camera.
    let { status } = await getPermissionsAsync();
    if (status === 'undetermined') {
      ({ status } = await requestPermissionsAsync());
    }
    if (status !== 'granted') return;
    const asset = await Asset.create(uri);
    const existingAlbum = await Album.get(ALBUM_NAME);
    if (existingAlbum) {
      await existingAlbum.add(asset);
    } else {
      await Album.create(ALBUM_NAME, [asset]);
    }
  } catch {
    // Gallery save must never block the main photo/journal flow
  }
}
