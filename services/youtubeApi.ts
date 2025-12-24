
import { StreamInfo } from '../types';

export const extractVideoId = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

export const fetchStreamInfo = async (videoId: string, apiKey: string): Promise<StreamInfo> => {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,statistics&id=${videoId}&key=${apiKey}`);

  if (!response.ok) {
    const errorData = await response.json();
    console.error('YouTube API Error:', errorData);
    throw new Error(errorData.error?.message || 'Failed to fetch video info');
  }

  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    throw new Error('Video not found or is private');
  }

  const item = data.items[0];
  return {
    videoId: item.id,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.maxres?.url || item.snippet.thumbnails.high.url,
    isLive: !!item.liveStreamingDetails,
    likeCount: item.statistics?.likeCount,
    viewerCount: item.liveStreamingDetails?.concurrentViewers || item.statistics?.viewCount
  };
};

export const rateVideo = async (videoId: string, accessToken: string, rating: 'like' | 'dislike' | 'none'): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos/rate?id=${videoId}&rating=${rating}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    const status = response.status;

    if (status === 401) throw new Error('TOKEN_EXPIRED');
    if (status === 403) throw new Error('PERMISSION_DENIED: ' + (errorData.error?.message || 'Check scopes'));

    throw new Error(errorData.error?.message || `Error ${status}`);
  }
};
