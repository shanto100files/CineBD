import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image} from 'react-native';
import {useAuthStore} from '../lib/zustand/authStore';
import {useM3Colors} from '../theme/M3PaletteContext';
import MaterialDialogSurface from '../components/ui/MaterialDialogSurface';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function RegisterScreen({navigation}: any) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCelebrate, setShowCelebrate] = useState(false);
  const [celebrateName, setCelebrateName] = useState('');
  const register = useAuthStore(s => s.register);
  const colors = useM3Colors();

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password) {
      setError('Please fill all fields');
      return;
    }
    setLoading(true);
    setError('');
    const result = await register(username.trim(), email.trim(), password);
    setLoading(false);
    if (result.success) {
      // Celebration dialog; the Back button returns to the previous page.
      setCelebrateName(username.trim());
      setShowCelebrate(true);
    } else {
      setError(result.error || 'Registration failed');
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, {backgroundColor: colors.background}]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.card}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={[styles.title, {color: colors.onBackground}]}>Create Account</Text>
        <Text style={[styles.subtitle, {color: colors.onSurfaceVariant}]}>Join Cinepix</Text>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        <TextInput style={[styles.input, {backgroundColor: colors.surfaceContainer, color: colors.onSurface, borderColor: colors.outline}]}
          placeholder="Username" placeholderTextColor={colors.onSurfaceVariant} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />

        <TextInput style={[styles.input, {backgroundColor: colors.surfaceContainer, color: colors.onSurface, borderColor: colors.outline}]}
          placeholder="Email" placeholderTextColor={colors.onSurfaceVariant} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />

        <TextInput style={[styles.input, {backgroundColor: colors.surfaceContainer, color: colors.onSurface, borderColor: colors.outline}]}
          placeholder="Password" placeholderTextColor={colors.onSurfaceVariant} value={password} onChangeText={setPassword} secureTextEntry />

        <TouchableOpacity style={[styles.btn, {backgroundColor: colors.primary}]} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.btnText, {color: colors.onPrimary}]}>Register</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={{marginTop: 12}}>
          <Text style={{color: colors.primary, fontSize: 14}}>Already have an account? Login</Text>
        </TouchableOpacity>
      </View>

      <MaterialDialogSurface
        visible={showCelebrate}
        dismissible={false}
        onDismiss={() => {}}>
        <View style={{alignItems: 'center', gap: 10}}>
          <Text style={{fontSize: 52}}>🎉</Text>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
            <Text style={{color: colors.onSurface, fontSize: 20, fontWeight: '800'}}>
              Registration Successful!
            </Text>
          </View>
          <Text style={{color: colors.onSurfaceVariant, fontSize: 14, textAlign: 'center'}}>
            স্বাগতম{celebrateName ? `, ${celebrateName}` : ''}! আপনার একাউন্ট তৈরি হয়েছে।
          </Text>
          <TouchableOpacity
            style={[styles.celebrateBtn, {backgroundColor: colors.primary}]}
            onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={colors.onPrimary} />
            <Text style={{color: colors.onPrimary, fontSize: 15, fontWeight: '700'}}>Back</Text>
          </TouchableOpacity>
        </View>
      </MaterialDialogSurface>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24},
  card: {width: '100%', maxWidth: 380, alignItems: 'center', gap: 12},
  logoImage: {width: 180, height: 180, marginBottom: 8},
  title: {fontSize: 28, fontWeight: '800'},
  subtitle: {fontSize: 14, marginBottom: 16},
  errorBox: {width: '100%', padding: 12, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)'},
  errorText: {color: '#ef4444', fontSize: 13, textAlign: 'center'},
  input: {width: '100%', padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 15},
  btn: {width: '100%', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 4},
  btnText: {fontSize: 16, fontWeight: '700'},
  celebrateBtn: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24, marginTop: 8},
});
