import {create} from 'zustand';
import {MMKV} from '../Mmkv';
import axios from 'axios';

const API = 'https://cinepix.top/api/app';

interface User {
  id: number;
  username: string;
  email: string;
  premium: boolean;
  is_admin: boolean;
  watchlist_count?: number;
  member_since?: string;
  avatar_url?: string | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  isPremium: boolean;
  premiumJustActivated: boolean;
  login: (username: string, password: string) => Promise<{success: boolean; error?: string}>;
  register: (username: string, email: string, password: string) => Promise<{success: boolean; error?: string}>;
  logout: () => void;
  loadToken: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateEmail: (email: string) => Promise<{success: boolean; error?: string}>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{success: boolean; error?: string}>;
  uploadAvatar: (uri: string, mimeType?: string) => Promise<{success: boolean; error?: string; url?: string}>;
  removeAvatar: () => Promise<{success: boolean; error?: string}>;
  dismissPremiumAlert: () => void;
}

const authStorage = {
  getString: (key: string) => MMKV.getString(`auth:${key}`) || null,
  setString: (key: string, value: string) => MMKV.setString(`auth:${key}`, value),
  delete: (key: string) => MMKV.removeItem(`auth:${key}`),
};

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isLoading: true,
  isLoggedIn: false,
  isPremium: false,
  premiumJustActivated: false,

  login: async (username, password) => {
    try {
      const res = await axios.post(`${API}/login`, {username, password}, {timeout: 10000});
      if (res.data.token) {
        authStorage.setString('token', res.data.token);
        authStorage.setString('user', JSON.stringify(res.data.user));
        set({
          token: res.data.token,
          user: res.data.user,
          isLoggedIn: true,
          isPremium: res.data.user.premium,
        });
        setTimeout(() => get().refreshProfile(), 2000);
        return {success: true};
      }
      return {success: false, error: res.data.error || 'Login failed'};
    } catch (e: any) {
      return {success: false, error: e.response?.data?.error || 'Network error'};
    }
  },

  register: async (username, email, password) => {
    try {
      const res = await axios.post(`${API}/register`, {username, email, password}, {timeout: 10000});
      if (res.data.token) {
        authStorage.setString('token', res.data.token);
        authStorage.setString('user', JSON.stringify(res.data.user));
        set({
          token: res.data.token,
          user: res.data.user,
          isLoggedIn: true,
          isPremium: res.data.user.premium,
        });
        return {success: true};
      }
      return {success: false, error: res.data.error || 'Registration failed'};
    } catch (e: any) {
      return {success: false, error: e.response?.data?.error || 'Network error'};
    }
  },

  logout: () => {
    authStorage.delete('token');
    authStorage.delete('user');
    set({token: null, user: null, isLoggedIn: false, isPremium: false, premiumJustActivated: false});
  },

  dismissPremiumAlert: () => {
    set({premiumJustActivated: false});
  },

  loadToken: async () => {
    try {
      const token = authStorage.getString('token');
      const userStr = authStorage.getString('user');
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);
          set({token, user, isLoggedIn: true, isPremium: user.premium, isLoading: false});
        } catch {
          authStorage.delete('token');
          authStorage.delete('user');
          set({isLoading: false});
        }
      } else {
        set({isLoading: false});
      }
    } catch {
      set({isLoading: false});
    }
  },

  refreshProfile: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const res = await axios.get(`${API}/profile`, {
        headers: {Authorization: `Bearer ${token}`},
        timeout: 8000,
      });
      if (res.data.id) {
        const user = res.data;
        const wasPremium = get().isPremium;
        authStorage.setString('user', JSON.stringify(user));
        set({user, isPremium: user.premium});
        if (!wasPremium && user.premium) {
          set({premiumJustActivated: true});
        }
      }
    } catch {}
  },

  updateEmail: async email => {
    const token = get().token;
    if (!token) return {success: false, error: 'Not logged in'};
    try {
      const res = await axios.post(
        `${API}/update-email`,
        {email},
        {headers: {Authorization: `Bearer ${token}`}, timeout: 10000},
      );
      if (res.data.ok) {
        const user = {...get().user, email: res.data.email} as User;
        authStorage.setString('user', JSON.stringify(user));
        set({user});
        return {success: true};
      }
      return {success: false, error: res.data.error || 'Failed to update email'};
    } catch (e: any) {
      return {success: false, error: e.response?.data?.error || 'Network error'};
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    const token = get().token;
    if (!token) return {success: false, error: 'Not logged in'};
    try {
      const res = await axios.post(
        `${API}/change-password`,
        {current_password: currentPassword, new_password: newPassword},
        {headers: {Authorization: `Bearer ${token}`}, timeout: 10000},
      );
      if (res.data.ok) {
        return {success: true};
      }
      return {success: false, error: res.data.error || 'Failed to change password'};
    } catch (e: any) {
      return {success: false, error: e.response?.data?.error || 'Network error'};
    }
  },

  uploadAvatar: async (uri, mimeType) => {
    const token = get().token;
    if (!token) return {success: false, error: 'Not logged in'};
    try {
      const name = uri.split('/').pop() || 'avatar.jpg';
      const form = new FormData();
      form.append('avatar', {
        uri,
        name,
        type: mimeType || 'image/jpeg',
      } as any);
      const res = await axios.post(`${API}/avatar`, form, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000,
      });
      if (res.data.ok) {
        const user = {...get().user, avatar_url: res.data.avatar_url} as User;
        authStorage.setString('user', JSON.stringify(user));
        set({user});
        return {success: true, url: res.data.avatar_url};
      }
      return {success: false, error: res.data.error || 'Failed to upload avatar'};
    } catch (e: any) {
      return {success: false, error: e.response?.data?.error || 'Network error'};
    }
  },

  removeAvatar: async () => {
    const token = get().token;
    if (!token) return {success: false, error: 'Not logged in'};
    try {
      const res = await axios.delete(`${API}/avatar`, {
        headers: {Authorization: `Bearer ${token}`},
        timeout: 10000,
      });
      if (res.data.ok) {
        const user = {...get().user, avatar_url: null} as User;
        authStorage.setString('user', JSON.stringify(user));
        set({user});
        return {success: true};
      }
      return {success: false, error: res.data.error || 'Failed to remove avatar'};
    } catch (e: any) {
      return {success: false, error: e.response?.data?.error || 'Network error'};
    }
  },
}));
