import { useState, useEffect } from 'react';
import { X, ChevronDown, Folder, RefreshCw } from 'lucide-react';
import { api } from '../api/client';

export function FolderSelectorModal({ currentPath, onClose, onSelect }: { currentPath: string, onClose: () => void, onSelect: (path: string) => void }) {
  const [folders, setFolders] = useState<any[]>([]);
  const [path, setPath] = useState(currentPath);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.browseFolders(path);
        setFolders(data.folders || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [path]);

  const goUp = () => {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    setPath('/' + parts.join('/'));
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-[3rem] shadow-2xl w-full max-w-2xl h-[600px] overflow-hidden flex flex-col border dark:border-gray-800">
        <div className="p-8 md:p-10 border-b dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-950/50">
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Select Folder</h3>
            <p className="text-xs font-mono text-gray-400 break-all">{path || '/'}</p>
          </div>
          <button onClick={onClose} className="p-3 bg-white dark:bg-gray-800 text-gray-400 hover:text-red-500 rounded-2xl shadow-xl transition-all active:scale-90"><X size={24}/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-2 bg-white dark:bg-gray-900">
          <button 
            onClick={goUp}
            className="w-full text-left px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl flex items-center gap-4 text-blue-600 font-black uppercase text-[10px] tracking-[0.2em] transition-all"
          >
            <ChevronDown size={18} className="rotate-90" /> Parent Directory
          </button>
          
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4 opacity-50">
              <RefreshCw className="animate-spin" size={32} />
              <span className="text-[10px] font-black uppercase tracking-widest">Scanning Disk...</span>
            </div>
          ) : (
            folders.map((folder, idx) => (
              <button 
                key={idx}
                onClick={() => setPath(folder.path)}
                className="w-full text-left px-6 py-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-2xl flex items-center gap-4 group transition-all"
              >
                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <Folder size={18}/>
                </div>
                <span className="font-bold text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">{folder.name === ".." ? ".." : folder.name}</span>
              </button>
            ))
          )}
        </div>

        <div className="p-8 bg-gray-50 dark:bg-gray-950/50 border-t dark:border-gray-800 flex gap-4">
          <button onClick={() => onSelect(path)} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-blue-500/40 hover:bg-blue-700 transition-all active:scale-95">Set Download Path</button>
        </div>
      </div>
    </div>
  );
}
