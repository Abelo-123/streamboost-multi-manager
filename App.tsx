
import React, { useState, useEffect, useCallback } from 'react';
import { GoogleAccount, StreamInfo, ActionLog } from './types';
import * as youtube from './services/youtubeApi';
import * as gemini from './services/geminiService';
import { 
  UsersIcon, 
  VideoCameraIcon, 
  HandThumbUpIcon, 
  PlusIcon, 
  TrashIcon,
  SparklesIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  XMarkIcon,
  InformationCircleIcon,
  KeyIcon,
  QuestionMarkCircleIcon
} from '@heroicons/react/24/outline';

const App: React.FC = () => {
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [isLiking, setIsLiking] = useState(false);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  
  // OAuth & Setup State
  const [clientId, setClientId] = useState(() => localStorage.getItem('sb_client_id') || '');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    const saved = localStorage.getItem('sb_accounts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAccounts(parsed.map((a: any) => ({ ...a, lastActionStatus: 'idle' })));
      } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sb_accounts', JSON.stringify(accounts));
    localStorage.setItem('sb_client_id', clientId);
  }, [accounts, clientId]);

  const fetchUserProfile = async (token: string) => {
    const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      return {
        name: data.items[0].snippet.title,
        avatar: data.items[0].snippet.thumbnails.default.url
      };
    }
    throw new Error("Could not find YouTube channel for this account.");
  };

  const startOAuthFlow = () => {
    if (!clientId) {
      alert("Please enter your Google Client ID in the setup guide first!");
      setShowSetup(true);
      return;
    }

    // @ts-ignore
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl',
      callback: async (response: any) => {
        if (response.access_token) {
          try {
            const profile = await fetchUserProfile(response.access_token);
            const newAccount: GoogleAccount = {
              id: Math.random().toString(36).substr(2, 9),
              email: "Connected Channel",
              name: profile.name,
              avatar: profile.avatar,
              accessToken: response.access_token,
              lastActionStatus: 'idle'
            };
            setAccounts(prev => [...prev, newAccount]);
            setShowAddForm(false);
          } catch (err: any) {
            alert("Error: " + err.message);
          }
        }
      },
    });
    client.requestAccessToken();
  };

  const handleFetchStream = async () => {
    const videoId = youtube.extractVideoId(streamUrl);
    if (!videoId) return alert("Invalid URL");
    setIsLoadingStream(true);
    setStreamInfo(null);
    try {
      const info = await youtube.fetchStreamInfo(videoId, process.env.API_KEY || '');
      setStreamInfo(info);
      const analysis = await gemini.analyzeStream(info.title, info.channelTitle);
      setAiAnalysis(analysis);
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsLoadingStream(false);
    }
  };

  const handleMultiLike = async () => {
    if (!streamInfo || accounts.length === 0) return;
    setIsLiking(true);
    setProgress({ current: 0, total: accounts.length });
    
    const updatedAccounts = [...accounts];
    for (let i = 0; i < updatedAccounts.length; i++) {
      const acc = { ...updatedAccounts[i] };
      acc.lastActionStatus = 'loading';
      setAccounts(prev => prev.map(a => a.id === acc.id ? acc : a));
      setProgress(prev => ({ ...prev, current: i + 1 }));

      try {
        await youtube.rateVideo(streamInfo.videoId, acc.accessToken, 'like');
        acc.lastActionStatus = 'success';
      } catch (err: any) {
        acc.lastActionStatus = 'error';
        acc.errorMessage = err.message;
      }
      setAccounts(prev => prev.map(a => a.id === acc.id ? acc : a));
    }
    setIsLiking(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-screen">
      {/* Sidebar */}
      <div className="lg:col-span-4 space-y-6">
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <UsersIcon className="w-6 h-6 text-red-500" />
              Accounts ({accounts.length})
            </h2>
            <div className="flex gap-2">
              <button onClick={() => setShowSetup(!showSetup)} className="p-2 text-gray-400 hover:text-white transition-colors" title="Setup Guide">
                <QuestionMarkCircleIcon className="w-6 h-6" />
              </button>
              <button onClick={() => setShowAddForm(!showAddForm)} className="bg-red-600 p-2 rounded-full hover:bg-red-700 transition-colors">
                <PlusIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {showSetup && (
            <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-4 text-xs">
              <h3 className="font-bold flex items-center gap-2 text-blue-400 uppercase tracking-wider">
                <KeyIcon className="w-4 h-4" /> Real Mode Setup
              </h3>
              <div className="space-y-2 text-gray-300">
                <p>1. Go to <a href="https://console.cloud.google.com/" target="_blank" className="text-blue-400 underline">Google Cloud Console</a></p>
                <p>2. Create a Project & enable <b>YouTube Data API v3</b></p>
                <p>3. Create <b>OAuth Client ID</b> (Web application)</p>
                <p>4. Add your current URL to <b>Authorized JavaScript origins</b></p>
              </div>
              <input 
                type="text" 
                placeholder="Paste Client ID here..."
                className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 focus:border-blue-500 outline-none"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
              />
              <button onClick={() => setShowSetup(false)} className="w-full bg-blue-600 py-2 rounded font-bold">Save Config</button>
            </div>
          )}

          {showAddForm && (
            <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
              <p className="text-xs text-gray-400 text-center">Click below to log in with a Google account to add it to the manager.</p>
              <button 
                onClick={startOAuthFlow}
                className="w-full bg-white text-black py-3 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-gray-200 transition-colors"
              >
                <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5" alt=""/>
                Connect Google Account
              </button>
              <button 
                onClick={() => {
                  setAccounts(prev => [...prev, {
                    id: Math.random().toString(),
                    name: "Demo User",
                    email: "demo@example.com",
                    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=demo",
                    accessToken: "mock_token",
                    lastActionStatus: 'idle'
                  }]);
                  setShowAddForm(false);
                }}
                className="w-full border border-white/10 py-2 rounded-xl text-xs text-gray-500 hover:bg-white/5"
              >
                Add Demo Account (Testing)
              </button>
            </div>
          )}

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {accounts.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-10">No accounts connected.</p>
            ) : (
              accounts.map(acc => (
                <div key={acc.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 group">
                  <img src={acc.avatar} className="w-10 h-10 rounded-full" alt="" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{acc.name}</p>
                    <p className="text-[10px] text-gray-500 truncate uppercase tracking-tighter">Authorized</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {acc.lastActionStatus === 'loading' && <ArrowPathIcon className="w-5 h-5 text-blue-400 animate-spin" />}
                    {acc.lastActionStatus === 'success' && <CheckCircleIcon className="w-5 h-5 text-green-400" />}
                    {acc.lastActionStatus === 'error' && <ExclamationCircleIcon className="w-5 h-5 text-red-400" />}
                    <button onClick={() => setAccounts(accounts.filter(a => a.id !== acc.id))} className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Logs */}
        <div className="glass-panel p-6 rounded-2xl flex-1 max-h-[300px] overflow-hidden flex flex-col">
          <h3 className="font-bold text-sm mb-4">Live Execution Feed</h3>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
            {accounts.some(a => a.lastActionStatus === 'error') && (
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400">
                Some actions failed. Check if access tokens are still valid.
              </div>
            )}
            <p className="text-[10px] text-gray-600 italic">Logs will appear here during execution...</p>
          </div>
        </div>
      </div>

      {/* Main Panel */}
      <div className="lg:col-span-8 flex flex-col gap-8">
        <div className="glass-panel p-8 rounded-3xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-red-600 p-2 rounded-lg shadow-xl shadow-red-600/20">
              <VideoCameraIcon className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Stream Manager</h1>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <input 
              type="text" 
              placeholder="Paste YouTube Live URL..."
              className="flex-1 bg-black/50 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-red-500"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
            />
            <button 
              onClick={handleFetchStream}
              disabled={isLoadingStream}
              className="bg-white text-black px-8 py-4 rounded-2xl font-black uppercase text-sm hover:bg-gray-200 transition-all disabled:opacity-50"
            >
              {isLoadingStream ? 'Loading...' : 'Load Stream'}
            </button>
          </div>

          {streamInfo && (
            <div className="grid md:grid-cols-12 gap-8 items-start animate-in fade-in slide-in-from-bottom-4">
              <div className="md:col-span-7">
                <img src={streamInfo.thumbnail} className="w-full aspect-video rounded-2xl object-cover shadow-2xl border border-white/10" alt="" />
                <h3 className="mt-4 text-xl font-bold">{streamInfo.title}</h3>
                <p className="text-gray-400 text-sm">{streamInfo.channelTitle}</p>
              </div>
              <div className="md:col-span-5 bg-white/5 border border-white/10 p-6 rounded-2xl space-y-4">
                <button 
                  onClick={handleMultiLike}
                  disabled={isLiking || accounts.length === 0}
                  className="w-full stream-gradient py-5 rounded-2xl font-black uppercase text-sm shadow-xl flex flex-col items-center justify-center gap-1 disabled:opacity-40"
                >
                  <HandThumbUpIcon className="w-6 h-6" />
                  Like with {accounts.length} Profiles
                </button>
                {isLiking && (
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 transition-all" style={{ width: `${(progress.current/progress.total)*100}%` }} />
                  </div>
                )}
                {!clientId && (
                  <div className="flex items-center gap-2 text-yellow-500 text-[10px] bg-yellow-500/10 p-2 rounded border border-yellow-500/20">
                    <InformationCircleIcon className="w-4 h-4" />
                    Real logins require Client ID (see Setup Guide).
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI Section */}
        {streamInfo && (
          <div className="glass-panel p-8 rounded-3xl border-l-4 border-l-purple-500 animate-in fade-in">
            <h4 className="text-purple-400 font-black uppercase tracking-widest text-xs mb-4 flex items-center gap-2">
              <SparklesIcon className="w-4 h-4" /> AI Strategy
            </h4>
            <p className="text-sm italic text-gray-300 leading-relaxed">
              {aiAnalysis || "Generating analysis..."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
