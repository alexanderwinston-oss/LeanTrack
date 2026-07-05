import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';

const ALBUM_NAME = 'LeanTrack Food';

export async function saveToLeanTrackAlbum(uri: string): Promise<void> {
  try {
    const { status } = await requestPermissionsAsync();
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
