import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, TouchableOpacity, View} from 'react-native';
import {MaterialIcons} from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {useAuthStore} from '../lib/zustand/authStore';
import {useM3Colors} from '../theme/M3PaletteContext';
import AppText from '../components/ui/Text';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../App';
import {friendsService} from '../lib/services/friendsService';
import {useContinueWatchingStore} from '../lib/zustand/continueWatchingStore';

export default function ProfileScreen() {
  const {user, isPremium, refreshProfile} = useAuthStore();
  const colors = useM3Colors();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [friendCount, setFriendCount] = useState<number | null>(null);

  useEffect(() => {
    refreshProfile();
    // Friend count for the stats strip (best effort, silent on failure).
    friendsService
      .list()
      .then(d => setFriendCount(d.friends.length))
      .catch(() => setFriendCount(null));
  }, []);

  const continueItems = (
    useContinueWatchingStore.getState().items || []
  ).length;

  const initial = (user?.username || '?').slice(0, 1).toUpperCase();

  return (
    <ScrollView
      style={{backgroundColor: colors.background, flex: 1}}
      contentContainerStyle={{paddingBottom: 40}}>
      {/* Header card */}
      <View
        style={{
          alignItems: 'center',
          backgroundColor: colors.surfaceContainerLowest,
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
          paddingBottom: 22,
          paddingTop: 48,
        }}>
        <View
          style={[
            styles.avatar,
            {backgroundColor: colors.primaryContainer, borderColor: colors.primary},
          ]}>
          <AppText
            role="displayMediumEmphasized"
            style={{color: colors.onPrimaryContainer}}>
            {initial}
          </AppText>
        </View>

        <AppText
          role="headlineMedium"
          style={{color: colors.onBackground, fontWeight: '800', marginTop: 14}}>
          {user?.username || 'Unknown'}
        </AppText>

        <AppText role="bodyMedium" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
          {user?.email || ''}
        </AppText>

        <View
          style={[
            styles.badge,
            {
              backgroundColor: isPremium
                ? colors.primaryContainer
                : colors.surfaceContainerHigh,
              marginTop: 10,
            },
          ]}>
          <MaterialIcons
            name={isPremium ? 'star' : 'person-outline'}
            size={14}
            color={isPremium ? colors.primary : colors.onSurfaceVariant}
          />
          <AppText
            role="labelMedium"
            style={{
              color: isPremium ? colors.primary : colors.onSurfaceVariant,
              marginLeft: 6,
              fontWeight: '700',
            }}>
            {isPremium ? 'PREMIUM MEMBER' : 'FREE MEMBER'}
          </AppText>
        </View>
      </View>

      {/* Stats strip */}
      <View style={{flexDirection: 'row', gap: 10, marginTop: 16, paddingHorizontal: 18}}>
        <View
          style={[
            styles.statCard,
            {backgroundColor: colors.surfaceContainerLow},
          ]}>
          <MaterialCommunityIcons
            name="play-circle-outline"
            size={22}
            color={colors.primary}
          />
          <AppText role="titleMediumEmphasized" style={{color: colors.onBackground, marginTop: 4}}>
            {continueItems}
          </AppText>
          <AppText role="labelSmallEmphasized" style={{color: colors.onSurfaceVariant}}>
            দেখা চলছে
          </AppText>
        </View>
        <View
          style={[
            styles.statCard,
            {backgroundColor: colors.surfaceContainerLow},
          ]}>
          <MaterialCommunityIcons
            name="account-group-outline"
            size={22}
            color="#10b981"
          />
          <AppText role="titleMediumEmphasized" style={{color: colors.onBackground, marginTop: 4}}>
            {friendCount ?? '–'}
          </AppText>
          <AppText role="labelSmallEmphasized" style={{color: colors.onSurfaceVariant}}>
            বন্ধুরা
          </AppText>
        </View>
        <TouchableOpacity
          style={[styles.statCard, {backgroundColor: colors.surfaceContainerLow}]}
          onPress={() => navigation.navigate('TabStack', {screen: 'WatchListStack'})}>
          <MaterialCommunityIcons
            name="bookmark-box-multiple-outline"
            size={22}
            color={colors.tertiary}
          />
          <AppText role="titleMediumEmphasized" style={{color: colors.onBackground, marginTop: 4}}>
            ★
          </AppText>
          <AppText role="labelSmallEmphasized" style={{color: colors.onSurfaceVariant}}>
            Watchlist
          </AppText>
        </TouchableOpacity>
      </View>

      {/* Account info card */}
      <View
        style={[
          styles.card,
          {backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, marginTop: 18},
        ]}>
        <View style={[styles.row, {borderBottomColor: colors.outlineVariant}]}>
          <MaterialIcons name="email" size={20} color={colors.onSurfaceVariant} />
          <View style={{flex: 1, marginLeft: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, fontWeight: '600'}}>
              Email
            </AppText>
            <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
              {user?.email || 'Not set'}
            </AppText>
          </View>
        </View>
        <View style={styles.row}>
          <MaterialIcons name="badge" size={20} color={colors.onSurfaceVariant} />
          <View style={{flex: 1, marginLeft: 12}}>
            <AppText role="bodyMedium" style={{color: colors.onSurface, fontWeight: '600'}}>
              Account Type
            </AppText>
            <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
              {isPremium ? 'Premium' : 'Free'}
            </AppText>
          </View>
        </View>
      </View>

      {/* Premium CTA for free users */}
      {!isPremium ? (
        <TouchableOpacity
          onPress={() => navigation.navigate('Premium')}
          style={{
            alignItems: 'center',
            backgroundColor: colors.primaryContainer,
            borderRadius: 18,
            flexDirection: 'row',
            gap: 10,
            marginTop: 14,
            marginHorizontal: 18,
            padding: 16,
          }}>
          <MaterialCommunityIcons name="crown-outline" size={26} color={colors.primary} />
          <View style={{flex: 1}}>
            <AppText role="titleSmallEmphasized" style={{color: colors.onPrimaryContainer}}>
              Premium-এ আপগ্রেড করুন
            </AppText>
            <AppText role="labelSmallEmphasized" style={{color: colors.onPrimaryContainer, opacity: 0.8, marginTop: 2}}>
              Ad-free + সব provider + HD streaming
            </AppText>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.primary} />
        </TouchableOpacity>
      ) : (
        <View
          style={{
            alignItems: 'center',
            backgroundColor: colors.primaryContainer,
            borderRadius: 18,
            flexDirection: 'row',
            gap: 10,
            marginTop: 14,
            marginHorizontal: 18,
            padding: 16,
          }}>
          <MaterialCommunityIcons name="crown" size={26} color={colors.primary} />
          <View style={{flex: 1}}>
            <AppText role="titleSmallEmphasized" style={{color: colors.onPrimaryContainer}}>
              Premium সক্রিয়
            </AppText>
            <AppText role="labelSmallEmphasized" style={{color: colors.onPrimaryContainer, opacity: 0.8, marginTop: 2}}>
              ধন্যবাদ! আপনি ad-free অভিজ্ঞতা উপভোগ করছেন
            </AppText>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderColor: 3,
    borderRadius: 52,
    borderWidth: 3,
    height: 104,
    justifyContent: 'center',
    width: 104,
  },
  badge: {
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  card: {borderRadius: 16, borderWidth: 1, marginHorizontal: 18, overflow: 'hidden'},
  row: {alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', padding: 16},
  statCard: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    paddingVertical: 14,
  },
});
