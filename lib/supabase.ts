import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

let _client: SupabaseClient | null = null;

// Lazily constructed on first actual use, not at module load — a throw during
// eager top-level construction happens during the import phase of app/_layout.tsx,
// before any error handler has had a chance to be installed, which previously
// produced a silent blank screen with zero diagnostic output. Deferring this to
// first call means construction only ever runs from inside a function body,
// after the app has already started rendering.
export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  _client = createClient(
    'https://yayynobalixmzdfwihcs.supabase.co',
    'sb_publishable_yTJi7In9C6F0JQwXQd-iFw_NGTchbKf',
    {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    }
  );

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      _client?.auth.startAutoRefresh();
    } else {
      _client?.auth.stopAutoRefresh();
    }
  });

  return _client;
}
