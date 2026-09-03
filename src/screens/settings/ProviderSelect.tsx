import React, {useEffect, useState} from 'react';
import {View, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator} from 'react-native';
import {useM3Colors} from '../../theme/M3PaletteContext';
import AppText from '../../components/ui/Text';
import {useAuthStore} from '../../lib/zustand/authStore';
import axios from 'axios';
import {useNavigation} from '@react-navigation/native';

const API = 'https://cinepix.top/api/app';

interface ProviderItem {
  value: string;
  display_name: string;
  icon: string;
}

export default function ProviderSelectScreen() {
  const colors = useM3Colors();
  const token = useAuthStore(s => s.token);
  const navigation = useNavigation();
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/myproviders`, {
      headers: {Authorization: `Bearer ${token}`},
      timeout: 8000,
    }).then(res => {
      const list = res.data.providers || [];
      setProviders(list);
      if (!res.data.all) {
        setSelected(new Set(list.map((p: ProviderItem) => p.value)));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token]);

  const toggle = (value: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await axios.post(`${API}/myproviders`, {
        providers: Array.from(selected),
      }, {
        headers: {Authorization: `Bearer ${token}`},
        timeout: 8000,
      });
      navigation.goBack();
    } catch {}
    setSaving(false);
  };

  if (loading) {
    return <View style={[styles.container, {backgroundColor: colors.background}]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <AppText role="titleMedium" style={{color: colors.primary}}>Cancel</AppText>
        </TouchableOpacity>
        <AppText role="titleLarge" style={{color: colors.onBackground}}>Select Providers</AppText>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <AppText role="titleMedium" style={{color: colors.primary}}>
            {saving ? 'Saving...' : 'Save'}
          </AppText>
        </TouchableOpacity>
      </View>
      <AppText role="bodySmall" style={[styles.hint, {color: colors.onSurfaceVariant}]}>
        Select which providers show on your home page
      </AppText>
      <FlatList
        data={providers}
        keyExtractor={item => item.value}
        renderItem={({item}) => {
          const isActive = selected.has(item.value);
          return (
            <TouchableOpacity
              onPress={() => toggle(item.value)}
              style={[styles.row, {backgroundColor: isActive ? colors.primaryContainer : colors.surfaceContainer, borderColor: isActive ? colors.primary : colors.outlineVariant}]}>
              <View style={styles.rowContent}>
                <AppText role="titleMedium" style={{color: isActive ? colors.onPrimaryContainer : colors.onSurface, flex: 1}}>
                  {item.display_name}
                </AppText>
                <View style={[styles.checkbox, {borderColor: isActive ? colors.primary : colors.outline, backgroundColor: isActive ? colors.primary : 'transparent'}]}>
                  {isActive && <View style={styles.checkInner} />}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{padding: 16, gap: 8}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4},
  hint: { paddingHorizontal: 16, marginBottom: 8 },
  row: {padding: 16, borderRadius: 12, borderWidth: 1},
  rowContent: {flexDirection: 'row', alignItems: 'center'},
  checkbox: {width: 24, height: 24, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center'},
  checkInner: {width: 12, height: 12, borderRadius: 3, backgroundColor: '#fff'},
});
