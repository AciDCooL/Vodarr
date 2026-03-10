import { useState } from 'react';
import { 
  Server, Folder, ShieldCheck, CheckCircle2, 
  ChevronRight, Check 
} from 'lucide-react';
import { Config } from '../types';
import { FolderSelectorModal } from './FolderSelectorModal';

export function SetupWizard({ config, setConfig, onSave }: { config: Config, setConfig: (c: Config) => void, onSave: () => void }) {
  const [step, setStep] = useState<'provider' | 'storage' | 'security' | 'finish'>('provider');
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  const steps = [
    { id: 'provider', label: 'Provider', icon: <Server size={20}/>, description: 'Xtream API Details' },
    { id: 'storage', label: 'Storage', icon: <Folder size={20}/>, description: 'Download Paths' },
    { id: 'security', label: 'Security', icon: <ShieldCheck size={20}/>, description: 'Admin Access' },
    { id: 'finish', label: 'Ready', icon: <CheckCircle2 size={20}/>, description: 'Finalize Setup' },
  ] as const;

  const handleNext = () => {
    if (step === 'provider') setStep('storage');
    else if (step === 'storage') setStep('security');
    else if (step === 'security') setStep('finish');
  };

  const handleBack = () => {
    if (step === 'storage') setStep('provider');
    else if (step === 'security') setStep('storage');
    else if (step === 'finish') setStep('security');
  };

  return (
    <div className="fixed inset-0 bg-gray-100 dark:bg-gray-950 z-[400] flex items-center justify-center p-4">
      {showFolderPicker && (
        <FolderSelectorModal 
          currentPath={config.download_dir}
          onClose={() => setShowFolderPicker(false)}
          onSelect={(p) => setConfig({...config, download_dir: p})}
        />
      )}
      <div className="bg-white dark:bg-gray-900 rounded-[4rem] shadow-2xl w-full max-w-4xl overflow-hidden border dark:border-gray-800 flex flex-col md:flex-row h-[700px]">
        {/* Sidebar */}
        <div className="w-full md:w-80 bg-blue-600 p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32 blur-3xl" />
          <div className="relative z-10 space-y-12">
            <div className="space-y-2">
              <h1 className="text-4xl font-black uppercase tracking-tighter italic leading-none">Vodarr<span className="text-blue-200">.</span></h1>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-200 opacity-80">Initial Configuration</p>
            </div>
            
            <div className="space-y-8">
              {steps.map((s, idx) => (
                <div key={s.id} className={`flex items-center gap-6 transition-all duration-500 ${step === s.id ? 'translate-x-2' : 'opacity-40 grayscale scale-95'}`}>
                  <div className={`w-14 h-14 rounded-3xl flex items-center justify-center shadow-2xl ${step === s.id ? 'bg-white text-blue-600 scale-110 rotate-3' : 'bg-blue-500 text-white'}`}>
                    {s.icon}
                  </div>
                  <div className="hidden lg:block">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Step 0{idx + 1}</p>
                    <p className="text-lg font-black uppercase tracking-tight leading-none">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative z-10">
            <p className="text-[10px] font-medium leading-relaxed opacity-60">Complete these steps to unlock your VOD library and start high-speed downloads.</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-12 md:p-20 flex flex-col justify-between bg-white dark:bg-gray-900">
          <div className="space-y-10">
            {step === 'provider' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-500">
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Xtream API</h2>
                  <p className="text-sm text-gray-500 font-medium">Enter your IPTV provider credentials to sync the catalog.</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Server URL</label>
                    <input 
                      className="w-full border-none rounded-3xl px-8 py-5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold text-lg"
                      placeholder="http://provider.com:8080"
                      value={config.base_url} 
                      onChange={e => setConfig({...config, base_url: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Username</label>
                      <input 
                        className="w-full border-none rounded-3xl px-8 py-5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold"
                        value={config.username} 
                        onChange={e => setConfig({...config, username: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Password</label>
                      <input 
                        type="password"
                        className="w-full border-none rounded-3xl px-8 py-5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold"
                        value={config.password} 
                        onChange={e => setConfig({...config, password: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'storage' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-500">
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Storage</h2>
                  <p className="text-sm text-gray-500 font-medium">Where should we save your high-quality downloads?</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Download Path</label>
                    <div className="flex gap-4">
                      <input 
                        className="flex-1 border-none rounded-3xl px-8 py-5 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold"
                        value={config.download_dir} 
                        onChange={e => setConfig({...config, download_dir: e.target.value})}
                      />
                      <button 
                        onClick={() => setShowFolderPicker(true)}
                        className="w-20 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-3xl hover:bg-blue-600 hover:text-white transition-all active:scale-95 border-2 border-transparent hover:border-blue-500/20"
                      >
                        <Folder size={20}/>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'security' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-500">
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Security</h2>
                  <p className="text-sm text-gray-500 font-medium">Protect administrative access to your Vodarr instance.</p>
                </div>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6 bg-blue-50/50 dark:bg-blue-900/10 p-8 rounded-[3rem] border border-blue-100 dark:border-blue-800/50">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 ml-1">Admin Username</label>
                      <input 
                        className="w-full border-none rounded-2xl px-6 py-4 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold"
                        value={config.admin_username} 
                        onChange={e => setConfig({...config, admin_username: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 ml-1">Admin Password</label>
                      <input 
                        type="password"
                        className="w-full border-none rounded-2xl px-6 py-4 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-bold"
                        placeholder="Required"
                        value={config.admin_password || ''} 
                        onChange={e => setConfig({...config, admin_password: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'finish' && (
              <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 text-center">
                <div className="w-24 h-24 bg-green-500 text-white rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-green-500/40">
                  <Check size={48} strokeWidth={4} />
                </div>
                <div className="space-y-4">
                  <h2 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Ready to Go</h2>
                  <p className="text-sm text-gray-500 font-medium max-w-sm mx-auto">Your configuration is complete. Press the button below to sync your provider's library.</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            {step !== 'provider' && (
              <button onClick={handleBack} className="px-10 py-5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-3xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95">Back</button>
            )}
            
            {step !== 'finish' ? (
              <button 
                onClick={handleNext}
                disabled={step === 'security' && !config.admin_password}
                className="flex-1 py-5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-3xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] transition-all shadow-2xl active:scale-95 disabled:opacity-50"
              >
                Continue <ChevronRight className="inline-block ml-2" size={16}/>
              </button>
            ) : (
              <button 
                onClick={onSave}
                className="flex-1 py-5 bg-blue-600 text-white rounded-3xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/40 active:scale-95"
              >
                Finish Setup
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
