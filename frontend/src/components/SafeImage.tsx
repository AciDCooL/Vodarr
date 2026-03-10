import { useState } from 'react';
import { X } from 'lucide-react';

export function SafeImage({ src, alt, className, fallbackIcon: Icon, iconSize = 24 }: { src?: string, alt: string, className?: string, fallbackIcon?: any, iconSize?: number }) {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div className={`${className} bg-gray-100 dark:bg-gray-800 flex items-center justify-center relative overflow-hidden`}>
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <Icon size={iconSize * 2} />
        </div>
        <div className="bg-red-500/10 text-red-500 p-2 rounded-full transform -rotate-12 border-2 border-red-500/20 shadow-lg">
          <X size={iconSize} className="animate-in spin-in-12" />
        </div>
      </div>
    );
  }

  return (
    <img 
      src={src} 
      alt={alt} 
      className={className} 
      loading="lazy" 
      referrerPolicy="no-referrer"
      onError={() => setError(true)}
    />
  );
}
