import { useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { api } from '../api/client';

export function LoginModal({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.login({ username, password });
      if (data.access_token) {
        api.setAuthToken(data.access_token);
        onLogin();
      } else {
        setError(data.detail || 'Login failed');
      }
    } catch (err) {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[500] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border dark:border-gray-800 animate-in zoom-in-95 duration-500">
        <div className="p-10 md:p-12 space-y-10">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white mx-auto shadow-2xl shadow-blue-500/40 animate-bounce-slow">
              <ShieldCheck size={40} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">Identity Check</h2>
              <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mt-3">Authentication Required</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Username</label>
              <input 
                autoFocus
                className="w-full border-none rounded-2xl px-6 py-4 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Password</label>
              <input 
                type="password"
                className="w-full border-none rounded-2xl px-6 py-4 bg-gray-100 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-xs font-bold text-red-500 text-center bg-red-50 dark:bg-red-900/20 py-3 rounded-xl border border-red-100 dark:border-red-800/50">{error}</p>}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-2xl shadow-blue-500/40 active:scale-95 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin mx-auto" size={18} /> : 'Unlock Application'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
