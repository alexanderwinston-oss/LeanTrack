import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { getSupabase } from '@/lib/supabase';

// A static `import { GoogleSignin } from '@react-native-google-signin/google-signin'`
// runs `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` at module-load time —
// this throws synchronously if the native TurboModule isn't found, and a static
// import can never be wrapped in try/catch, so that throw is unrecoverable and
// takes the whole app down before any error handler exists. Loading the package
// dynamically defers that risk to a point where it can actually be caught.
type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configReady, setConfigReady] = useState(false);
  const [mod, setMod] = useState<GoogleSigninModule | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const m: GoogleSigninModule = await import('@react-native-google-signin/google-signin');
        m.GoogleSignin.configure({
          webClientId: '650219101258-ha2fb5qutdk8fms25bgq046ljb5opm7d.apps.googleusercontent.com',
          scopes: ['profile', 'email'],
        });
        setMod(m);
        setConfigReady(true);
      } catch (e) {
        console.error('[login] GoogleSignin load/configure', e);
        setError('Service de connexion Google indisponible sur cet appareil.');
      }
    })();
  }, []);

  async function handleGoogleSignIn() {
    if (!mod) return;
    const { GoogleSignin, statusCodes } = mod;
    setLoading(true);
    setError(null);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;
      if (!idToken) throw new Error('No ID token received');

      const { error: authError } = await getSupabase().auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (authError) throw authError;
      // Navigation handled by app/_layout.tsx auth listener — do NOT navigate here
    } catch (err: any) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled — not an error
      } else if (err.code === statusCodes.IN_PROGRESS) {
        setError('Connexion déjà en cours...');
      } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play Services indisponible sur cet appareil.');
      } else {
        setError('Erreur de connexion. Réessaie.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.logo}>LeanTrack</Text>
        <Text style={styles.subtitle}>Ton compagnon nutritionnel</Text>
      </View>

      <View style={styles.center}>
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleGoogleSignIn}
          disabled={loading || !configReady}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.textPrimary} />
          ) : (
            <>
              <View style={styles.googleIcon}>
                <Text style={styles.googleIconText}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Continuer avec Google</Text>
            </>
          )}
        </TouchableOpacity>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <Text style={styles.terms}>
        En continuant, tu acceptes nos conditions d'utilisation
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 100,
    paddingBottom: 40,
  },
  top: { alignItems: 'center', gap: 8 },
  logo: { fontSize: 48, fontWeight: '800', color: Colors.accent },
  subtitle: { fontSize: 16, color: Colors.textSecondary },
  center: { alignItems: 'center', gap: 14 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: Colors.radiusButton,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 16,
    paddingHorizontal: 28,
    minWidth: 260,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  googleIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  googleBtnText: { fontSize: 16, fontWeight: '600', color: '#1F1F1F' },
  error: { color: Colors.danger, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  terms: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
});
