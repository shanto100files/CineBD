import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform} from 'react-native';
import {useAuthStore} from '../lib/zustand/authStore';
import {useM3Colors} from '../lib/theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore(s => s.login);
  const colors = useM3Colors();

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setError('Please enter username and password');
      return;
    }
    setLoading(true);
    setError('');
    const result = await login(username.trim(), password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Login failed');
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, {backgroundColor: colors.background}]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.card}>
        <View style={[styles.logoBox, {backgroundColor: colors.primary}]}>
          <Text style={styles.logoText}>CP</Text>
        </View>
        <Text style={[styles.title, {color: colors.onBackground}]}>Cinepix</Text>
        <Text style={[styles.subtitle, {color: colors.onSurfaceVariant}]}>Login to continue</Text>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        <TextInput style={[styles.input, {backgroundColor: colors.surfaceContainer, color: colors.onSurface, borderColor: colors.outline}]}
          placeholder="Username" placeholderTextColor={colors.onSurfaceVariant} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />

        <TextInput style={[styles.input, {backgroundColor: colors.surfaceContainer, color: colors.onSurface, borderColor: colors.outline}]}
          placeholder="Password" placeholderTextColor={colors.onSurfaceVariant} value={password} onChangeText={setPassword} secureTextEntry />

        <TouchableOpacity style={[styles.btn, {backgroundColor: colors.primary}]} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.btnText, {color: colors.onPrimary}]}>Login</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24},
  card: {width: '100%', maxWidth: 380, alignItems: 'center', gap: 12},
  logoBox: {width: 72, height: 72, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8},
  logoText: {color: '#fff', fontSize: 28, fontWeight: '800'},
  title: {fontSize: 28, fontWeight: '800'},
  subtitle: {fontSize: 14, marginBottom: 16},
  errorBox: {width: '100%', padding: 12, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)'},
  errorText: {color: '#ef4444', fontSize: 13, textAlign: 'center'},
  input: {width: '100%', padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 15},
  btn: {width: '100%', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 4},
  btnText: {fontSize: 16, fontWeight: '700'},
});
