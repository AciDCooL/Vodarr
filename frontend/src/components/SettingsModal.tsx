import { useState, useEffect, useCallback } from 'react';
import { 
  Server, HardDrive, ShieldCheck, RefreshCw, Clock, Power, 
  X, Globe, ChevronDown, Folder, Save, Copy
} from 'lucide-react';
import { Config } from '../types';
import { api } from '../api/client';
import { FolderSelectorModal } from './FolderSelectorModal';

export function SettingsModal({ 
  config, 
  setConfig, 
  onSave, 
  onClose,
  uaPresets,
  onTest,
  setToast
}: { 
  config: Config | null, 
  setConfig: (c: Config) => void, 
  onSave: () => void, 
  onClose: () => void,
  uaPresets: Record<string, string>,
  onTest: () => void,
  setToast: (t: { message: string, type: 'success' | 'error' | 'info' }) => void
}) {  const [activeGroup, setActiveGroup] = useState<'server' | 'downloads' | 'security' | 'retries' | 'window' | 'system'>('server');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [refreshingAccount, setRefreshingAccount] = useState(false);

  const fetchAccount = useCallback(async () => {
    setRefreshingAccount(true);
    try {
      const data = await api.getAccountInfo();
      setAccountInfo(data);
    } catch (err) {
      console.error('Failed to fetch account info', err);
    } finally {
      setRefreshingAccount(false);
    }
  }, []);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  if (!config) return null;

  const handleLogout = () => {
    api.clearAuthToken();
    window.location.reload();
  };

  const groups = [
    { id: 'server', label: 'Server & API', icon: <Server size={18} /> },
    { id: 'downloads', label: 'Downloads', icon: <HardDrive size={18} /> },
    { id: 'security', label: 'Security', icon: <ShieldCheck size={18} /> },
    { id: 'retries', label: 'Retries', icon: <RefreshCw size={18} /> },
    { id: 'window', label: 'Window', icon: <Clock size={18} /> },
    { id: 'system', label: 'System', icon: <Power size={18} /> },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      {showFolderPicker && (
        <FolderSelectorModal 
          currentPath={config.download_dir}
          onClose={() => setShowFolderPicker(false)}
          onSelect={(p) => setConfig({...config, download_dir: p})}
        />
      )}
      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl w-full max-w-6xl overflow-hidden border dark:border-gray-800 flex flex-col md:flex-row h-[700px]">
        {/* Settings Sidebar */}
        <div className="w-full md:w-64 bg-gray-50 dark:bg-gray-950 border-r dark:border-gray-800 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-10 pl-2">
              <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/30">
                <Settings className="text-white" size={18} />
              </div>
              <h2 className="text-lg font-black dark:text-white uppercase tracking-tighter leading-none">Settings</h2>
            </div>
            
            <nav className="space-y-2">
              {groups.map(group => (
                <button
                  key={group.id}
                  onClick={() => setActiveGroup(group.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-xs uppercase tracking-widest ${activeGroup === group.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  {group.icon} {group.label}
                </button>
              ))}
            </nav>
          </div>

          <button
            onClick={onTest}
            className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-all border dark:border-gray-800 active:scale-95"
          >
            <ShieldCheck size={14}/> Test Connection
          </button>
        </div>
        
        {/* Settings Content */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden relative">
          <button 
            onClick={onClose}
            className="absolute top-8 right-8 p-3 bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-red-500 rounded-2xl transition-all hidden md:flex active:scale-90 z-10"
          >
            <X size={24} />
          </button>

          <div className="flex-1 p-10 overflow-y-auto space-y-8 text-sm">
            {activeGroup === 'server' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Server Credentials</h3>
                  <p className="text-sm text-gray-500">Update your Xtream API connection details.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Base URL</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-3.5 text-gray-400" size={18}/>
                      <input 
                        className="w-full border-none rounded-2xl px-12 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        placeholder="http://provider.com:8080"
                        value={config.base_url} 
                        onChange={e => setConfig({...config, base_url: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Username</label>
                      <input 
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.username} 
                        onChange={e => setConfig({...config, username: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Password</label>
                      <input 
                        type="password"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.password} 
                        onChange={e => setConfig({...config, password: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {accountInfo?.user_info && (
                  <div className="pt-6 border-t dark:border-gray-800 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Account Vital Stats</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border dark:border-gray-800">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Expiration</p>
                        <p className="text-sm font-bold dark:text-gray-200 mt-1">
                          {accountInfo.user_info.exp_date ? new Date(parseInt(accountInfo.user_info.exp_date) * 1000).toLocaleDateString() : 'Unlimited'}
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border dark:border-gray-800">
                        <div className="flex items-center justify-between">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Active Streams</p>
                          <button 
                            onClick={fetchAccount}
                            disabled={refreshingAccount}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-all text-gray-400"
                            title="Refresh Account Status"
                          >
                            <RefreshCw size={10} className={refreshingAccount ? 'animate-spin text-blue-500' : ''} />
                          </button>
                        </div>
                        <p className="text-sm font-bold mt-1 flex items-center gap-2">
                          <span className={parseInt(accountInfo.user_info.active_cons) >= parseInt(accountInfo.user_info.max_connections) ? 'text-red-500' : 'text-green-500'}>
                            {accountInfo.user_info.active_cons}
                          </span>
                          <span className="text-gray-400">/ {accountInfo.user_info.max_connections}</span>
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border dark:border-gray-800 col-span-2">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Allowed Formats</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {(accountInfo.user_info.allowed_output_formats || ['mkv', 'mp4', 'ts']).map((fmt: string) => (
                            <span key={fmt} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-black uppercase tracking-tighter">
                              {fmt}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeGroup === 'downloads' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Storage & Identity</h3>
                  <p className="text-sm text-gray-500">How and where your files are saved.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Download Directory</label>
                    <div className="flex gap-3">
                      <div className="relative group flex-1">
                        <Folder className="absolute left-4 top-3.5 text-gray-400" size={18}/>
                        <input 
                          className="w-full border-none rounded-2xl px-12 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                          value={config.download_dir} 
                          onChange={e => setConfig({...config, download_dir: e.target.value})}
                        />
                      </div>
                      <button 
                        onClick={() => setShowFolderPicker(true)}
                        className="px-5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all border dark:border-gray-800"
                      >
                        <Folder size={18}/>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Cache Expiry (Hours)</label>
                      <input 
                        type="number"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.cache_expiry_hours} 
                        onChange={e => setConfig({...config, cache_expiry_hours: parseInt(e.target.value) || 24})}
                      />
                    </div>
                    <div className="space-y-2 flex flex-col justify-end">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">User Agent</label>
                      <div className="relative">
                        <select
                          className="w-full appearance-none border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[10px] tracking-tight truncate pr-10"
                          value={config.user_agent}
                          onChange={e => setConfig({...config, user_agent: e.target.value})}
                        >
                          {Object.entries(uaPresets).map(([label, val]) => (
                            <option key={label} value={val as string}>{label}</option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-3.5 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/50">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Media Management</h4>
                        <span className="bg-blue-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-sm">Radarr/Sonarr</span>
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Organize downloads into "Title (Year)" and "Season X" subfolders.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={config.media_management}
                        onChange={e => setConfig({...config, media_management: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 transition-all"></div>
                    </label>
                  </div>

                  <div className="pt-6 border-t dark:border-gray-800 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Bandwidth & Limits</h4>
                    <div className="flex items-center justify-between p-6 bg-amber-50/50 dark:bg-amber-900/10 rounded-[2rem] border border-amber-100 dark:border-amber-800/50">
                      <div className="space-y-1">
                        <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Check Stream Limit</h4>
                        <p className="text-xs text-gray-500">Prevent starting downloads if your active IPTV streams are full.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={config.check_stream_limit}
                          onChange={e => setConfig({...config, check_stream_limit: e.target.checked})}
                        />
                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 transition-all"></div>
                      </label>
                    </div>

                    <div className={`space-y-2 transition-all ${!config.check_stream_limit ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Check Interval (Seconds)</label>
                      <input 
                        type="number"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.stream_limit_check_interval} 
                        onChange={e => setConfig({...config, stream_limit_check_interval: parseInt(e.target.value) || 60})}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeGroup === 'retries' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Retries & Timeouts</h3>
                  <p className="text-sm text-gray-500">Configure how the app handles network interruptions.</p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-6 bg-amber-50/50 dark:bg-amber-900/10 rounded-[2rem] border border-amber-100 dark:border-amber-800/50">
                    <div className="space-y-1">
                      <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Auto-Retry Failed</h4>
                      <p className="text-xs text-gray-500">Automatically re-queue failed downloads.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={config.auto_retry_failed}
                        onChange={e => setConfig({...config, auto_retry_failed: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 transition-all"></div>
                    </label>
                  </div>

                  <div className={`grid grid-cols-2 gap-6 transition-all ${!config.auto_retry_failed ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Max Retries per Item</label>
                      <input 
                        type="number"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.max_retries} 
                        onChange={e => setConfig({...config, max_retries: parseInt(e.target.value) || 3})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Queue Retry Limit</label>
                      <input 
                        type="number"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.auto_retry_queue_limit} 
                        onChange={e => setConfig({...config, auto_retry_queue_limit: parseInt(e.target.value) || 10})}
                      />
                    </div>
                  </div>

                  <div className="pt-6 border-t dark:border-gray-800 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Network Timeouts (Seconds)</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Connection Timeout</label>
                        <input 
                          type="number"
                          className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                          value={config.connect_timeout} 
                          onChange={e => setConfig({...config, connect_timeout: parseInt(e.target.value) || 5})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Read Timeout</label>
                        <input 
                          type="number"
                          className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                          value={config.read_timeout} 
                          onChange={e => setConfig({...config, read_timeout: parseInt(e.target.value) || 10})}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium italic pl-1">
                      Lower values detect dead links faster. Recommended: 3s - 5s.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeGroup === 'window' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Download Window</h3>
                  <p className="text-sm text-gray-500">Restrict download activity to specific hours of the day.</p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-[2rem] border border-blue-100 dark:border-blue-800/50">
                    <div className="space-y-1">
                      <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Enable Window</h4>
                      <p className="text-xs text-gray-500">Only download during the specified time range.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={config.enable_download_window}
                        onChange={e => setConfig({...config, enable_download_window: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 transition-all"></div>
                    </label>
                  </div>

                  <div className={`grid grid-cols-2 gap-6 p-6 bg-gray-50 dark:bg-gray-800/50 rounded-[2rem] transition-all duration-300 ${!config.enable_download_window ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase pl-1">Start Time</span>
                      <div className="relative">
                         <select
                           className="w-full appearance-none border-none rounded-2xl px-5 py-3.5 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-sm cursor-pointer"
                           value={config.retry_start_hour}
                           onChange={e => setConfig({...config, retry_start_hour: parseInt(e.target.value) || 0})}
                         >
                           {Array.from({length: 25}, (_, i) => (
                             <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                           ))}
                         </select>
                         <ChevronDown size={16} className="absolute right-4 top-4 text-gray-400 pointer-events-none"/>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase pl-1">End Time</span>
                      <div className="relative">
                         <select
                           className="w-full appearance-none border-none rounded-2xl px-5 py-3.5 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-sm cursor-pointer"
                           value={config.retry_end_hour}
                           onChange={e => setConfig({...config, retry_end_hour: parseInt(e.target.value) || 0})}
                         >
                           {Array.from({length: 25}, (_, i) => (
                             <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                           ))}
                         </select>
                         <ChevronDown size={16} className="absolute right-4 top-4 text-gray-400 pointer-events-none"/>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500 italic text-center px-4">
                    Active downloads will pause outside this window and resume automatically when it opens.
                  </p>
                </div>
              </div>
            )}

            {activeGroup === 'security' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Identity & Security</h3>
                  <p className="text-sm text-gray-500">Manage administrative access and authentication policies.</p>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Admin Username</label>
                      <input 
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        value={config.admin_username} 
                        onChange={e => setConfig({...config, admin_username: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Change Password</label>
                      <input 
                        type="password"
                        placeholder="Leave blank to keep current"
                        className="w-full border-none rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium italic"
                        value={config.admin_password || ''} 
                        onChange={e => setConfig({...config, admin_password: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">REST API Access</label>
                    <div className="flex gap-3">
                      <div className="relative group flex-1">
                        <input 
                          readOnly
                          className="w-full border-none rounded-2xl px-6 py-4 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 font-mono text-xs focus:ring-0 outline-none"
                          value={config.api_key} 
                        />
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(config.api_key);
                            setToast({ message: 'API Key copied to clipboard', type: 'success' });
                          }}
                          className="absolute right-4 top-3.5 p-1 text-gray-400 hover:text-blue-500 transition-colors"
                          title="Copy API Key"
                        >
                          <Copy size={16}/>
                        </button>
                      </div>
                      <button 
                        onClick={() => setConfig({...config, api_key: Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')})}
                        className="px-6 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 rounded-2xl hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 transition-all border border-transparent hover:border-amber-500/20 active:scale-95"
                        title="Regenerate API Key"
                      >
                        <RefreshCw size={18}/>
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500 italic pl-1">Use this key in the "X-Api-Key" header for automation.</p>
                  </div>

                  <div className="flex items-center justify-between p-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-[2rem] border border-blue-100 dark:border-blue-800/50">
                    <div className="space-y-1">
                      <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Local Address Bypass</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">Disable authentication for requests originating from local networks (LAN).</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={config.auth_bypass_local}
                        onChange={e => setConfig({...config, auth_bypass_local: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 transition-all"></div>
                    </label>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={handleLogout}
                      className="w-full py-4 bg-gray-100 dark:bg-gray-800 text-red-500 dark:text-red-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95 flex items-center justify-center gap-3 border border-transparent hover:border-red-500/20"
                    >
                      <Power size={16}/> Terminate Current Session
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeGroup === 'system' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">System Maintenance</h3>
                  <p className="text-sm text-gray-500">Manage the application lifecycle and logging.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-6 bg-gray-50 dark:bg-gray-800/50 rounded-[2rem] border dark:border-gray-700">
                    <div className="space-y-1">
                      <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Debug Mode</h4>
                      <p className="text-xs text-gray-500">Enable verbose logging to stdout for troubleshooting.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={config.debug_mode}
                        onChange={e => setConfig({...config, debug_mode: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 transition-all"></div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-6 bg-gray-50 dark:bg-gray-800/40 rounded-[2rem] border dark:border-gray-800 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600">
                          <RefreshCw size={24} />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Restart Application</h4>
                          <p className="text-xs text-gray-500">Exits the process. In Docker/K8s, the container will restart automatically.</p>
                        </div>
                        <button 
                          onClick={() => api.restartSystem()}
                          className="px-6 py-2.5 bg-amber-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-amber-700 transition-all active:scale-95"
                        >
                          Restart
                        </button>
                      </div>
                    </div>

                    <div className="p-6 bg-gray-50 dark:bg-gray-800/40 rounded-[2rem] border dark:border-gray-800 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600">
                          <Power size={24} />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-black dark:text-white uppercase tracking-tight text-sm">Shutdown</h4>
                          <p className="text-xs text-gray-500">Stops the application process completely.</p>
                        </div>
                        <button 
                          onClick={() => api.shutdownSystem()}
                          className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-700 transition-all active:scale-95"
                        >
                          Shutdown
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-8 md:p-10 bg-gray-50 dark:bg-gray-950/50 border-t dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400 font-bold text-xs uppercase tracking-widest">
              <ShieldCheck size={14}/> 
              <span>Protected Session</span>
            </div>
            <button 
              onClick={onSave}
              className="px-12 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/40 active:scale-95 flex items-center gap-3"
            >
              <Save size={18}/> Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
