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
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  isPremium: boolean;
  login: (username: string, password: string) => Promise<{success: boolean; error?: string}>;
  logout: () => void;
  loadToken: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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
        return {success: true};
      }
      return {success: false, error: res.data.error || 'Login failed'};
    } catch (e: any) {
      return {success: false, error: e.response?.data?.error || 'Network error'};
    }
  },

  logout: () => {
    authStorage.delete('token');
    authStorage.delete('user');
    set({token: null, user: null, isLoggedIn: false, isPremium: false});
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
        authStorage.setString('user', JSON.stringify(user));
        set({user, isPremium: user.premium});
      }
    } catch {}
  },
}));
