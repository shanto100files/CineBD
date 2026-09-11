import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  ToastAndroid,
  TextInput,
  RefreshControl,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SettingsStackParamList} from '../../App';
import {MaterialIcons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AppText from '../../components/ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {useAuthStore} from '../../lib/zustand/authStore';
import axios from 'axios';

const API = 'https://cinepix.top/api/app';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Premium'>;

interface Package {
  id: number;
  name: string;
  price: number;
  currency: string;
  duration_days: number;
  features: string;
}

interface Subscription {
  id: number;
  status: string;
  payment_method: string;
  transaction_id: string;
  amount: number;
  admin_note: string;
  starts_at: string;
  expires_at: string;
  created_at: string;
  package_name: string;
  duration_days: number;
}

const PremiumScreen = ({navigation}: Props) => {
  const insets = useSafeAreaInsets();
  const colors = useM3Colors();
  const {token, isPremium, refreshProfile} = useAuthStore();
  const [packages, setPackages] = useState<Package[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('bkash');
  const [transactionId, setTransactionId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [pkgRes, subRes] = await Promise.all([
        axios.get(`${API}/premium-packages`, {timeout: 10000}),
        token
          ? axios.get(`${API}/my-subscriptions`, {
              headers: {Authorization: `Bearer ${token}`},
              timeout: 10000,
            })
          : null,
      ]);
      setPackages(pkgRes.data.packages || []);
      if (subRes?.data) {
        setSubscriptions(subRes.data.subscriptions || []);
        setExpiresAt(subRes.data.expires_at);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    (async () => {
      await fetchData();
      setLoading(false);
    })();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, []);

  const handleSubmit = async () => {
    if (!selectedPkg || !token) return;
    if (paymentMethod === 'bkash' && !transactionId.trim()) {
      ToastAndroid.show('Transaction ID required', ToastAndroid.SHORT);
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(
        `${API}/subscribe`,
        {
          package_id: selectedPkg.id,
          payment_method: paymentMethod,
          transaction_id: transactionId.trim(),
        },
        {headers: {Authorization: `Bearer ${token}`}, timeout: 10000},
      );
      if (res.data.ok) {
        ToastAndroid.show('Request submitted! Wait for admin approval.', ToastAndroid.LONG);
        setSelectedPkg(null);
        setTransactionId('');
        await fetchData();
      } else {
        ToastAndroid.show(res.data.error || 'Failed', ToastAndroid.SHORT);
      }
    } catch (e: any) {
      ToastAndroid.show(e.response?.data?.error || 'Network error', ToastAndroid.SHORT);
    }
    setSubmitting(false);
  };

  const formatDate = (d: string | null) => {
    if (!d) return 'N/A';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'});
  };

  const getDaysLeft = (expiresAt: string | null) => {
    if (!expiresAt) return 0;
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#10b981';
      case 'pending': return '#f59e0b';
      case 'rejected': return '#ef4444';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <View style={{flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top}}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{flex: 1, backgroundColor: colors.background}}>
      {/* Header */}
      <View style={{paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12}}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{padding: 4}}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <AppText role="titleLarge" style={{color: colors.onSurface, fontWeight: '700', flex: 1}}>
          Premium
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{paddingBottom: insets.bottom + 20}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        
        {/* Current Status */}
        <View style={{marginHorizontal: 16, marginBottom: 20}}>
          <View style={{backgroundColor: isPremium ? 'rgba(251,191,36,0.1)' : colors.surfaceContainerLow, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: isPremium ? 'rgba(251,191,36,0.3)' : colors.outlineVariant}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
              <View style={{width: 48, height: 48, borderRadius: 24, backgroundColor: isPremium ? '#f59e0b' : colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center'}}>
                <MaterialIcons name={isPremium ? 'star' : 'person'} size={24} color={isPremium ? '#fff' : colors.onSurfaceVariant} />
              </View>
              <View style={{flex: 1}}>
                <AppText role="titleMedium" style={{color: isPremium ? '#f59e0b' : colors.onSurface, fontWeight: '700'}}>
                  {isPremium ? 'Premium Active' : 'Free Account'}
                </AppText>
                {isPremium && expiresAt && (
                  <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
                    Expires: {formatDate(expiresAt)} ({getDaysLeft(expiresAt)} days left)
                  </AppText>
                )}
                {!isPremium && (
                  <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
                    Upgrade to enjoy ad-free streaming and all providers
                  </AppText>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Payment Methods */}
        <View style={{marginHorizontal: 16, marginBottom: 16}}>
          <AppText role="titleSmall" style={{color: colors.onSurface, fontWeight: '700', marginBottom: 8}}>
            Payment Method
          </AppText>
          <View style={{flexDirection: 'row', gap: 8}}>
            {['bkash', 'nagad', 'rocket'].map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => setPaymentMethod(m)}
                style={{flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: paymentMethod === m ? colors.primaryContainer : colors.surfaceContainerLow, borderWidth: 1, borderColor: paymentMethod === m ? colors.primary : colors.outlineVariant, alignItems: 'center'}}>
                <AppText role="labelMedium" style={{color: paymentMethod === m ? colors.primary : colors.onSurfaceVariant, fontWeight: '600', textTransform: 'uppercase'}}>
                  {m}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Transaction ID */}
        <View style={{marginHorizontal: 16, marginBottom: 20}}>
          <AppText role="titleSmall" style={{color: colors.onSurface, fontWeight: '700', marginBottom: 8}}>
            Transaction ID
          </AppText>
          <TextInput
            value={transactionId}
            onChangeText={setTransactionId}
            placeholder="Enter bKash/Nagad transaction ID"
            placeholderTextColor={colors.onSurfaceVariant}
            style={{backgroundColor: colors.surfaceContainerLow, borderRadius: 12, padding: 14, color: colors.onSurface, fontSize: 14, borderWidth: 1, borderColor: colors.outlineVariant}}
          />
          <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 4}}>
            Send money to: 01XXXXXXXXX (Admin), then enter the transaction ID here
          </AppText>
        </View>

        {/* Packages */}
        <View style={{marginHorizontal: 16, marginBottom: 20}}>
          <AppText role="titleSmall" style={{color: colors.onSurface, fontWeight: '700', marginBottom: 12}}>
            Choose a Plan
          </AppText>
          {packages.map(pkg => (
            <TouchableOpacity
              key={pkg.id}
              onPress={() => setSelectedPkg(pkg)}
              style={{marginBottom: 12, borderRadius: 16, padding: 16, borderWidth: 2, borderColor: selectedPkg?.id === pkg.id ? colors.primary : colors.outlineVariant, backgroundColor: selectedPkg?.id === pkg.id ? colors.primaryContainer : colors.surfaceContainerLow}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                <View>
                  <AppText role="titleMedium" style={{color: colors.onSurface, fontWeight: '700'}}>
                    {pkg.name}
                  </AppText>
                  <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
                    {pkg.duration_days} days
                  </AppText>
                </View>
                <View style={{alignItems: 'flex-end'}}>
                  <AppText role="headlineSmall" style={{color: colors.primary, fontWeight: '800'}}>
                    ৳{pkg.price}
                  </AppText>
                  <AppText role="bodySmall" style={{color: colors.onSurfaceVariant}}>
                    /{pkg.duration_days}d
                  </AppText>
                </View>
              </View>
              {pkg.features ? (
                <View style={{marginTop: 10, borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingTop: 10}}>
                  {pkg.features.split(',').map((f, i) => (
                    <View key={i} style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4}}>
                      <MaterialIcons name="check-circle" size={14} color="#10b981" />
                      <AppText role="bodySmall" style={{color: colors.onSurfaceVariant}}>{f.trim()}</AppText>
                    </View>
                  ))}
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>

        {/* Submit Button */}
        {selectedPkg && (
          <View style={{marginHorizontal: 16, marginBottom: 24}}>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={{backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: submitting ? 0.6 : 1}}>
              {submitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <AppText role="titleMedium" style={{color: colors.onPrimary, fontWeight: '700'}}>
                  Submit Request — ৳{selectedPkg.price} ({selectedPkg.name})
                </AppText>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Subscription History */}
        {subscriptions.length > 0 && (
          <View style={{marginHorizontal: 16}}>
            <AppText role="titleSmall" style={{color: colors.onSurface, fontWeight: '700', marginBottom: 12}}>
              Subscription History
            </AppText>
            {subscriptions.map(sub => (
              <View key={sub.id} style={{backgroundColor: colors.surfaceContainerLow, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.outlineVariant}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                  <AppText role="bodyMedium" style={{color: colors.onSurface, fontWeight: '600'}}>
                    {sub.package_name} — ৳{sub.amount}
                  </AppText>
                  <View style={{backgroundColor: statusColor(sub.status) + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10}}>
                    <AppText role="labelSmall" style={{color: statusColor(sub.status), fontWeight: '700', textTransform: 'uppercase'}}>
                      {sub.status}
                    </AppText>
                  </View>
                </View>
                <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 4}}>
                  {sub.payment_method.toUpperCase()} • {formatDate(sub.created_at)}
                </AppText>
                {sub.expires_at && sub.status === 'approved' && (
                  <AppText role="bodySmall" style={{color: '#10b981', marginTop: 2}}>
                    Active until: {formatDate(sub.expires_at)}
                  </AppText>
                )}
                {sub.admin_note && (
                  <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2, fontStyle: 'italic'}}>
                    Note: {sub.admin_note}
                  </AppText>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default PremiumScreen;
