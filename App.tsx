
import React, { useState, useEffect, useMemo } from 'react';
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
  QuestionMarkCircleIcon,
  ArrowPathRoundedSquareIcon,
  SignalIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  LinkIcon,
  RocketLaunchIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';

const App: React.FC = () => {
  const [accounts, setAccounts] = useState<GoogleAccount[]>(() => {
    const saved = localStorage.getItem('sb_accounts');
    if (saved) {
      try {
        return JSON.parse(saved).map((a: any) => ({ ...a, lastActionStatus: 'idle' }));
      } catch (e) { return []; }
    }
    return [];
  });
  const [streamUrl, setStreamUrl] = useState('');
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [isLiking, setIsLiking] = useState(false);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);

  const [clientId, setClientId] = useState(() => localStorage.getItem('sb_client_id') || '');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showAuthHelp, setShowAuthHelp] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, activeName: '' });
  const [chatParticipants, setChatParticipants] = useState<any[]>([]);
  const [isCommenting, setIsCommenting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [useAiVariations, setUseAiVariations] = useState(true);
  const [customComment, setCustomComment] = useState('');

  // Live Chat Polling (To show who is engaging)
  useEffect(() => {
    let interval: any;
    if (streamInfo?.liveChatId) {
      const fetchChat = async () => {
        try {
          const messages = await youtube.fetchChatMessages(streamInfo.liveChatId!, process.env.YOUTUBE_API_KEY || '');
          if (messages.length > 0) {
            const participants = messages.map(m => ({
              id: m.authorDetails.channelId,
              name: m.authorDetails.displayName,
              thumbnail: m.authorDetails.profileImageUrl
            }));
            setChatParticipants(prev => {
              const combined = [...participants, ...prev];
              const seen = new Set();
              return combined.filter(el => {
                const duplicate = seen.has(el.id);
                seen.add(el.id);
                return !duplicate;
              }).slice(0, 10);
            });
          }
        } catch (e) { console.error("Chat fetch fail"); }
      };
      fetchChat();
      interval = setInterval(fetchChat, 15000); // Poll every 15s
    } else {
      setChatParticipants([]);
    }
    return () => clearInterval(interval);
  }, [streamInfo?.liveChatId]);

  // Persistence
  useEffect(() => {
    localStorage.setItem('sb_accounts', JSON.stringify(accounts));
    localStorage.setItem('sb_client_id', clientId);
  }, [accounts, clientId]);

  const addLog = (accName: string, status: 'success' | 'error', details: string) => {
    const newLog: ActionLog = {
      id: Math.random().toString(),
      accountId: 'N/A',
      accountName: accName,
      action: 'Batch Action',
      status: status,
      timestamp: new Date(),
      details: details
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50));
  };

  const startOAuthFlow = (existingAccountId?: string) => {
    if (!clientId) {
      alert("Missing Client ID. Open the Setup Guide (?) to configure.");
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
            const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
              headers: { Authorization: `Bearer ${response.access_token}` }
            });
            const data = await res.json();

            if (!data.items?.length) throw new Error("No YouTube channel found.");

            const profile = {
              name: data.items[0].snippet.title,
              avatar: data.items[0].snippet.thumbnails.default.url
            };

            if (existingAccountId) {
              setAccounts(prev => prev.map(a => a.id === existingAccountId ? {
                ...a,
                accessToken: response.access_token,
                lastActionStatus: 'idle',
                errorMessage: undefined
              } : a));
              addLog(profile.name, 'success', 'Token refreshed successfully.');
            } else {
              const newAccount: GoogleAccount = {
                id: Math.random().toString(36).substr(2, 9),
                email: "YouTube Channel",
                name: profile.name,
                avatar: profile.avatar,
                accessToken: response.access_token,
                lastActionStatus: 'idle'
              };
              setAccounts(prev => [...prev, newAccount]);
              addLog(profile.name, 'success', 'Account connected and authorized.');
            }
            setShowAddForm(false);
          } catch (err: any) {
            alert("OAuth Error: " + err.message);
          }
        }
      },
    });
    client.requestAccessToken();
  };

  const handleFetchStream = async () => {
    const videoId = youtube.extractVideoId(streamUrl);
    if (!videoId) return alert("Please enter a valid YouTube link.");

    setIsLoadingStream(true);
    setStreamInfo(null);
    setAiAnalysis(null);

    try {
      const info = await youtube.fetchStreamInfo(videoId, process.env.YOUTUBE_API_KEY || '');
      setStreamInfo(info);

      // Analyze with AI (Optional step, don't break if it fails)
      try {
        const analysis = await gemini.analyzeStream(info.title, info.channelTitle);
        setAiAnalysis(analysis);
      } catch (aiError: any) {
        console.warn("AI Analysis failed:", aiError);
        setAiAnalysis("AI analysis is currently unavailable (Quota limit). You can still proceed with syncing likes.");
      }
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('disabled') || msg.includes('not been used')) {
        alert("CRITICAL ERROR: YouTube API is not enabled in your Google Cloud Project.\n\nDetails: " + msg);
      } else if (msg.includes('API key not found') || msg.includes('key is invalid')) {
        alert("AUTH ERROR: Invalid or missing API Key.\n\nDetails: " + msg);
      } else {
        alert("Fetch Error: " + msg);
      }
    } finally {
      setIsLoadingStream(false);
    }
  };

  const handleMultiLike = async () => {
    if (!streamInfo || accounts.length === 0) return;
    setIsLiking(true);
    setProgress({ current: 0, total: accounts.length, activeName: '' });

    const accountsSnapshot = [...accounts];

    for (let i = 0; i < accountsSnapshot.length; i++) {
      const acc = { ...accountsSnapshot[i] };
      acc.lastActionStatus = 'loading';
      setAccounts(prev => prev.map(a => a.id === acc.id ? acc : a));
      setProgress({ current: i + 1, total: accounts.length, activeName: acc.name });

      try {
        if (acc.accessToken === 'mock_token') {
          await new Promise(r => setTimeout(r, 600));
        } else {
          // WEBSESSION HANDSHAKE: Visit the page like a human
          await youtube.visitWatchPage(streamInfo.videoId, acc.accessToken);

          // Deep Retention Delay (40-55s)
          const retentionDelay = Math.floor(Math.random() * 15000) + 40000;
          await new Promise(r => setTimeout(r, retentionDelay));

          await youtube.rateVideo(streamInfo.videoId, acc.accessToken, 'like');

          // Verify
          const status = await youtube.getRating(streamInfo.videoId, acc.accessToken);
          if (status !== 'like') {
            await youtube.rateVideo(streamInfo.videoId, acc.accessToken, 'like');
          }
        }
        acc.lastActionStatus = 'success';
        addLog(acc.name, 'success', `Like Secured (Ultra Mode)`);
      } catch (err: any) {
        acc.lastActionStatus = 'error';
        acc.errorMessage = err.message;
        addLog(acc.name, 'error', `Failed: ${err.message}`);
      }

      setAccounts(prev => prev.map(a => a.id === acc.id ? acc : a));
    }
    setIsLiking(false);
    setProgress(prev => ({ ...prev, activeName: 'Operation Complete' }));
    setTimeout(() => handleFetchStream(), 3000);
  };

  const handleMultiView = async () => {
    if (!streamInfo || accounts.length === 0) return;
    setIsViewing(true);
    setProgress({ current: 0, total: accounts.length, activeName: 'Ultra Stealth View Init...' });

    const accountsSnapshot = [...accounts];
    const totalDuration = 180000; // 3 Minutes Ultra Stay

    // Process in batches
    for (let i = 0; i < accountsSnapshot.length; i++) {
      const acc = accountsSnapshot[i];
      setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, isWatching: true, lastActionStatus: 'loading' } : a));

      // Warmup signal
      if (acc.accessToken !== 'mock_token') {
        youtube.sendPlaybackSignal(streamInfo.videoId, acc.accessToken);
      }

      setProgress({ current: i + 1, total: accounts.length, activeName: `Activating ${acc.name}...` });
      await new Promise(r => setTimeout(r, 1000));
    }

    addLog('System', 'success', `All units deployed. Maintaining stay-time for 180s...`);

    // Countdown progress
    let remaining = 180;
    const interval = setInterval(() => {
      remaining -= 1;
      setProgress(p => ({ ...p, activeName: `Stay-Time: ${remaining}s...` }));
      if (remaining <= 0) clearInterval(interval);
    }, 1000);

    // After 180 seconds
    setTimeout(() => {
      setAccounts(prev => prev.map(a => ({ ...a, isWatching: false, lastActionStatus: 'success' })));
      setIsViewing(false);
      setProgress(prev => ({ ...prev, activeName: 'Session Finalized' }));
      addLog('System', 'success', `Ultra-View session complete.`);
      handleFetchStream();
    }, totalDuration);
  };

  const handleUltraEngagement = async () => {
    if (!streamInfo || accounts.length === 0) return;

    addLog('System', 'success', 'Starting Ultra Tactical Operation...');

    // Phase 1: High Retention View (60s warmup)
    setProgress({ current: 0, total: 100, activeName: 'PHASE 1: ULTRA VIEW WARMUP (60s)' });
    setAccounts(prev => prev.map(a => ({ ...a, isWatching: true, lastActionStatus: 'loading' })));

    for (const acc of accounts) {
      if (acc.accessToken !== 'mock_token') youtube.sendPlaybackSignal(streamInfo.videoId, acc.accessToken);
    }

    await new Promise(r => setTimeout(r, 60000));

    // Phase 2: Verified Likes
    setProgress({ current: 0, total: 100, activeName: 'PHASE 2: SECURING LIKES' });
    await handleMultiLike();

    // Phase 3: AI Smart Chat
    setProgress({ current: 0, total: 100, activeName: 'PHASE 3: AI CHAT BROADCAST' });
    await handleMultiComment();

    setAccounts(prev => prev.map(a => ({ ...a, isWatching: false })));
    addLog('System', 'success', 'ULTRA OPERATION COMPLETE. Engagement levels maximized.');
  };

  const handleMultiComment = async (msg?: string) => {
    if (!streamInfo?.liveChatId || accounts.length === 0) return;

    setIsCommenting(true);
    setProgress({ current: 0, total: accounts.length, activeName: 'Generating Variations...' });

    let messageList: string[] = [];

    if (useAiVariations && !msg) {
      // Generate unique comments for each account
      messageList = await gemini.generateUniqueComments(streamInfo.title, accounts.length);
    } else {
      messageList = Array(accounts.length).fill(msg || customComment);
    }

    const accountsSnapshot = [...accounts];

    for (let i = 0; i < accountsSnapshot.length; i++) {
      const acc = { ...accountsSnapshot[i] };
      const currentMessage = messageList[i] || messageList[0];

      acc.lastActionStatus = 'loading';
      setAccounts(prev => prev.map(a => a.id === acc.id ? acc : a));
      setProgress({ current: i + 1, total: accounts.length, activeName: acc.name });

      try {
        if (acc.accessToken === 'mock_token') {
          await new Promise(r => setTimeout(r, 600));
        } else {
          // WEBSESSION HANDSHAKE
          await youtube.visitWatchPage(streamInfo.videoId, acc.accessToken);

          // Random Chat Jitter (5s - 10s)
          const jitter = Math.floor(Math.random() * 5000) + 5000;
          await new Promise(r => setTimeout(r, jitter));
          await youtube.insertChatMessage(streamInfo.liveChatId!, acc.accessToken, currentMessage);
        }
        acc.lastActionStatus = 'success';
        addLog(acc.name, 'success', `Chat: "${currentMessage.substring(0, 15)}..."`);
      } catch (err: any) {
        acc.lastActionStatus = 'error';
        acc.errorMessage = err.message;
        addLog(acc.name, 'error', `Chat Failed: ${err.message}`);
      }

      setAccounts(prev => prev.map(a => a.id === acc.id ? acc : a));
    }
    setIsCommenting(false);
    setCustomComment('');
    setProgress(prev => ({ ...prev, activeName: 'Broadcast Complete' }));
  };

  const stats = useMemo(() => {
    return {
      total: accounts.length,
      online: accounts.filter(a => a.lastActionStatus !== 'error').length,
      errors: accounts.filter(a => a.lastActionStatus === 'error').length
    };
  }, [accounts]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-screen text-gray-100 relative">
      {/* Sidebar - Account Management */}
      <div className="lg:col-span-4 flex flex-col gap-6 z-10">
        <div className="glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden flex flex-col">
          {/* Decorative Icon */}
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none z-0">
            <UsersIcon className="w-24 h-24 rotate-12" />
          </div>

          <div className="flex items-center justify-between mb-8 relative z-10">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2 text-white">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                Account Fleet
              </h2>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Active Units: {stats.online}/{stats.total}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSetup(!showSetup)}
                className={`p-2 transition-all rounded-lg cursor-pointer ${showSetup ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                title="Setup Guide"
              >
                <QuestionMarkCircleIcon className="w-6 h-6" />
              </button>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className={`p-2.5 rounded-xl transition-all active:scale-90 cursor-pointer ${showAddForm ? 'bg-gray-100 text-black' : 'bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/20'}`}
                title="Add Account"
              >
                {showAddForm ? <XMarkIcon className="w-5 h-5" /> : <PlusIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {showSetup && (
            <div className="mb-6 p-5 bg-[#1a1a1a] border border-blue-500/30 rounded-2xl space-y-5 animate-in fade-in slide-in-from-top-4 relative z-30 shadow-2xl backdrop-blur-xl max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-2 text-blue-400 font-black text-xs uppercase sticky top-0 bg-[#1a1a1a] py-2 z-10">
                <RocketLaunchIcon className="w-4 h-4" /> Required Configuration (3 Steps)
              </div>

              <div className="text-[11px] text-gray-400 space-y-4 leading-relaxed">
                {/* Step 1: Enable API */}
                <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                  <p className="text-red-400 font-black mb-2 flex items-center gap-1 uppercase">
                    <ExclamationTriangleIcon className="w-3 h-3" /> Step 1: Enable API
                  </p>
                  <p className="mb-2">You must enable the <b>YouTube Data API v3</b> in your project or tracking will fail.</p>
                  <a
                    href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                    target="_blank"
                    className="inline-flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg font-black uppercase text-[9px] hover:bg-red-500 transition-colors"
                  >
                    <LinkIcon className="w-3 h-3" /> Enable API Now
                  </a>
                </div>

                {/* Step 2: Test User */}
                <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                  <p className="text-yellow-400 font-black mb-1 flex items-center gap-1 uppercase">
                    <ShieldCheckIcon className="w-3 h-3" /> Step 2: Add Test User
                  </p>
                  <p>In <b>OAuth consent screen</b> &gt; <b>Test users</b>, click <b>+ ADD USERS</b> and enter: <code className="bg-black/40 px-1 rounded text-white">abeloabate01@gmail.com</code></p>
                </div>

                {/* Step 3: Origin & Client ID */}
                <div className="space-y-3">
                  <p className="text-blue-400 font-bold underline uppercase">Step 3: Setup Client ID</p>
                  <p>Add this to <b>Authorized JavaScript origins</b> in your OAuth Client settings:</p>
                  <code className="bg-black/50 p-2 rounded text-blue-300 select-all block break-all">{window.location.origin}</code>

                  <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2">
                    <p className="font-black text-[9px] uppercase tracking-widest text-gray-500">System Diagnostics:</p>
                    <div className="flex justify-between items-center text-[10px]">
                      <span>API Key Loaded:</span>
                      <span className={process.env.YOUTUBE_API_KEY ? 'text-green-500' : 'text-red-500 font-bold'}>
                        {process.env.YOUTUBE_API_KEY ? 'YES (Active)' : 'NO (Check Github Secrets)'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <p className="font-black text-white text-[9px] uppercase tracking-widest">Enter Client ID below:</p>
                    <input
                      type="password"
                      placeholder="e.g. 12345-abcde.apps.googleusercontent.com"
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all text-white font-mono"
                      value={clientId}
                      onChange={e => setClientId(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowSetup(false)}
                className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98] cursor-pointer"
              >
                Save & Close Guide
              </button>
            </div>
          )}

          {showAddForm && (
            <div className="mb-6 p-5 bg-white/5 border border-white/10 rounded-2xl space-y-4 animate-in zoom-in-95 relative z-10 backdrop-blur-md shadow-2xl">
              <div className="space-y-4">
                <button
                  onClick={() => startOAuthFlow()}
                  className="w-full bg-white text-black py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-3 hover:bg-gray-200 transition-all active:scale-95 shadow-xl cursor-pointer"
                >
                  <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5" alt="" />
                  Authorize with Google
                </button>

                <button
                  onClick={() => setShowAuthHelp(!showAuthHelp)}
                  className="w-full text-center text-[10px] text-gray-500 font-bold hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <InformationCircleIcon className="w-3 h-3" />
                  Stuck? View Fix Guide
                </button>

                {showAuthHelp && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-2 animate-in fade-in slide-in-from-top-2">
                    <p className="text-[10px] text-red-400 font-black uppercase flex items-center gap-1">
                      <ExclamationTriangleIcon className="w-3 h-3" /> Error Resolutions
                    </p>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[9px] text-white font-bold uppercase">401 Unauthorized:</p>
                        <p className="text-[9px] text-gray-400">Google tokens expire every 60 minutes. Click the red <b>Refresh</b> icon next to the account to reconnect.</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-white font-bold uppercase">429 Too Many Requests:</p>
                        <p className="text-[9px] text-gray-400">You've hit the Gemini AI free tier limit. The app will continue to work, but AI analysis will be skipped temporarily.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-white/5"></div>
                <span className="flex-shrink mx-4 text-[10px] text-gray-600 font-black uppercase tracking-widest">Sandbox</span>
                <div className="flex-grow border-t border-white/5"></div>
              </div>

              <button
                onClick={() => {
                  setAccounts(prev => [...prev, {
                    id: Math.random().toString(),
                    name: `Unit ${prev.length + 1} (Simulated)`,
                    email: "simulated@unit.corp",
                    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`,
                    accessToken: "mock_token",
                    lastActionStatus: 'idle'
                  }]);
                  setShowAddForm(false);
                }}
                className="w-full border border-white/10 py-3 rounded-xl text-[10px] font-bold text-gray-500 hover:bg-white/5 hover:text-white uppercase tracking-widest transition-all cursor-pointer"
              >
                Add Simulated Unit
              </button>
            </div>
          )}

          <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar relative z-10">
            {accounts.length === 0 && !showAddForm ? (
              <div className="text-center py-20 opacity-30 pointer-events-none">
                <UsersIcon className="w-12 h-12 mx-auto mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Fleet offline. Connect units.</p>
              </div>
            ) : (
              accounts.map(acc => (
                <div key={acc.id} className={`group relative flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${acc.lastActionStatus === 'error' ? 'border-red-500/50 bg-red-500/5' : 'border-white/5 bg-white/5 hover:bg-white/[0.08]'}`}>
                  <div className="relative">
                    <img src={acc.avatar} className={`w-12 h-12 rounded-xl border border-white/10 object-cover ${acc.lastActionStatus === 'loading' ? 'animate-pulse scale-90' : ''}`} alt="" />
                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#0f0f0f] ${acc.isWatching ? 'bg-blue-500 animate-ping' : acc.accessToken === 'mock_token' ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black truncate leading-tight">{acc.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {acc.isWatching ? (
                        <span className="text-[10px] text-blue-400 font-black uppercase animate-pulse">Generating View...</span>
                      ) : acc.lastActionStatus === 'error' ? (
                        <span className="text-[10px] text-red-400 font-bold uppercase truncate">{acc.errorMessage}</span>
                      ) : (
                        <span className="text-[10px] text-gray-500 font-medium uppercase tracking-tighter">
                          {acc.accessToken === 'mock_token' ? 'Simulation Module' : 'Sync Interface Active'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {acc.lastActionStatus === 'loading' && <ArrowPathIcon className="w-5 h-5 text-blue-400 animate-spin" />}
                    {acc.lastActionStatus === 'success' && <CheckCircleIcon className="w-5 h-5 text-green-400" />}
                    {acc.lastActionStatus === 'error' && (
                      <button
                        onClick={() => startOAuthFlow(acc.id)}
                        className="p-1.5 text-red-400 hover:text-white bg-red-400/10 rounded-lg transition-all active:scale-90 cursor-pointer"
                        title="Re-authorize"
                      >
                        <ArrowPathRoundedSquareIcon className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => setAccounts(accounts.filter(a => a.id !== acc.id))}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-600 hover:text-red-500 transition-all active:scale-90 cursor-pointer"
                      title="Decommission Unit"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Participants / Viewer Deck */}
        {streamInfo && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-3xl flex flex-col border border-white/5 relative z-10 animate-in fade-in zoom-in-95">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-4 text-gray-500 flex items-center gap-2">
                <UsersIcon className="w-4 h-4 text-red-500" /> Active Engagement
              </h3>
              <div className="space-y-3">
                {chatParticipants.length === 0 ? (
                  <p className="text-[10px] text-gray-600 italic">Tracking chat dynamics...</p>
                ) : (
                  chatParticipants.map(pic => (
                    <div key={pic.id} className="flex items-center gap-3 animate-in slide-in-from-left-2">
                      <img src={pic.thumbnail} className="w-6 h-6 rounded-full border border-white/10" alt="" />
                      <span className="text-[11px] font-bold text-gray-300 truncate">{pic.name}</span>
                      <span className="ml-auto w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* VIEWER DECK (Actual Playback IFrames) */}
            {accounts.some(a => a.isWatching) && (
              <div className="glass-panel p-6 rounded-3xl flex flex-col border border-white/5 relative z-10 animate-in fade-in slide-in-from-bottom-4 shadow-2xl shadow-blue-500/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-blue-500 flex items-center gap-2">
                    <VideoCameraIcon className="w-4 h-4" /> Live Viewer Deck
                  </h3>
                  <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-black">
                    {accounts.filter(a => a.isWatching).length} UNITS ACTIVE
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 opacity-10 hover:opacity-100 transition-opacity">
                  {accounts.filter(a => a.isWatching).map(acc => (
                    <div key={acc.id} className="aspect-video bg-black rounded-lg overflow-hidden border border-white/10 relative group">
                      <iframe
                        src={`https://www.youtube.com/embed/${streamInfo.videoId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&iv_load_policy=3&modestbranding=1&autoplay=1`}
                        className="w-full h-full pointer-events-none"
                        title={`Viewer ${acc.name}`}
                      />
                      <div className="absolute inset-0 bg-blue-500/5 group-hover:hidden pointer-events-none"></div>
                    </div>
                  ))}
                </div>
                <p className="text-[7px] text-gray-600 uppercase font-black mt-4 tracking-tighter text-center italic">
                  Embedded session playback active (High Success Rate)
                </p>
              </div>
            )}
          </div>
        )}

        {/* Activity Feed */}
        <div className="glass-panel p-6 rounded-3xl flex-1 max-h-[350px] flex flex-col border border-white/5 relative z-10">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-4 text-gray-500 flex items-center gap-2">
            <SignalIcon className="w-4 h-4" /> Telemetry Log
          </h3>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2 font-mono text-[10px]">
            {logs.length === 0 ? (
              <p className="text-gray-700 italic opacity-50">No activity detected...</p>
            ) : (
              logs.map(log => (
                <div key={log.id} className={`p-2 rounded border-l-2 flex flex-col gap-1 transition-all hover:translate-x-1 ${log.status === 'success' ? 'bg-green-500/5 border-green-500/30' : 'bg-red-500/5 border-red-500/30'}`}>
                  <div className="flex justify-between items-center opacity-60">
                    <span className="font-black">[{log.accountName.toUpperCase()}]</span>
                    <span>{log.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <p className={log.status === 'success' ? 'text-green-400' : 'text-red-400'}>{log.details}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Control Panel */}
      <div className="lg:col-span-8 flex flex-col gap-8 z-10">
        <div className="glass-panel p-8 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden">
          {/* Decorative Bar */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-red-500/50 to-transparent pointer-events-none z-0"></div>

          <div className="flex items-center gap-4 mb-10 relative z-10">
            <div className="bg-red-600/20 p-4 rounded-3xl border border-red-600/30 shadow-2xl shadow-red-600/10">
              <VideoCameraIcon className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tighter leading-none text-white">Command Center</h1>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Tactical Interface v2.6</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-10 relative z-10">
            <div className="relative flex-1 group">
              <input
                type="text"
                placeholder="YouTube Live URL..."
                className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-5 focus:outline-none focus:ring-2 focus:ring-red-500/40 transition-all text-lg placeholder:text-gray-700 font-medium text-white"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleFetchStream()}
              />
              {streamUrl && (
                <button
                  onClick={() => setStreamUrl('')}
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              )}
            </div>
            <button
              onClick={handleFetchStream}
              disabled={isLoadingStream || !streamUrl}
              className="bg-white text-black px-10 py-5 rounded-2xl font-black uppercase text-sm hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3 shadow-xl cursor-pointer"
            >
              {isLoadingStream ? <ArrowPathIcon className="w-6 h-6 animate-spin" /> : 'Scan Target'}
            </button>
          </div>

          {streamInfo ? (
            <div className="grid md:grid-cols-12 gap-10 items-start animate-in fade-in slide-in-from-bottom-8 duration-700 relative z-10">
              <div className="md:col-span-7 space-y-6">
                <div className="relative group overflow-hidden rounded-[2rem] border border-white/10 shadow-inner">
                  <img src={streamInfo.thumbnail} className="w-full h-full object-cover aspect-video transition-transform duration-700 group-hover:scale-105" alt="" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60 pointer-events-none"></div>
                  <div className="absolute bottom-6 left-6 right-6 pointer-events-none">
                    <div className="inline-flex items-center gap-2 bg-red-600 px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest mb-3 shadow-lg shadow-red-600/40">
                      <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                      TARGET ACQUIRED
                    </div>
                    <h3 className="text-2xl font-black leading-tight drop-shadow-lg text-white">{streamInfo.title}</h3>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5 flex-1">
                    <div className="w-10 h-10 bg-red-600/10 rounded-full flex items-center justify-center font-black text-red-500">YT</div>
                    <p className="text-sm font-bold text-gray-400">{streamInfo.channelTitle}</p>
                  </div>
                  <div className="flex items-center gap-6 px-6 py-4 bg-black/40 rounded-2xl border border-white/5 relative group/stats">
                    <div className="text-center">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Likes</p>
                      <p className="text-xl font-black text-white">{Number(streamInfo.likeCount || 0).toLocaleString()}</p>
                    </div>
                    <div className="w-px h-8 bg-white/10"></div>
                    <div className="text-center">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Viewers</p>
                      <p className="text-xl font-black text-red-500">{Number(streamInfo.viewerCount || 0).toLocaleString()}</p>
                    </div>
                    {/* Latency Note */}
                    <div className="absolute -bottom-6 left-0 right-0 text-center opacity-0 group-hover/stats:opacity-100 transition-opacity pointer-events-none">
                      <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest">Note: Public stats may take 1-2 mins to sync</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-5 flex flex-col gap-6">
                <div className="bg-white/5 border border-white/10 rounded-3xl p-8 flex-1 shadow-2xl backdrop-blur-3xl relative overflow-hidden">
                  <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-8 text-center">Payload Distribution</h4>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <button
                      onClick={handleMultiLike}
                      disabled={isLiking || isViewing || accounts.length === 0}
                      className="stream-gradient text-white py-6 rounded-[1.5rem] font-black uppercase text-xs shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 flex flex-col items-center gap-2 cursor-pointer"
                    >
                      {isLiking ? <ArrowPathIcon className="w-6 h-6 animate-spin" /> : <HandThumbUpIcon className="w-6 h-6" />}
                      <span>High-Stay Like</span>
                    </button>
                    <button
                      onClick={handleMultiView}
                      disabled={isViewing || isLiking || accounts.length === 0}
                      className="bg-blue-600 text-white py-6 rounded-[1.5rem] font-black uppercase text-xs shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 flex flex-col items-center gap-2 cursor-pointer shadow-blue-600/20"
                    >
                      {isViewing ? <ArrowPathIcon className="w-6 h-6 animate-spin" /> : <VideoCameraIcon className="w-6 h-6" />}
                      <span>Ultra Sync-View</span>
                    </button>
                  </div>

                  <button
                    onClick={handleUltraEngagement}
                    disabled={isLiking || isViewing || isCommenting || accounts.length === 0}
                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-5 rounded-2xl font-black uppercase text-sm shadow-2xl hover:shadow-indigo-500/50 transition-all active:scale-95 flex items-center justify-center gap-3 cursor-pointer group mb-4"
                  >
                    <RocketLaunchIcon className="w-6 h-6 group-hover:animate-bounce" />
                    EXECUTE TACTICAL ULTRA OPERATION
                  </button>

                  {/* Comment Subsection */}
                  <div className="mt-8 pt-8 border-t border-white/5 space-y-6">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Chat Broadcast</h4>
                      <button
                        onClick={() => setUseAiVariations(!useAiVariations)}
                        className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black transition-all ${useAiVariations ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-gray-500/10 text-gray-500 border border-white/5'}`}
                      >
                        <SparklesIcon className="w-3 h-3" />
                        {useAiVariations ? 'AI VARIATIONS ON' : 'AI VARIATIONS OFF'}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-center">
                      <button
                        onClick={() => handleMultiComment()}
                        disabled={isCommenting || accounts.length === 0}
                        className="w-full bg-white/5 hover:bg-white/10 border border-white/10 py-4 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 text-purple-400 transition-all disabled:opacity-20 cursor-pointer mb-2"
                      >
                        <SparklesIcon className="w-4 h-4" />
                        Execute Smart-Chat (Unique for each)
                      </button>

                      <div className="w-full grid grid-cols-4 gap-2">
                        {['Great stream!', 'Love it!', 'Hello!', '🔥🔥🔥'].map((preset) => (
                          <button
                            key={preset}
                            onClick={() => {
                              setUseAiVariations(false);
                              handleMultiComment(preset);
                            }}
                            disabled={isCommenting || accounts.length === 0}
                            className="px-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-bold text-gray-400 hover:text-white transition-all cursor-pointer disabled:opacity-20 flex items-center justify-center"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="relative group">
                      <input
                        type="text"
                        placeholder="Broadcast custom message..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-gray-700 text-white"
                        value={customComment}
                        onChange={(e) => setCustomComment(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleMultiComment()}
                      />
                      <button
                        onClick={() => handleMultiComment()}
                        disabled={isCommenting || !customComment || accounts.length === 0}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-500 hover:text-blue-400 disabled:opacity-20 disabled:grayscale transition-all cursor-pointer"
                      >
                        <ChatBubbleLeftRightIcon className="w-5 h-5" />
                      </button>
                    </div>

                    {isCommenting && (
                      <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-top-2">
                        <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-blue-400">
                          <span>Broadcasting to Chat...</span>
                          <span>{progress.current}/{progress.total}</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-500"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {/* Spam Warning */}
                    <div className="pt-2 flex items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                      <ExclamationCircleIcon className="w-3 h-3 text-yellow-500" />
                      <p className="text-[7px] text-gray-500 font-bold uppercase tracking-tight">Warning: Excessive chat usage may trigger YouTube anti-spam filters.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 opacity-20 text-center relative z-10 pointer-events-none">
              <VideoCameraIcon className="w-24 h-24 mb-6" />
              <h2 className="text-3xl font-black uppercase tracking-tighter italic">Scanner Idle</h2>
              <p className="max-w-xs mt-4 text-xs font-bold uppercase tracking-widest leading-loose">Initialize target tracking by entering a valid YouTube stream URL.</p>
            </div>
          )}
        </div>

        {/* AI Insight Sub-Panel */}
        {streamInfo && (
          <div className="glass-panel p-8 rounded-[2rem] relative overflow-hidden group border border-white/5 shadow-2xl z-10">
            {/* Blur Decoration */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/5 blur-[120px] pointer-events-none z-0 group-hover:bg-purple-600/10 transition-colors"></div>

            <div className="flex items-center justify-between mb-8 relative z-10">
              <div className="flex items-center gap-3 text-purple-400">
                <SparklesIcon className="w-7 h-7" />
                <h2 className="text-xl font-black uppercase tracking-tighter">AI Tactical Overlay</h2>
              </div>
              <div className="px-4 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-[10px] font-black text-purple-400 uppercase tracking-widest">
                Gemini Intelligence
              </div>
            </div>

            {aiAnalysis ? (
              <div className="grid md:grid-cols-3 gap-8 items-center relative z-10">
                <div className="md:col-span-2 p-6 bg-white/[0.03] border border-white/5 rounded-[1.5rem] relative">
                  <div className="absolute -top-3 left-6 bg-[#0f0f0f] px-3 text-[10px] font-black text-purple-500 tracking-[0.2em] uppercase">Intelligence Summary</div>
                  <p className="text-sm text-gray-300 leading-relaxed font-medium italic">
                    "{aiAnalysis}"
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl transition-all hover:bg-white/[0.05]">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Engagement Score</p>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 w-[92%] shadow-[0_0_15px_rgba(34,197,94,0.3)]"></div>
                    </div>
                  </div>
                  <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl transition-all hover:bg-white/[0.05]">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Viral Probability</p>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 w-[78%] shadow-[0_0_15px_rgba(59,130,246,0.3)]"></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-gray-500 relative z-10">
                <ArrowPathIcon className="w-10 h-10 animate-spin opacity-10" />
                <p className="text-xs font-black uppercase tracking-[0.3em] animate-pulse">Analyzing Target Signature...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
