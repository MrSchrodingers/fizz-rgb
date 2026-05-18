import { useEffect, useState } from 'react';

export default function App() {
  const [version, setVersion] = useState<string>('…');
  const [status, setStatus] = useState<string>('connecting…');

  useEffect(() => {
    if (!window.fizz) {
      setStatus('window.fizz not available — preload failed');
      return;
    }
    window.fizz.daemonVersion()
      .then((v) => setVersion(v.version))
      .catch((e: Error) => setStatus(`daemon error: ${e.message}`));
    window.fizz.deviceStatus()
      .then((s) => setStatus(s.connected ? 'connected' : 'disconnected'))
      .catch(() => setStatus('disconnected (daemon offline?)'));
  }, []);

  return (
    <main className="flex flex-col items-center justify-center h-full gap-4">
      <h1 className="text-2xl font-bold">Fizz RGB</h1>
      <p className="text-zinc-400">scaffold ready — Batch 2 will build the real UI</p>
      <p>Daemon: v{version}</p>
      <p>Device: {status}</p>
    </main>
  );
}
