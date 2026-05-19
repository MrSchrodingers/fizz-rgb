import { useEffect, useRef, useState } from 'react';
import { usePaintStore } from '../stores/paintStore.js';
import { Plus, Play, Square, Trash2 } from 'lucide-react';

interface Frame {
  keys: Record<number, string>;
}

const TIMELINE_STORAGE_KEY = 'fizz-timeline';

function loadTimeline(): Frame[] {
  try {
    return JSON.parse(localStorage.getItem(TIMELINE_STORAGE_KEY) ?? '[]') as Frame[];
  } catch {
    return [];
  }
}

export function TimelineEditor() {
  const [frames, setFrames] = useState<Frame[]>(loadTimeline);
  const [fps, setFps] = useState(2);
  const [playing, setPlaying] = useState(false);
  const [activeFrame, setActiveFrame] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameIndexRef = useRef(0);

  const keyColors = usePaintStore((s) => s.keyColors);

  // Persist frames to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(frames));
  }, [frames]);

  function captureFrame() {
    const keys: Record<number, string> = {};
    keyColors.forEach((hex, idx) => { keys[idx] = hex; });
    const next = [...frames, { keys }];
    setFrames(next);
  }

  function removeFrame(idx: number) {
    setFrames(frames.filter((_, i) => i !== idx));
    if (activeFrame === idx) setActiveFrame(null);
  }

  function loadFrame(idx: number) {
    const f = frames[idx];
    if (!f) return;
    setActiveFrame(idx);
    const map = new Map<number, string>();
    Object.entries(f.keys).forEach(([k, v]) => map.set(Number(k), v));
    usePaintStore.setState({ keyColors: map });
  }

  function stopPlayback() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
  }

  function startPlayback() {
    if (frames.length === 0) return;
    frameIndexRef.current = 0;
    setPlaying(true);

    intervalRef.current = setInterval(() => {
      const f = frames[frameIndexRef.current];
      if (f && window.fizz) {
        const colors: Record<string, string> = {};
        Object.entries(f.keys).forEach(([k, v]) => { colors[k] = v; });
        window.fizz.perkeySet(colors).catch(() => {});
      }
      frameIndexRef.current = (frameIndexRef.current + 1) % frames.length;
    }, 1000 / fps);
  }

  function togglePlay() {
    if (playing) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Restart playback if fps changes while playing
  useEffect(() => {
    if (playing) {
      stopPlayback();
      startPlayback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fps]);

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/80 px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-medium">Timeline Editor</h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={captureFrame}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-200"
          >
            <Plus className="w-3 h-3" /> Add frame
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={frames.length === 0}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded disabled:opacity-30 ${
              playing
                ? 'bg-red-500/20 hover:bg-red-500/30 text-red-200'
                : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200'
            }`}
          >
            {playing ? <><Square className="w-3 h-3" /> Stop</> : <><Play className="w-3 h-3" /> Play</>}
          </button>
        </div>
        <label className="flex items-center gap-1 text-xs text-zinc-400 ml-1">
          FPS:
          <input
            type="number"
            value={fps}
            min={1}
            max={10}
            onChange={(e) => setFps(Math.max(1, Math.min(10, Number(e.target.value))))}
            className="w-12 px-1 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-xs"
          />
        </label>
        <span className="text-xs text-zinc-500 ml-auto">
          {frames.length} frame{frames.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {frames.length === 0 && (
          <p className="text-xs text-zinc-500 py-2">
            Pinta o teclado, depois clica "Add frame" pra capturar.
          </p>
        )}
        {frames.map((f, i) => {
          const entries = Object.entries(f.keys);
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              className={`group relative flex-shrink-0 w-14 h-11 rounded border cursor-pointer overflow-hidden transition ${
                activeFrame === i
                  ? 'border-fuchsia-400 ring-1 ring-fuchsia-500/40'
                  : 'border-zinc-700 hover:border-fuchsia-400/60'
              }`}
              onClick={() => loadFrame(i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') loadFrame(i); }}
            >
              {/* Mini thumbnail grid */}
              <div className="grid gap-px h-full w-full p-px" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                {Array.from({ length: 30 }, (_, ci) => {
                  const e = entries[ci];
                  return (
                    <div
                      key={ci}
                      className="rounded-sm"
                      style={{ background: e ? e[1] : '#1a1a1f' }}
                    />
                  );
                })}
              </div>

              {/* Frame number */}
              <div className="absolute bottom-0 left-0 right-0 text-center text-[8px] text-zinc-400 bg-zinc-900/70 leading-tight py-px">
                {i + 1}
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeFrame(i); }}
                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-0.5 bg-red-500/80 hover:bg-red-500 rounded-bl text-white transition"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
