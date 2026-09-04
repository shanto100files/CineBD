import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform} from 'react-native';
import {useAuthStore} from '../lib/zustand/authStore';
import {useM3Colors} from '../theme/M3PaletteContext';

export default function RegisterScreen({navigation}: any) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
      navigation.goBack();
    } else {
      setError(result.error || 'Registration failed');
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, {backgroundColor: colors.background}]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.card}>
        <View style={[styles.logoBox, {backgroundColor: colors.primary}]}>
          <Text style={styles.logoText}>CP</Text>
        </View>
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
