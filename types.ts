
export interface GoogleAccount {
  id: string;
  email: string;
  name: string;
  avatar: string;
  accessToken: string;
  lastActionStatus?: 'idle' | 'success' | 'error' | 'loading';
  errorMessage?: string;
}

export interface StreamInfo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  isLive: boolean;
  likeCount?: string;
  viewerCount?: string;
}

export interface ActionLog {
  id: string;
  timestamp: Date;
  accountId: string;
  accountName: string;
  action: string;
  status: 'success' | 'error';
  details: string;
}
