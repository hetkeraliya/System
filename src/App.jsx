
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, RotateCcw, Settings, History, 
  X, Zap, Coffee, Shield, AlertCircle, Loader2, Eye, EyeOff, Smartphone
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, limit } from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'aura-focus-v7';

export default function App() {
  // --- Core State ---
  const [settings, setSettings] = useState({ work: 25, shortBreak: 5 });
  const [mode, setMode] = useState('work'); // 'work' | 'shortBreak'
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [user, setUser] = useState(null);
  
  // --- Tracking State ---
  const [isFocused, setIsFocused] = useState(true);
  const [distractions, setDistractions] = useState(0);
  const [appSwitches, setAppSwitches] = useState(0);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiActive, setIsAiActive] = useState(false);

  // --- UI State ---
  const [showEditor, setShowEditor] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);

  // --- Refs ---
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const faceMeshRef = useRef(null);
  const lastFocusState = useRef(true);
  const audioCtxRef = useRef(null);
  
  // Using refs for logic checks to avoid stale closures in callbacks
  const modeRef = useRef('work');
  const isActiveRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
    isActiveRef.current = isActive;
  }, [mode, isActive]);

  // --- Sound System ---
  const playSound = (type) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'end') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      } else {
        // Only play warning sounds in Work Mode
        if (modeRef.current !== 'work') return;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      }
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  };

  // --- App Switch Protection ---
  useEffect(() => {
    const handleVisibility = () => {
      // Penalty only if ACTIVE and in WORK mode
      if (document.hidden && isActiveRef.current && modeRef.current === 'work') {
        setAppSwitches(s => s + 1);
        playSound('alert');
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // --- AI Gaze Detection ---
  const onResults = useCallback((results) => {
    const isWorkMode = modeRef.current === 'work';
    const isCurrentlyActive = isActiveRef.current;

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const nose = landmarks[1];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const horizontalOffset = Math.abs(nose.x - (leftEye.x + rightEye.x) / 2);
      
      // Focus check
      const currentFocused = horizontalOffset < 0.08 && nose.y > 0.2 && nose.y < 0.8;
      
      if (currentFocused !== lastFocusState.current) {
        setIsFocused(currentFocused);
        // Penalty only if in WORK mode and timer is ACTIVE
        if (!currentFocused && isCurrentlyActive && isWorkMode) {
          setDistractions(d => d + 1);
          playSound('alert');
        }
        lastFocusState.current = currentFocused;
      }
    } else if (lastFocusState.current) {
      setIsFocused(false);
      // Penalty for leaving frame
      if (isCurrentlyActive && isWorkMode) {
        setDistractions(d => d + 1);
        playSound('alert');
      }
      lastFocusState.current = false;
    }
  }, []);

  const initAi = async () => {
    if (faceMeshRef.current) return true;
    setIsAiLoading(true);
    try {
      const load = (src) => new Promise(r => {
        const s = document.createElement('script'); s.src = src; s.onload = r; document.head.appendChild(s);
      });
      await load("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js");
      await load("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
      
      const fm = new window.FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
      fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      fm.onResults(onResults);
      faceMeshRef.current = fm;

      const cam = new window.Camera(videoRef.current, { 
        onFrame: async () => await fm.send({ image: videoRef.current }), 
        width: 640, height: 480 
      });
      await cam.start();
      setIsAiLoading(false);
      setIsAiActive(true);
      return true;
    } catch (e) {
      setIsAiLoading(false);
      return false;
    }
  };

  // --- Timer Engine ---
  const toggle = async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();

    if (!isActive) {
      const ok = await initAi();
      if (ok) {
        try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } catch(e) {}
        setIsActive(true);
      }
    } else {
      setIsActive(false);
    }
  };

  useEffect(() => {
    if (isActive && (isFocused || mode === 'shortBreak') && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    if (timeLeft === 0 && isActive) complete();
    return () => clearInterval(timerRef.current);
  }, [isActive, isFocused, timeLeft, mode]);

  const complete = async () => {
    setIsActive(false);
    playSound('end');
    
    // Save to Firestore ONLY if completing a WORK session
    if (user && mode === 'work') {
      try {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'sessions'), {
          distractions,
          appSwitches,
          timestamp: Date.now(),
          duration: settings.work,
          mode: 'work'
        });
      } catch (e) { console.error("History save failed", e); }
    }

    const next = mode === 'work' ? 'shortBreak' : 'work';
    setMode(next);
    setTimeLeft(settings[next] * 60);
    setDistractions(0); 
    setAppSwitches(0);
  };

  // --- Auth & Data Fetching ---
  useEffect(() => {
    const startAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
      else await signInAnonymously(auth);
    };
    startAuth();
    onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'users', user.uid, 'sessions');
    return onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({id: d.id, ...d.data()}));
      setHistory(logs.sort((a,b) => b.timestamp - a.timestamp));
    });
  }, [user]);

  const progress = (timeLeft / (settings[mode] * 60)) * 100;

  return (
    <div className="relative min-h-screen w-full bg-black flex flex-col items-center justify-center text-white overflow-hidden font-sans">
      
      {/* Background Full View */}
      <div className="absolute inset-0 z-0 bg-black">
        <video ref={videoRef} autoPlay muted playsInline className={`h-full w-full object-cover transition-all duration-1000 grayscale ${isActive && (isFocused || mode === 'shortBreak') ? 'opacity-40 blur-none' : 'opacity-10 blur-3xl'}`} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/80" />
        <div className={`absolute inset-0 transition-all duration-500 pointer-events-none ${!isFocused && isActive && mode === 'work' ? 'bg-red-500/10 shadow-[inset_0_0_100px_rgba(255,0,0,0.2)]' : ''}`} />
      </div>

      {/* Top HUD */}
      <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className={`w-1.5 h-1.5 rounded-full ${isAiActive ? 'bg-[#00ff88] shadow-[0_0_10px_#00ff88]' : 'bg-white/20'}`} />
            <span className="text-[10px] font-black tracking-[0.4em] uppercase opacity-40">Neural Sync</span>
          </div>
          <div className="text-[8px] font-bold text-neutral-600 uppercase tracking-widest">
            {mode === 'work' ? 'Tracking Active' : 'Resting: All actions allowed'}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowHistory(true)} className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all backdrop-blur-md"><History size={18} /></button>
          <button onClick={() => setShowEditor(true)} className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all backdrop-blur-md"><Settings size={18} /></button>
        </div>
      </header>

      {/* Main Timer Display */}
      <main className="relative z-10 flex flex-col items-center w-full max-w-sm px-8">
        
        {/* Mode Switcher */}
        <div className="flex bg-white/5 backdrop-blur-2xl rounded-full p-1 border border-white/5 mb-10">
          {['work', 'shortBreak'].map(m => (
            <button key={m} onClick={() => { setMode(m); setIsActive(false); setTimeLeft(settings[m]*60); }} className={`px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}>
              {m === 'work' ? 'Focus' : 'Break'}
            </button>
          ))}
        </div>

        {/* Circular Clock */}
        <div className="relative flex items-center justify-center mb-10">
          <svg width="240" height="240" className="-rotate-90">
            <circle cx="120" cy="120" r="105" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="3" />
            <circle cx="120" cy="120" r="105" fill="none" stroke={!isFocused && isActive && mode === 'work' ? '#ff4d4d' : '#00ff88'} strokeWidth="3" strokeDasharray="660" strokeDashoffset={660 - (progress / 100) * 660} strokeLinecap="round" className="transition-all duration-1000 ease-linear" />
          </svg>
          <div className="absolute text-center">
            <h1 className={`text-7xl md:text-8xl font-black tracking-tighter tabular-nums leading-none transition-all ${!isFocused && isActive && mode === 'work' ? 'text-red-500 blur-sm' : 'text-white'}`}>
              {Math.floor(timeLeft/60).toString().padStart(2,'0')}:{(timeLeft%60).toString().padStart(2,'0')}
            </h1>
          </div>
        </div>

        {/* Real-time Stats */}
        <div className="grid grid-cols-2 gap-3 w-full mb-10">
          <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center backdrop-blur-md">
            <div className="flex items-center justify-center gap-2 text-[8px] font-bold text-white/30 uppercase tracking-widest mb-1"><Eye size={10}/> Gaze</div>
            <div className={`text-xl font-bold ${distractions > 0 && mode === 'work' ? 'text-red-500' : 'text-white/20'}`}>{mode === 'work' ? distractions : '--'}</div>
          </div>
          <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center backdrop-blur-md">
            <div className="flex items-center justify-center gap-2 text-[8px] font-bold text-white/30 uppercase tracking-widest mb-1"><Smartphone size={10}/> App Exit</div>
            <div className={`text-xl font-bold ${appSwitches > 0 && mode === 'work' ? 'text-orange-500' : 'text-white/20'}`}>{mode === 'work' ? appSwitches : '--'}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-6">
          <button onClick={toggle} disabled={isAiLoading} className={`h-20 w-20 rounded-full flex items-center justify-center transition-all active:scale-95 ${isActive ? 'bg-white/10 text-white border border-white/20' : 'bg-white text-black shadow-xl hover:scale-105'}`}>
            {isAiLoading ? <Loader2 size={24} className="animate-spin" /> : isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
          </button>
          <button onClick={() => { setTimeLeft(settings[mode]*60); setIsActive(false); setDistractions(0); setAppSwitches(0); }} className="h-14 w-14 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-white/30 hover:text-white transition-all"><RotateCcw size={20}/></button>
        </div>
      </main>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6 text-left">
          <div className="bg-neutral-900 w-full max-w-sm rounded-[2rem] p-8 border border-white/5 relative">
            <button onClick={() => setShowEditor(false)} className="absolute top-8 right-8 text-white/20 hover:text-white"><X /></button>
            <h2 className="text-xl font-black italic tracking-tighter mb-8">Parameters</h2>
            <div className="space-y-8">
              {[{l:'Focus Work', k:'work', i:<Zap size={12}/>}, {l:'Short Break', k:'shortBreak', i:<Coffee size={12}/>}].map(i => (
                <div key={i.k} className="space-y-3">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <span className="flex items-center gap-2">{i.i} {i.l}</span>
                    <span className="text-white">{settings[i.k]}m</span>
                  </div>
                  <input type="range" min="1" max="90" value={settings[i.k]} onChange={e => {
                    const v = parseInt(e.target.value);
                    setSettings(s => ({...s, [i.k]: v}));
                    if(mode === i.k) setTimeLeft(v*60);
                  }} className="w-full accent-[#00ff88] h-1 bg-white/10 rounded-full appearance-none" />
                </div>
              ))}
              <button onClick={() => setShowEditor(false)} className="w-full bg-white text-black py-4 rounded-xl font-bold text-[10px] uppercase tracking-widest mt-4">Save Config</button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] bg-black p-8 overflow-y-auto">
          <div className="max-w-md mx-auto">
            <div className="flex justify-between items-center mb-16">
              <h2 className="text-4xl font-black italic tracking-tighter">Neural Archive</h2>
              <button onClick={() => setShowHistory(false)} className="p-3 bg-white/5 rounded-full"><X /></button>
            </div>
            <div className="space-y-4">
              {history.length === 0 ? <p className="text-center text-white/20 py-20 font-bold uppercase text-[10px]">No logs detected</p> : history.map((s, idx) => (
                <div key={idx} className="bg-white/5 border border-white/5 p-6 rounded-3xl flex justify-between items-center">
                  <div className="text-left">
                    <div className="text-[8px] font-bold text-white/30 uppercase mb-1">{new Date(s.timestamp).toLocaleDateString()} at {new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    <div className="font-bold text-sm">Focus Block Complete</div>
                    <div className="text-[10px] text-[#00ff88] font-bold">{s.duration} minutes</div>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <span className="text-[8px] text-white/30 uppercase block">Gaze</span>
                      <span className="text-xs font-bold text-red-500">{s.distractions}</span>
                    </div>
                    <div className="text-center">
                      <span className="text-[8px] text-white/30 uppercase block">Exit</span>
                      <span className="text-xs font-bold text-orange-500">{s.appSwitches || 0}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: white; cursor: pointer; border: 3px solid black; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}} />

    </div>
  );
}

        
