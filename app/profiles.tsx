import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { deleteProfile, getAllProfiles } from '@/lib/db';
import { useStore } from '@/lib/store';
import { UserProfile } from '@/lib/types';
import { registerModal } from '@/lib/useModalManager';
import { normalizeText } from '@/lib/utils';
import KeyboardAwareModal from '@/components/KeyboardAwareModal';

const DELETE_PHRASE = 'je veux supprimer ce profil';

export default function Profiles() {
  const switchProfileInStore = useStore((s) => s.switchProfileInStore);
  const currentProfile = useStore((s) => s.profile);

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadProfiles = useCallback(async () => {
    const list = await getAllProfiles();
    setProfiles(list);
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  registerModal('profilesDelete', !!deleteTarget, () => { setDeleteTarget(null); setDeleteConfirmText(''); }, 10);

  async function handleSwitch(profileId: string) {
    if (profileId === currentProfile?.profile_id) return;
    await switchProfileInStore(profileId);
    await loadProfiles();
  }

  async function handleDelete() {
    if (!deleteTarget?.profile_id) return;
    if (normalizeText(deleteConfirmText) !== DELETE_PHRASE) {
      Alert.alert('Confirmation incorrecte', `Tapez exactement : ${DELETE_PHRASE}`);
      return;
    }
    setDeleting(true);
    try {
      await deleteProfile(deleteTarget.profile_id);
      setDeleteTarget(null);
      setDeleteConfirmText('');
      await loadProfiles();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Impossible de supprimer ce profil.';
      Alert.alert('Erreur', msg);
    } finally {
      setDeleting(false);
    }
  }

  function openDelete(p: UserProfile) {
    if (p.is_active) {
      Alert.alert('Impossible', 'Tu ne peux pas supprimer le profil actif. Active un autre profil d\'abord.');
      return;
    }
    setDeleteTarget(p);
    setDeleteConfirmText('');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>👤 Mes profils</Text>
        <Text style={styles.subtitle}>Appuie sur un profil pour l'activer</Text>
      </View>

      {profiles.map((p) => {
        const isActive = p.is_active || p.profile_id === currentProfile?.profile_id;
        return (
          <TouchableOpacity key={p.profile_id ?? p.id} onPress={() => p.profile_id && handleSwitch(p.profile_id)} activeOpacity={0.8}>
            <Card style={[styles.profileCard, isActive && styles.profileCardActive] as any}>
              <View style={[styles.colorDot, { backgroundColor: p.emoji_color ?? Colors.accent }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>{p.display_name || p.name || 'Mon profil'}</Text>
                <Text style={styles.profileSub}>
                  {p.gender === 'homme' ? '♂ Homme' : '♀ Femme'} · {p.calorie_target} kcal/j
                </Text>
              </View>
              {isActive && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Actif</Text>
                </View>
              )}
              {!isActive && p.profile_id && (
                <TouchableOpacity onPress={() => openDelete(p)} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>🗑️</Text>
                </TouchableOpacity>
              )}
            </Card>
          </TouchableOpacity>
        );
      })}

      <Button label="➕ Nouveau profil" onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'new_profile' } })} />

      {/* Delete confirmation modal */}
      <KeyboardAwareModal visible={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}>
        <Text style={styles.deleteTitle}>⚠️ Supprimer le profil</Text>
        <Text style={styles.deleteDesc}>
          Toutes les données de{' '}
          <Text style={{ color: '#ef4444', fontWeight: '700' }}>
            {deleteTarget?.display_name || deleteTarget?.name || 'ce profil'}
          </Text>
          {' '}seront supprimées définitivement.
        </Text>
        <Text style={styles.deleteHint}>Pour confirmer, tape exactement :</Text>
        <Text style={styles.deletePhrase}>{DELETE_PHRASE}</Text>
        <TextInput
          value={deleteConfirmText}
          onChangeText={setDeleteConfirmText}
          placeholder="Tape la phrase ici..."
          placeholderTextColor="#475569"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.deleteInput}
        />
        <View style={styles.deleteButtons}>
          <TouchableOpacity
            onPress={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}
            style={styles.cancelBtn}
          >
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={normalizeText(deleteConfirmText) !== DELETE_PHRASE || deleting}
            style={[styles.deleteActionBtn, {
              opacity: normalizeText(deleteConfirmText) !== DELETE_PHRASE || deleting ? 0.4 : 1,
            }]}
            onPress={handleDelete}
          >
            <Text style={styles.deleteActionText}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { padding: 20, paddingTop: 56, gap: 16, paddingBottom: 40 },
  header: { gap: 6 },
  backBtn: { color: Colors.accent, fontSize: 15, fontWeight: '500' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textMuted },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  profileCardActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  profileName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  profileSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  activeBadge: {
    backgroundColor: Colors.accent, borderRadius: Colors.radiusPill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  activeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  deleteBtn: { padding: 8 },
  deleteBtnText: { fontSize: 18 },
  deleteTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  deleteDesc: { color: '#94a3b8', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  deleteHint: { color: '#64748b', fontSize: 12, marginBottom: 4 },
  deletePhrase: { color: '#ef4444', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  deleteInput: {
    backgroundColor: '#0f172a', borderRadius: 10, padding: 14,
    color: '#f1f5f9', fontSize: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  deleteButtons: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#1e293b', alignItems: 'center' },
  cancelText: { color: '#94a3b8', fontWeight: '600' },
  deleteActionBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: '#ef4444', alignItems: 'center' },
  deleteActionText: { color: '#fff', fontWeight: '700' },
});
