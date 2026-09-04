import React, {useEffect} from 'react';
import {View, StyleSheet} from 'react-native';
import {MaterialIcons} from '@expo/vector-icons';
import {useAuthStore} from '../lib/zustand/authStore';
import {useM3Colors} from '../theme/M3PaletteContext';
import AppText from '../components/ui/Text';

export default function ProfileScreen() {
  const {user, isPremium, refreshProfile} = useAuthStore();
  const colors = useM3Colors();

  useEffect(() => {
    refreshProfile();
  }, []);

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.avatar, {backgroundColor: colors.primaryContainer, borderColor: colors.primary}]}>
        <MaterialIcons name="person" size={48} color={colors.onPrimaryContainer} />
      </View>

      <AppText role="headlineMedium" style={{color: colors.onBackground, fontWeight: '800', marginTop: 16}}>
        {user?.username || 'Unknown'}
      </AppText>

      <AppText role="bodyMedium" style={{color: colors.onSurfaceVariant, marginTop: 4}}>
        {user?.email || ''}
      </AppText>

      <View style={[styles.badge, {backgroundColor: isPremium ? colors.primaryContainer : colors.surfaceContainerHigh, marginTop: 12}]}>
        <MaterialIcons name={isPremium ? 'star' : 'person-outline'} size={14} color={isPremium ? colors.primary : colors.onSurfaceVariant} />
        <AppText role="labelMedium" style={{color: isPremium ? colors.primary : colors.onSurfaceVariant, marginLeft: 6, fontWeight: '700'}}>
          {isPremium ? 'PREMIUM' : 'FREE'}
        </AppText>
      </View>

      <View style={[styles.card, {backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, marginTop: 24}]}>
        <View style={[styles.row, {borderBottomColor: colors.outlineVariant}]}>
          <MaterialIcons name="email" size={20} color={colors.onSurfaceVariant} />
          <View style={{marginLeft: 12, flex: 1}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, fontWeight: '600'}}>Email</AppText>
            <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>{user?.email || 'Not set'}</AppText>
          </View>
        </View>
        <View style={styles.row}>
          <MaterialIcons name="badge" size={20} color={colors.onSurfaceVariant} />
          <View style={{marginLeft: 12, flex: 1}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, fontWeight: '600'}}>Account Type</AppText>
            <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>{isPremium ? 'Premium' : 'Free'}</AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 20},
  avatar: {width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 3},
  badge: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20},
  card: {width: '100%', borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginTop: 24},
  row: {flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1},
});
