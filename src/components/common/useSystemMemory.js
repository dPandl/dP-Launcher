import { useState, useEffect } from 'react';

// Eingebauter RAM des PCs und das Maximum, das der Launcher anbietet (ohne App: 16 GB)
export default function useSystemMemory() {
  const [memory, setMemory] = useState({ totalGb: null, maxGb: 16 });
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.getSystemMemory?.().then(res => {
      if (!cancelled && res?.maxGb) setMemory(res);
    });
    return () => { cancelled = true; };
  }, []);
  return memory;
}
