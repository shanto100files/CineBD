import axios from 'axios';
import {useAuthStore} from '../zustand/authStore';

const API = 'https://cinepix.top/api/app/friends';
const APP_KEY = '78a0e573dfd894d443685159b2e71e2f';

export interface FriendUser {
  id: number;
  username: string;
}

export interface SearchUser extends FriendUser {
  relation: 'none' | 'friends' | 'request_sent' | 'request_received';
}

export interface IncomingRequest {
  id: number;
  user_id: number;
  username: string;
}

export interface OutgoingRequest {
  id: number;
  username: string;
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

export interface SharedItem {
  id: number;
  sender_id: number;
  sender: string;
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

  async removeShared(id: number): Promise<void> {
    await axios.post(
      API,
      {id},
      {params: {action: 'remove_shared'}, headers: authHeaders(), timeout: 10000},
    );
  },
};
