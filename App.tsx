
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
  SignalIcon
} from '@heroicons/react/24/outline';

const App: React.FC = () => {
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [isLiking, setIsLiking] = useState(false);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);

  const [clientId, setClientId] = useState(() => localStorage.getItem('sb_client_id') || '');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, activeName: '' });

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('sb_accounts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAccounts(parsed.map((a: any) => ({ ...a, lastActionStatus: 'idle' })));
      } catch (e) { console.error("Load failed", e); }
    }
  }, []);

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
      const info = await youtube.fetchStreamInfo(videoId, process.env.API_KEY || '');
      setStreamInfo(info);
      const analysis = await gemini.analyzeStream(info.title, info.channelTitle);
      setAiAnalysis(analysis);
    } catch (error: any) {
      alert("Fetch Error: " + error.message);
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
          await youtube.rateVideo(streamInfo.videoId, acc.accessToken, 'like');
        }
        acc.lastActionStatus = 'success';
        addLog(acc.name, 'success', `Liked stream: ${streamInfo.title}`);
      } catch (err: any) {
        acc.lastActionStatus = 'error';
        acc.errorMessage = err.message === 'TOKEN_EXPIRED' ? 'Authorization expired' : err.message;
        addLog(acc.name, 'error', `Failed: ${acc.errorMessage}`);
      }

      setAccounts(prev => prev.map(a => a.id === acc.id ? acc : a));
    }
    setIsLiking(false);
    setProgress(prev => ({ ...prev, activeName: 'Operation Complete' }));
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
          {/* Decorative Icon - Fixed pointer-events */}
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none z-0">
            <UsersIcon className="w-24 h-24 rotate-12" />
          </div>

          <div className="flex items-center justify-between mb-8 relative z-10">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                Account Fleet
              </h2>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Active Units: {stats.online}/{stats.total}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSetup(!showSetup)}
                className="p-2 text-gray-400 hover:text-white transition-all hover:bg-white/10 rounded-lg cursor-pointer"
                title="Setup Guide"
              >
                <QuestionMarkCircleIcon className="w-6 h-6" />
              </button>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-red-600 p-2.5 rounded-xl hover:bg-red-500 shadow-lg shadow-red-600/20 transition-all active:scale-90 cursor-pointer"
                title="Add Account"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {showSetup && (
            <div className="mb-6 p-5 bg-blue-600/10 border border-blue-500/30 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-4 relative z-10">
              <div className="flex items-center gap-2 text-blue-400 font-black text-xs uppercase">
                <KeyIcon className="w-4 h-4" /> Cloud Config
              </div>
              <div className="text-[11px] text-gray-400 space-y-2 leading-relaxed">
                <p>1. Open <a href="https://console.cloud.google.com/" target="_blank" className="text-blue-400 underline font-bold">Google Cloud</a></p>
                <p>2. Enable <b>YouTube Data API v3</b></p>
                <p>3. Create <b>OAuth 2.0 Client ID</b> (Web App)</p>
                <p>4. <b>CRITICAL:</b> Add this origin to your project: <br />
                  <code className="bg-black/50 p-1 rounded text-blue-300 select-all">https://abelo-123.github.io</code>
                </p>
              </div>
              <input
                type="password"
                placeholder="Paste Client ID..."
                className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
              />
              <button
                onClick={() => setShowSetup(false)}
                className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98] cursor-pointer"
              >
                Update Configuration
              </button>
            </div>
          )}

          {showAddForm && (
            <div className="mb-6 p-5 bg-white/5 border border-white/10 rounded-2xl space-y-4 animate-in zoom-in-95 relative z-10">
              <p className="text-[11px] text-gray-400 text-center leading-tight">Add a real account via secure OAuth popup.</p>
              <button
                onClick={() => startOAuthFlow()}
                className="w-full bg-white text-black py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-3 hover:bg-gray-200 transition-all active:scale-95 shadow-xl cursor-pointer"
              >
                <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5" alt="" />
                Authorize Account
              </button>
              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-white/5"></div>
                <span className="flex-shrink mx-4 text-[10px] text-gray-600 font-black uppercase tracking-widest">OR</span>
                <div className="flex-grow border-t border-white/5"></div>
              </div>
              <button
                onClick={() => {
                  setAccounts(prev => [...prev, {
                    id: Math.random().toString(),
                    name: `Simulated User ${prev.length + 1}`,
                    email: "demo@example.com",
                    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`,
                    accessToken: "mock_token",
                    lastActionStatus: 'idle'
                  }]);
                  setShowAddForm(false);
                }}
                className="w-full border border-white/10 py-3 rounded-xl text-[10px] font-bold text-gray-500 hover:bg-white/5 uppercase tracking-widest transition-all cursor-pointer"
              >
                Add Test Unit
              </button>
            </div>
          )}

          <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar relative z-10">
            {accounts.length === 0 ? (
              <div className="text-center py-16 opacity-20 pointer-events-none">
                <UsersIcon className="w-12 h-12 mx-auto mb-4" />
                <p className="text-xs font-bold uppercase tracking-widest">No Units Deployed</p>
              </div>
            ) : (
              accounts.map(acc => (
                <div key={acc.id} className={`group relative flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${acc.lastActionStatus === 'error' ? 'border-red-500/50 bg-red-500/5' : 'border-white/5 bg-white/5 hover:bg-white/[0.08]'}`}>
                  <img src={acc.avatar} className={`w-12 h-12 rounded-xl border border-white/10 object-cover ${acc.lastActionStatus === 'loading' ? 'animate-pulse scale-90' : ''}`} alt="" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black truncate leading-tight">{acc.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {acc.lastActionStatus === 'error' ? (
                        <span className="text-[10px] text-red-400 font-bold uppercase truncate">{acc.errorMessage}</span>
                      ) : (
                        <span className="text-[10px] text-gray-500 font-medium uppercase tracking-tighter">Status: {acc.lastActionStatus === 'success' ? 'Synchronized' : 'Ready'}</span>
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
                      title="Remove Account"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="glass-panel p-6 rounded-3xl flex-1 max-h-[350px] flex flex-col border border-white/5 relative z-10">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-4 text-gray-500 flex items-center gap-2">
            <SignalIcon className="w-4 h-4" /> Telemetry Log
          </h3>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2 font-mono text-[10px]">
            {logs.length === 0 ? (
              <p className="text-gray-700 italic">No incoming data...</p>
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
          {/* Decorative Bar - Fixed pointer-events */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-red-500/50 to-transparent pointer-events-none z-0"></div>

          <div className="flex items-center gap-4 mb-10 relative z-10">
            <div className="bg-red-600/20 p-4 rounded-3xl border border-red-600/30 shadow-2xl shadow-red-600/10">
              <VideoCameraIcon className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tighter leading-none">Command Center</h1>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Targeting Interface v2.4</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-10 relative z-10">
            <div className="relative flex-1 group">
              <input
                type="text"
                placeholder="Enter YouTube Live Link..."
                className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-5 focus:outline-none focus:ring-2 focus:ring-red-500/40 transition-all text-lg placeholder:text-gray-700 font-medium"
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
              {isLoadingStream ? <ArrowPathIcon className="w-6 h-6 animate-spin" /> : 'Lock Target'}
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
                      ACTIVE FEED
                    </div>
                    <h3 className="text-2xl font-black leading-tight drop-shadow-lg">{streamInfo.title}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="w-10 h-10 bg-red-600/10 rounded-full flex items-center justify-center font-black text-red-500">YT</div>
                  <p className="text-sm font-bold text-gray-400">{streamInfo.channelTitle}</p>
                </div>
              </div>

              <div className="md:col-span-5 flex flex-col gap-6">
                <div className="bg-white/5 border border-white/10 rounded-3xl p-8 flex-1 shadow-2xl backdrop-blur-3xl relative overflow-hidden">
                  <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-8 text-center">Execution Control</h4>

                  <button
                    onClick={handleMultiLike}
                    disabled={isLiking || accounts.length === 0}
                    className="w-full stream-gradient text-white py-6 rounded-[1.5rem] font-black uppercase text-sm shadow-2xl shadow-red-600/30 hover:shadow-red-600/60 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:scale-100 disabled:shadow-none group relative overflow-hidden cursor-pointer"
                  >
                    <div className="relative z-10 flex flex-col items-center gap-2">
                      {isLiking ? <ArrowPathIcon className="w-7 h-7 animate-spin" /> : <HandThumbUpIcon className="w-8 h-8 mb-1 group-hover:scale-125 transition-transform" />}
                      <span>{isLiking ? 'Transmitting Data...' : `Sync-Like (${accounts.length} Profiles)`}</span>
                    </div>
                  </button>

                  {isLiking && (
                    <div className="mt-8 space-y-3 animate-in fade-in slide-in-from-top-2">
                      <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-gray-400">
                        <span className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
                          {progress.activeName}
                        </span>
                        <span>{progress.current}/{progress.total}</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                        <div
                          className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                          style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {!isLiking && accounts.length === 0 && (
                    <div className="mt-8 p-5 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex gap-4 items-start">
                      <InformationCircleIcon className="w-6 h-6 text-yellow-500 shrink-0" />
                      <p className="text-xs text-yellow-500/80 leading-relaxed font-bold">
                        Awaiting account deployment. Connect profiles to enable engagement payload.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 opacity-20 text-center relative z-10 pointer-events-none">
              <VideoCameraIcon className="w-24 h-24 mb-6" />
              <h2 className="text-3xl font-black uppercase tracking-tighter italic">Target Missing</h2>
              <p className="max-w-xs mt-4 text-xs font-bold uppercase tracking-widest leading-loose">Enter a live stream URL to initialize the synchronization matrix.</p>
            </div>
          )}
        </div>

        {/* AI Insight Sub-Panel */}
        {streamInfo && (
          <div className="glass-panel p-8 rounded-[2rem] relative overflow-hidden group border border-white/5 shadow-2xl z-10">
            {/* Blur Decoration - Pointer events fixed */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/5 blur-[120px] pointer-events-none z-0 group-hover:bg-purple-600/10 transition-colors"></div>

            <div className="flex items-center justify-between mb-8 relative z-10">
              <div className="flex items-center gap-3 text-purple-400">
                <SparklesIcon className="w-7 h-7" />
                <h2 className="text-xl font-black uppercase tracking-tighter">AI Tactical Overlay</h2>
              </div>
              <div className="px-4 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-[10px] font-black text-purple-400 uppercase tracking-widest">
                Gemini-3-Flash Ready
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
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Threat/Engagement Level</p>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 w-[92%] shadow-[0_0_15px_rgba(34,197,94,0.3)]"></div>
                    </div>
                  </div>
                  <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl transition-all hover:bg-white/[0.05]">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Tactical Opportunity</p>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 w-[78%] shadow-[0_0_15px_rgba(59,130,246,0.3)]"></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-gray-500 relative z-10">
                <ArrowPathIcon className="w-10 h-10 animate-spin opacity-10" />
                <p className="text-xs font-black uppercase tracking-[0.3em] animate-pulse">Scanning Metadata Streams...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
