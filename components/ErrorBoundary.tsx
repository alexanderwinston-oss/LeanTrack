import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// Render-time errors (thrown directly in a component body, not in an effect or
// async callback) never reach the global error handler — React unmounts the
// tree and, with no boundary, the screen goes blank. This shows the real error
// on screen instead, in every build (not just dev), so a launch failure is
// diagnosable without a USB-attached device.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    // TEMPORARY diagnostic reporting — see entry.js. Remove once found/fixed.
    try {
      fetch('https://ntfy.sh/leantrack-crash-2xgb456u', {
        method: 'POST',
        body: `ErrorBoundary — ${error?.message}\n\n${error?.stack}\n\n${info.componentStack}`,
        headers: { Title: 'LeanTrack crash (ErrorBoundary)' },
      }).catch(() => {});
    } catch {}
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.title}>💥 Erreur au démarrage</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Text style={styles.stack}>{this.state.error.stack}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a0000' },
  content: { padding: 20, paddingTop: 60 },
  title: { color: '#ff6b6b', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  message: { color: '#fff', fontSize: 15, marginBottom: 16 },
  stack: { color: '#ffaaaa', fontSize: 11, fontFamily: 'monospace' },
});
