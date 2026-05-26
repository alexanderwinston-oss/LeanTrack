import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { createProfile, deleteProfile, getAllProfiles } from '@/lib/db';
import { useStore } from '@/lib/store';
import { UserProfile } from '@/lib/types';

const EMOJI_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

const DELETE_PHRASE = 'je veux supprimer ce profil';

export default function Profiles() {
  const switchProfileInStore = useStore((s) => s.switchProfileInStore);
  const currentProfile = useStore((s) => s.profile);

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [createVisible, setCreateVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState<'homme' | 'femme'>('homme');
  const [newColor, setNewColor] = useState(EMOJI_COLORS[0]);

  const loadProfiles = useCallback(async () => {
    const list = await getAllProfiles();
    setProfiles(list);
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  async function handleSwitch(profileId: string) {
    if (profileId === currentProfile?.profile_id) return;
    await switchProfileInStore(profileId);
    await loadProfiles();
  }

  async function handleCreate() {
    if (!newName.trim()) {
      Alert.alert('Erreur', 'Le nom du profil est requis.');
      return;
    }
    setCreating(true);
    try {
      await createProfile({
        name: newName.trim(),
        display_name: newName.trim(),
        gender: newGender,
        emoji_color: newColor,
      });
      setCreateVisible(false);
      setNewName('');
      setNewGender('homme');
      setNewColor(EMOJI_COLORS[0]);
      await loadProfiles();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget?.profile_id) return;
    if (deleteConfirmText.trim().toLowerCase() !== DELETE_PHRASE) {
      Alert.alert('Confirmation incorrecte', `Tapez exactement : "${DELETE_PHRASE}"`);
      return;
    }
    setDeleting(true);
    try {
      await deleteProfile(deleteTarget.profile_id);
      setDeleteTarget(null);
      setDeleteConfirmText('');
      await loadProfiles();
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
                <Text style={styles.profileName}>{p.display_name ?? p.name}</Text>
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

      <Button label="➕ Nouveau profil" onPress={() => setCreateVisible(true)} />

      {/* Create modal */}
      <Modal visible={createVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Nouveau profil</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nom</Text>
              <TextInput
                style={styles.fieldInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="Ex: Marie, Travail..."
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Genre</Text>
              <View style={styles.genderRow}>
                {(['homme', 'femme'] as const).map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.genderBtn, newGender === g && styles.genderBtnActive]}
                    onPress={() => setNewGender(g)}
                  >
                    <Text style={[styles.genderBtnText, newGender === g && styles.genderBtnTextActive]}>
                      {g === 'homme' ? '♂ Homme' : '♀ Femme'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Couleur du profil</Text>
              <View style={styles.colorRow}>
                {EMOJI_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorSwatch, { backgroundColor: c }, newColor === c && styles.colorSwatchActive]}
                    onPress={() => setNewColor(c)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.modalBtns}>
              <Button label="Annuler" onPress={() => setCreateVisible(false)} variant="ghost" />
              <View style={{ flex: 1 }}>
                <Button label="Créer" onPress={handleCreate} loading={creating} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal visible={!!deleteTarget} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>⚠️ Supprimer le profil</Text>
            <Text style={styles.deleteWarning}>
              Toutes les données de <Text style={{ color: Colors.danger, fontWeight: '700' }}>
                {deleteTarget?.display_name ?? deleteTarget?.name}
              </Text> seront supprimées définitivement.
            </Text>
            <Text style={styles.deleteInstruction}>
              Pour confirmer, tape exactement :
            </Text>
            <Text style={styles.deletePhrase}>"{DELETE_PHRASE}"</Text>
            <TextInput
              style={[styles.fieldInput, styles.deleteInput]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="Tape la phrase ici..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
            <View style={styles.modalBtns}>
              <Button label="Annuler" onPress={() => { setDeleteTarget(null); setDeleteConfirmText(''); }} variant="ghost" />
              <View style={{ flex: 1 }}>
                <Button label="Supprimer" onPress={handleDelete} loading={deleting} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  fieldInput: {
    backgroundColor: Colors.bgElevated, borderRadius: Colors.radius,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: 15, padding: 12,
  },
  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: {
    flex: 1, padding: 10, borderRadius: Colors.radius,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
    backgroundColor: Colors.bgSurface,
  },
  genderBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSubtle },
  genderBtnText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  genderBtnTextActive: { color: Colors.accent },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchActive: { borderWidth: 3, borderColor: Colors.textPrimary },
  modalBtns: { flexDirection: 'row', gap: 10 },
  deleteWarning: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  deleteInstruction: { fontSize: 13, color: Colors.textMuted },
  deletePhrase: { fontSize: 14, color: Colors.danger, fontWeight: '600' },
  deleteInput: { marginTop: 4 },
});
