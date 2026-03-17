import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export function Toast({ message, type, onClose }: { message: string, type: 'success' | 'error' | 'info', onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[1000] animate-in slide-in-from-top-10 duration-500">
      <div className={`px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-4 border-2 ${
        type === 'success' ? 'bg-green-500 border-green-400 text-white' : 
        type === 'error' ? 'bg-red-500 border-red-400 text-white' : 
        'bg-blue-600 border-blue-400 text-white'
      }`}>
        {type === 'success' ? <CheckCircle2 size={20}/> : type === 'error' ? <AlertCircle size={20}/> : <RefreshCw className="animate-spin" size={20}/>}
        <span className="font-black uppercase tracking-widest text-[10px] whitespace-nowrap">{message}</span>
      </div>
    </div>
  );
}
