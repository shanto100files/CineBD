import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  ToastAndroid,
  TextInput,
  RefreshControl,
  Clipboard,
  Linking,
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

interface PaymentNumbers {
  bkash: string;
  nagad: string;
  rocket: string;
}

interface AdminContact {
  phone: string;
  telegram: string;
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
  const [paymentNumbers, setPaymentNumbers] = useState<PaymentNumbers>({bkash: '', nagad: '', rocket: ''});
  const [adminContact, setAdminContact] = useState<AdminContact>({phone: '', telegram: ''});
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
      const pkgRes = await axios.get(`${API}/premium-packages`, {timeout: 10000});
      setPackages(pkgRes.data.packages || []);
      setPaymentNumbers(pkgRes.data.payment_numbers || {bkash: '', nagad: '', rocket: ''});
      setAdminContact(pkgRes.data.admin_contact || {phone: '', telegram: ''});
    } catch {}

    if (token) {
      try {
        const subRes = await axios.get(`${API}/my-subscriptions`, {
          headers: {Authorization: `Bearer ${token}`},
          timeout: 10000,
        });
        setSubscriptions(subRes.data.subscriptions || []);
        setExpiresAt(subRes.data.expires_at);
      } catch {}
    }
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

  const copyNumber = (num: string) => {
    if (!num) return;
    Clipboard.setString(num);
    ToastAndroid.show('নম্বর কপি হয়েছে!', ToastAndroid.SHORT);
  };

  const handleSubmit = async () => {
    if (!selectedPkg || !token) return;
    if (!transactionId.trim()) {
      ToastAndroid.show('ট্রানজেকশন আইডি দিন', ToastAndroid.SHORT);
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
        ToastAndroid.show('অনুরোধ জমা হয়েছে! অ্যাডমিন এপ্রুভ করবে।', ToastAndroid.LONG);
        setSelectedPkg(null);
        setTransactionId('');
        await fetchData();
      } else {
        ToastAndroid.show(res.data.error || 'ব্যর্থ', ToastAndroid.SHORT);
      }
    } catch (e: any) {
      ToastAndroid.show(e.response?.data?.error || 'নেটওয়ার্ক সমস্যা', ToastAndroid.SHORT);
    }
    setSubmitting(false);
  };

  const formatDate = (d: string | null) => {
    if (!d) return 'N/A';
    const dt = new Date(d);
    return dt.toLocaleDateString('bn-BD', {year: 'numeric', month: 'short', day: 'numeric'});
  };

  const getDaysLeft = (exp: string | null) => {
    if (!exp) return 0;
    const diff = new Date(exp).getTime() - Date.now();
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

  const statusLabel = (status: string) => {
    switch (status) {
      case 'approved': return 'অনুমোদিত';
      case 'pending': return 'অপেক্ষমাণ';
      case 'rejected': return 'বাতিল';
      default: return status;
    }
  };

  const methodLabel = (m: string) => {
    switch (m) {
      case 'bkash': return 'বিকাশ';
      case 'nagad': return 'নগদ';
      case 'rocket': return 'রকেট';
      default: return m;
    }
  };

  const getPaymentNumber = () => {
    if (paymentMethod === 'bkash') return paymentNumbers.bkash || paymentNumbers.nagad || '';
    if (paymentMethod === 'nagad') return paymentNumbers.nagad || paymentNumbers.bkash || '';
    return '';
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
      <View style={{paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12}}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{padding: 4}}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <AppText role="titleLarge" style={{color: colors.onSurface, fontWeight: '700', flex: 1}}>
          প্রিমিয়াম
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
                  {isPremium ? 'প্রিমিয়াম সক্রিয়' : 'ফ্রি অ্যাকাউন্ট'}
                </AppText>
                {isPremium && expiresAt && (
                  <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
                    মেয়াদ শেষ: {formatDate(expiresAt)} ({getDaysLeft(expiresAt)} দিন বাকি)
                  </AppText>
                )}
                {!isPremium && (
                  <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
                    প্রিমিয়ামে আপগ্রেড করুন — বিজ্ঞাপনমুক্ত স্ট্রিমিং ও সব প্রোভাইডার পাবেন
                  </AppText>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Payment Instructions */}
        <View style={{marginHorizontal: 16, marginBottom: 20}}>
          <View style={{backgroundColor: colors.surfaceContainerLow, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.outlineVariant}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12}}>
              <MaterialIcons name="info-outline" size={18} color={colors.primary} />
              <AppText role="titleSmall" style={{color: colors.onSurface, fontWeight: '700'}}>
                কিভাবে পেমেন্ট করবেন
              </AppText>
            </View>
            <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginBottom: 14}}>
              ১. পেমেন্ট মেথড সিলেক্ট করুন{'\n'}
              ২. নিচের নম্বরে সেন্ড মানি করুন{'\n'}
              ৩. ট্রানজেকশন আইডি কপি করে ফর্মে দিন{'\n'}
              ৪. সঠিক প্ল্যান সিলেক্ট করে সাবমিট করুন
            </AppText>

            {/* Payment Method Selection */}
            <View style={{flexDirection: 'row', gap: 8, marginBottom: 14}}>
              {(['bkash', 'nagad'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setPaymentMethod(m)}
                  style={{flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: paymentMethod === m ? colors.primaryContainer : colors.surfaceContainerHigh, borderWidth: 1, borderColor: paymentMethod === m ? colors.primary : colors.outlineVariant, alignItems: 'center'}}>
                  <AppText role="labelMedium" style={{color: paymentMethod === m ? colors.primary : colors.onSurfaceVariant, fontWeight: '600', textTransform: 'uppercase'}}>
                    {methodLabel(m)}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>

            {/* Payment Number with Copy */}
            {getPaymentNumber() ? (
              <View style={{backgroundColor: colors.surfaceContainerHigh, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.outlineVariant}}>
                <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginBottom: 6}}>
                  {methodLabel(paymentMethod)} সেন্ড মানি নম্বর:
                </AppText>
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                  <AppText role="headlineMedium" style={{color: colors.onSurface, fontWeight: '800', letterSpacing: 1, fontSize: 22}}>
                    {getPaymentNumber()}
                  </AppText>
                  <TouchableOpacity
                    onPress={() => copyNumber(getPaymentNumber())}
                    style={{backgroundColor: colors.primaryContainer, borderRadius: 10, padding: 10}}>
                    <MaterialIcons name="content-copy" size={22} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{backgroundColor: colors.surfaceContainerHigh, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.outlineVariant}}>
                <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, fontStyle: 'italic'}}>
                  অ্যাডমিন এখনো {methodLabel(paymentMethod)} নম্বর যোগ করেননি
                </AppText>
              </View>
            )}
          </View>
        </View>

        {/* WhatsApp & Telegram - Separate Cards */}
        {adminContact.phone ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(`https://wa.me/88${adminContact.phone}`)}
            style={{marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceContainerLow, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.outlineVariant}}>
            <View style={{width: 44, height: 44, borderRadius: 22, backgroundColor: '#25D36622', alignItems: 'center', justifyContent: 'center'}}>
              <MaterialIcons name="phone" size={22} color="#25D366" />
            </View>
            <View style={{flex: 1}}>
              <AppText role="titleSmall" style={{color: colors.onSurface, fontWeight: '700'}}>
                WhatsApp এ যোগাযোগ
              </AppText>
              <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
                {adminContact.phone}
              </AppText>
            </View>
            <MaterialIcons name="open-in-new" size={18} color={colors.primary} />
          </TouchableOpacity>
        ) : null}

        {adminContact.telegram ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(adminContact.telegram)}
            style={{marginHorizontal: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceContainerLow, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.outlineVariant}}>
            <View style={{width: 44, height: 44, borderRadius: 22, backgroundColor: '#229ED922', alignItems: 'center', justifyContent: 'center'}}>
              <MaterialIcons name="telegram" size={24} color="#229ED9" />
            </View>
            <View style={{flex: 1}}>
              <AppText role="titleSmall" style={{color: colors.onSurface, fontWeight: '700'}}>
                টেলিগ্রাম গ্রুপে যোগ দিন
              </AppText>
              <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
                সপোর্ট ও আপডেটের জন্য
              </AppText>
            </View>
            <MaterialIcons name="open-in-new" size={18} color={colors.primary} />
          </TouchableOpacity>
        ) : null}

        {/* Transaction ID Input */}
        <View style={{marginHorizontal: 16, marginBottom: 20}}>
          <AppText role="titleSmall" style={{color: colors.onSurface, fontWeight: '700', marginBottom: 8}}>
            ট্রানজেকশন আইডি
          </AppText>
          <TextInput
            value={transactionId}
            onChangeText={setTransactionId}
            placeholder="সেন্ড মানি করার পর ট্রানজেকশন আইডি দিন"
            placeholderTextColor={colors.onSurfaceVariant}
            style={{backgroundColor: colors.surfaceContainerLow, borderRadius: 12, padding: 14, color: colors.onSurface, fontSize: 14, borderWidth: 1, borderColor: colors.outlineVariant}}
          />
        </View>

        {/* Packages */}
        <View style={{marginHorizontal: 16, marginBottom: 20}}>
          <AppText role="titleSmall" style={{color: colors.onSurface, fontWeight: '700', marginBottom: 12}}>
            প্ল্যান বাছাই করুন
          </AppText>
          {packages.length === 0 && (
            <AppText role="bodyMedium" style={{color: colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 20}}>
              কোনো প্ল্যান পাওয়া যায়নি
            </AppText>
          )}
          {packages.map(pkg => {
            const isSelected = selectedPkg?.id === pkg.id;
            const monthlyPrice = pkg.duration_days >= 30 ? Math.round(pkg.price / (pkg.duration_days / 30)) : pkg.price;
            return (
              <TouchableOpacity
                key={pkg.id}
                onPress={() => setSelectedPkg(isSelected ? null : pkg)}
                style={{marginBottom: 12, borderRadius: 16, padding: 16, borderWidth: 2, borderColor: isSelected ? colors.primary : colors.outlineVariant, backgroundColor: isSelected ? colors.primaryContainer : colors.surfaceContainerLow}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                  <View style={{flex: 1}}>
                    <AppText role="titleMedium" style={{color: isSelected ? colors.primary : colors.onSurface, fontWeight: '700'}}>
                      {pkg.name}
                    </AppText>
                    <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2}}>
                      {pkg.duration_days} দিন বৈধ
                      {pkg.duration_days >= 30 ? ` • ~৳${monthlyPrice}/মাস` : ''}
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

                {/* Selected: show details */}
                {isSelected && pkg.features && (
                  <View style={{marginTop: 12, borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingTop: 12}}>
                    <AppText role="bodySmall" style={{color: colors.onSurface, fontWeight: '600', marginBottom: 6}}>
                      এই প্ল্যানে যা পাবেন:
                    </AppText>
                    {pkg.features.split(',').map((f, i) => (
                      <View key={i} style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4}}>
                        <MaterialIcons name="check-circle" size={14} color="#10b981" />
                        <AppText role="bodySmall" style={{color: colors.onSurfaceVariant}}>{f.trim()}</AppText>
                      </View>
                    ))}
                    <View style={{marginTop: 10, backgroundColor: colors.surfaceContainerHigh, borderRadius: 10, padding: 10}}>
                      <AppText role="bodySmall" style={{color: colors.onSurfaceVariant}}>
                        পেমেন্ট: {methodLabel(paymentMethod)} • ৳{pkg.price} • {pkg.duration_days} দিন
                      </AppText>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
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
                  সাবমিট করুন — ৳{selectedPkg.price} ({selectedPkg.name})
                </AppText>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Subscription History */}
        {subscriptions.length > 0 && (
          <View style={{marginHorizontal: 16}}>
            <AppText role="titleSmall" style={{color: colors.onSurface, fontWeight: '700', marginBottom: 12}}>
              সাবস্ক্রিপশন ইতিহাস
            </AppText>
            {subscriptions.map(sub => (
              <View key={sub.id} style={{backgroundColor: colors.surfaceContainerLow, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.outlineVariant}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                  <AppText role="bodyMedium" style={{color: colors.onSurface, fontWeight: '600'}}>
                    {sub.package_name} — ৳{sub.amount}
                  </AppText>
                  <View style={{backgroundColor: statusColor(sub.status) + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10}}>
                    <AppText role="labelSmall" style={{color: statusColor(sub.status), fontWeight: '700'}}>
                      {statusLabel(sub.status)}
                    </AppText>
                  </View>
                </View>
                <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 4}}>
                  {methodLabel(sub.payment_method)} • {formatDate(sub.created_at)}
                </AppText>
                {sub.expires_at && sub.status === 'approved' && (
                  <AppText role="bodySmall" style={{color: '#10b981', marginTop: 2}}>
                    সক্রিয় আছে: {formatDate(sub.expires_at)}
                  </AppText>
                )}
                {sub.admin_note && (
                  <AppText role="bodySmall" style={{color: colors.onSurfaceVariant, marginTop: 2, fontStyle: 'italic'}}>
                    নোট: {sub.admin_note}
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
