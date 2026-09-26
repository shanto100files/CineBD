import axios from 'axios';
import {useAuthStore} from '../zustand/authStore';

const API = 'https://cinepix.top/api/app/friends';
const APP_KEY = '78a0e573dfd894d443685159b2e71e2f';

export interface FriendUser {
  id: number;
  username: string;
  avatar_url?: string | null;
  is_online?: number;
}

export interface SearchUser extends FriendUser {
  relation: 'none' | 'friends' | 'request_sent' | 'request_received';
}

export interface IncomingRequest {
  id: number;
  user_id: number;
  username: string;
  avatar_url?: string | null;
}

export interface OutgoingRequest {
  id: number;
  username: string;
  avatar_url?: string | null;
}

export interface FriendsData {
  friends: FriendUser[];
  incoming: IncomingRequest[];
  outgoing: OutgoingRequest[];
  unread: number;
}

export interface ActivityData {
  activity: FriendActivity[];
  recs: FriendRec[];
  activity_visible: number;
}

export interface FriendActivity {
  user_id: number;
  username: string;
  avatar_url?: string | null;
  title: string;
  link: string;
  provider: string;
  image: string;
  progress_seconds: number;
  duration_seconds: number;
  updated_at: string;
}

export interface FriendRec {
  title: string;
  link: string;
  provider: string;
  image: string;
  watchers: number;
  last_watched: string;
}

export interface FriendProfile {
  id: number;
  username: string;
  avatar_url?: string | null;
  is_friend: boolean;
  blocked_by_me: boolean;
  i_am_blocked: boolean;
  shared_to_me: number;
  recent_items: number;
  activity_visible: boolean;
}

export interface ChatMessage {
  id: number;
  mine: boolean;
  message: string;
  is_read: number;
  created_at: string;
}

export interface InboxItem {
  user_id: number;
  username: string;
  avatar_url?: string | null;
  last_message: string;
  last_at: string;
  unread: number;
}

export interface SharedItem {
  id: number;
  sender_id: number;
  sender: string;
  avatar_url?: string | null;
  provider: string;
  link: string;
  title: string;
  poster: string;
  is_read: number;
  created_at: string;
}

function authHeaders() {
  const token = useAuthStore.getState().token;
  return {
    'X-App-Key': APP_KEY,
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  };
}

export const friendsService = {
  async list(): Promise<FriendsData> {
    const res = await axios.get(API, {
      params: {action: 'list'},
      headers: authHeaders(),
      timeout: 10000,
    });
    return res.data;
  },

  async search(q: string): Promise<SearchUser[]> {
    const res = await axios.get(API, {
      params: {action: 'search', q},
      headers: authHeaders(),
      timeout: 10000,
    });
    return res.data.results || [];
  },

  async sendRequest(toId: number): Promise<void> {
    await axios.post(
      API,
      {to: toId},
      {params: {action: 'request'}, headers: authHeaders(), timeout: 10000},
    );
  },

  async respond(requestId: number, accept: boolean): Promise<void> {
    await axios.post(
      API,
      {id: requestId, accept},
      {params: {action: 'respond'}, headers: authHeaders(), timeout: 10000},
    );
  },

  async unfriend(friendId: number): Promise<void> {
    await axios.post(
      API,
      {friend_id: friendId},
      {params: {action: 'unfriend'}, headers: authHeaders(), timeout: 10000},
    );
  },

  async share(
    friendIds: number[],
    content: {link: string; provider: string; title: string; poster: string},
  ): Promise<{sent: number; duplicates: number; skipped: number}> {
    const res = await axios.post(
      API,
      {friends: friendIds, ...content},
      {params: {action: 'share'}, headers: authHeaders(), timeout: 15000},
    );
    return res.data;
  },

  async feed(): Promise<SharedItem[]> {
    const res = await axios.get(API, {
      params: {action: 'feed'},
      headers: authHeaders(),
      timeout: 10000,
    });
    return res.data.items || [];
  },

  async getActivity(): Promise<ActivityData> {
    const res = await axios.get(API, {
      params: {action: 'activity'},
      headers: authHeaders(),
      timeout: 10000,
    });
    return {
      activity: res.data.activity || [],
      recs: res.data.recs || [],
      activity_visible: res.data.activity_visible ?? 0,
    };
  },

  async setActivityVisible(visible: boolean): Promise<void> {
    await axios.post(
      API,
      {visible: visible ? 1 : 0},
      {
        params: {action: 'set_activity_visible'},
        headers: authHeaders(),
        timeout: 10000,
      },
    );
  },

  async markRead(ids?: number[]): Promise<void> {
    await axios.post(
      API,
      ids && ids.length > 0 ? {ids} : {},
      {params: {action: 'mark_read'}, headers: authHeaders(), timeout: 10000},
    );
  },

  // ---- Social: profile / chat / block ----

  async getProfile(userId: number): Promise<FriendProfile> {
    const res = await axios.get(API, {
      params: {action: 'profile', user_id: userId},
      headers: authHeaders(),
      timeout: 10000,
    });
    return res.data;
  },

  async blockUser(userId: number): Promise<void> {
    await axios.post(
      API,
      {user_id: userId},
      {params: {action: 'block'}, headers: authHeaders(), timeout: 10000},
    );
  },

  async unblockUser(userId: number): Promise<void> {
    await axios.post(
      API,
      {user_id: userId},
      {params: {action: 'unblock'}, headers: authHeaders(), timeout: 10000},
    );
  },

  async sendMessage(toId: number, message: string): Promise<void> {
    await axios.post(
      API,
      {to: toId, message},
      {params: {action: 'send_message'}, headers: authHeaders(), timeout: 10000},
    );
  },

  async messages(withId: number): Promise<ChatMessage[]> {
    const res = await axios.get(API, {
      params: {action: 'messages', with: withId},
      headers: authHeaders(),
      timeout: 10000,
    });
    return res.data.items || [];
  },

  async inbox(): Promise<InboxItem[]> {
    const res = await axios.get(API, {
      params: {action: 'inbox'},
      headers: authHeaders(),
      timeout: 10000,
    });
    return res.data.items || [];
  },

  async removeShared(id: number): Promise<void> {
    await axios.post(
      API,
      {id},
      {params: {action: 'remove_shared'}, headers: authHeaders(), timeout: 10000},
    );
  },
};
