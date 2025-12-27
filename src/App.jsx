

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, RotateCcw, Settings, History, 
  X, Zap, Coffee, Shield, EyeOff, 
  Smartphone, Volume2, Target, Flame, Calendar, Loader2,
  Battery, Wifi, WifiOff, AlertTriangle
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, limit } from 'firebase/firestore';

// --- YOUR INTEGRATED FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyDivV4vQYujhG6lBQkAGxgvmF2JJOwUYGY",
  authDomain: "productivety-app.firebaseapp.com",
  projectId: "productivety-app",
  storageBucket: "productivety-app.firebasestorage.app",
  messagingSenderId: "676233842288",
  appId: "1:676233842288:web:b356d5eff17c68379c6eb5",
  measurementId: "G-W3LCRZP9K1"
};

// Global Initialization
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const APP_ID = "aura-pro-ultimate-v16";

// Styles Injector for Vercel
const injectTailwind = () => {
  if (!document.getElementById('tailwind-cdn')) {
    const script = document.createElement('script');
    script.id = 'tailwind-cdn';
    script.src = 'https://cdn.tailwindcss.com';
    document.head.appendChild(script);
  }
};

export default function App() {
  const [error, setError] = useState(null);
  
  // Try to inject styles immediately
  useEffect(() => {
    try { injectTailwind(); } catch (e) { setError("Style injection failed"); }
  }, []);

  // --- Core State ---
  const [settings, setSettings] = useState({ work: 25, shortBreak: 5, objective: "Deep Work Protocol" });
  const [mode, setMode] = useState('work'); 
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [user, setUser] = useState(null);
  const [ambientType, setAmbientType] = useState('off'); 
  const [isFocused, setIsFocused] = useState(true);
  const [distractions, setDistractions] = useState(0);
  const [appSwitches, setAppSwitches] = useState(0);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [battery, setBattery] = useState({ level: 100, charging: true });
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // --- Logic Refs ---
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const faceMeshRef = useRef(null);
  const audioCtxRef = useRef(null);
  const ambientNodes = useRef({ carrier: null, modulator: null });
  const isFocusedRef = useRef(true); 
  const statsRef = useRef({ distractions: 0, appSwitches: 0 });
  const sessionRef = useRef({ mode: 'work', isActive: false });

  useEffect(() => {
    sessionRef.current = { mode, isActive };
  }, [mode, isActive]);

  // --- Audio Engine ---
  const stopAmbient = () => {
    if (ambientNodes.current.carrier) { try { ambientNodes.current.carrier.stop(); ambientNodes.current.carrier.disconnect(); } catch(e) {} }
    if (ambientNodes.current.modulator) { try { ambientNodes.current.modulator.stop(); ambientNodes.current.modulator.disconnect(); } catch(e) {} }
    ambientNodes.current = { carrier: null, modulator: null };
  };

  const startAmbient = async (type) => {
    if (type === 'off') { stopAmbient(); return; }
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      stopAmbient();
      const mainGain = ctx.createGain();
      mainGain.gain.setValueAtTime(0.06, ctx.currentTime);
      mainGain.connect(ctx.destination);

      if (type === 'rain') {
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer; whiteNoise.loop = true;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(400, ctx.currentTime);
        whiteNoise.connect(filter); filter.connect(mainGain); whiteNoise.start(); ambientNodes.current.carrier = whiteNoise;
      } else {
        const carrier = ctx.createOscillator(); carrier.frequency.setValueAtTime(220, ctx.currentTime);
        const modulator = ctx.createOscillator();
        const targetFreq = type === 'alpha' ? 10 : type === 'theta' ? 6 : 40;
        modulator.frequency.setValueAtTime(targetFreq, ctx.currentTime);
        const amGain = ctx.createGain(); amGain.gain.setValueAtTime(0.5, ctx.currentTime);
        modulator.connect(amGain); amGain.connect(mainGain.gain); carrier.connect(mainGain);
        carrier.start(); modulator.start(); ambientNodes.current = { carrier, modulator };
      }
    } catch (e) { console.error(e); }
  };

  const playEffect = (type) => {
    try {
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      if (type === 'end') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
      } else {
        if (sessionRef.current.mode !== 'work') return;
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(130, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
      }
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch (e) {}
  };

  // --- AI State Machine ---
  const onAiResults = useCallback((results) => {
    const { mode, isActive } = sessionRef.current;
    let currentlySeen = false;
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const nose = landmarks[1];
      currentlySeen = Math.abs(nose.x - 0.5) < 0.12 && nose.y > 0.15 && nose.y < 0.85;
    }

    if (isFocusedRef.current !== currentlySeen) {
      isFocusedRef.current = currentlySeen;
      setIsFocused(currentlySeen);
      if (!currentlySeen && isActive && mode === 'work') {
        statsRef.current.distractions += 1;
        setDistractions(statsRef.current.distractions);
        playEffect('alert');
      }
    }
  }, []);

  const initAi = async () => {
    if (faceMeshRef.current) return true;
    setIsAiLoading(true);
    try {
      const load = (src) => new Promise((res, rej) => {
        const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
      await load("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js");
      await load("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
      const fm = new window.FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
      fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      fm.onResults(onAiResults);
      faceMeshRef.current = fm;
      const cam = new window.Camera(videoRef.current, { onFrame: async () => await fm.send({ image: videoRef.current }), width: 640, height: 480 });
      await cam.start();
      setIsAiLoading(false); return true;
    } catch (e) { 
      setIsAiLoading(false); 
      setError("Camera or AI scripts failed to load. Check permissions.");
      return false; 
    }
  };

  const toggleFocus = async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
    if (!isActive) {
      const ok = await initAi();
      if (ok) {
        setIsActive(true);
        if (ambientType !== 'off') startAmbient(ambientType);
      }
    } else {
      setIsActive(false); stopAmbient();
    }
  };

  // --- Global Listeners ---
  useEffect(() => {
    const handleVis = () => {
      if (document.hidden && sessionRef.current.isActive && sessionRef.current.mode === 'work') {
        statsRef.current.appSwitches += 1;
        setAppSwitches(statsRef.current.appSwitches);
        playEffect('alert');
      }
    };
    document.addEventListener("visibilitychange", handleVis);

    const initFirebase = async () => {
      try {
        const res = await signInAnonymously(auth);
        const u = res.user;
        setUser(u);
        // RULE 1: STRICT PATH
        const q = collection(db, 'artifacts', APP_ID, 'users', u.uid, 'sessions');
        onSnapshot(q, (snap) => {
          const logs = snap.docs.map(d => d.data());
          setHistory(logs.sort((a,b) => b.timestamp - a.timestamp));
        });
      } catch (e) { console.error("Auth Error", e); }
    };
    initFirebase();

    if ('getBattery' in navigator) {
      navigator.getBattery().then(batt => {
        const up = () => setBattery({ level: Math.round(batt.level * 100), charging: batt.charging });
        up(); batt.addEventListener('levelchange', up);
      });
    }

    return () => document.removeEventListener("visibilitychange", handleVis);
  }, []);

  // --- Timer Engine ---
  useEffect(() => {
    if (isActive && (isFocused || mode === 'shortBreak') && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    
    if (timeLeft === 0 && isActive) {
      setIsActive(false); stopAmbient(); playEffect('end');
      if (user && mode === 'work') {
        const score = Math.max(0, 100 - (statsRef.current.distractions * 5) - (statsRef.current.appSwitches * 15));
        const col = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'sessions');
        addDoc(col, {
          distractions: statsRef.current.distractions,
          score, objective: settings.objective, timestamp: Date.now(), duration: settings.work
        });
      }
      const nextMode = mode === 'work' ? 'shortBreak' : 'work';
      setMode(nextMode);
      setTimeLeft(settings[nextMode === 'work' ? 'work' : 'shortBreak'] * 60);
      setDistractions(0); setAppSwitches(0); statsRef.current = { distractions: 0, appSwitches: 0 };
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, isFocused, timeLeft, mode]);

  // Error Boundary View
  if (error) {
    return <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-12 text-center">
      <AlertTriangle className="text-red-500 mb-4" size={48} />
      <h1 className="text-xl font-bold mb-2">System Interrupted</h1>
      <p className="text-white/40 text-sm">{error}</p>
      <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-white text-black rounded-lg font-bold">Restart Engine</button>
    </div>
  }

  return (
    <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center text-white overflow-hidden font-sans relative select-none">
      {/* Background Cinematic Layer */}
      <div className="absolute inset-0 z-0">
        <video ref={videoRef} autoPlay muted playsInline className={`h-full w-full object-cover transition-all duration-1000 grayscale ${isActive ? 'opacity-30 scale-105' : 'opacity-10 blur-3xl'}`} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-transparent to-black/90" />
        <div className={`absolute inset-0 transition-all duration-700 pointer-events-none ${!isFocused && isActive && mode === 'work' ? 'bg-red-500/10 shadow-[inset_0_0_120px_rgba(255,0,0,0.4)]' : ''}`} />
      </div>

      <header className="absolute top-0 w-full p-4 flex justify-between z-50">
        <div className="flex flex-col">
          <span className="text-[10px] font-black tracking-[0.4em] opacity-30 uppercase italic">Aura Sync Pro</span>
          <div className="flex items-center gap-3 mt-1 text-[8px] font-bold text-neutral-500 uppercase">
            <span className="flex items-center gap-1 text-orange-500"><Flame size={10}/> {history.length}</span>
            <span className={battery.level < 20 ? 'text-red-500' : ''}><Battery size={10} /> {battery.level}%</span>
            <span>{isOnline ? <Wifi size={10} className="text-emerald-500"/> : <WifiOff size={10} className="text-red-500"/>}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowHistory(true)} className="p-2.5 bg-white/5 rounded-xl border border-white/5 active:scale-90"><History size={16}/></button>
          <button onClick={() => setShowEditor(true)} className="p-2.5 bg-white/5 rounded-xl border border-white/5 active:scale-90"><Settings size={16}/></button>
        </div>
      </header>

      <main className="relative z-10 flex flex-col items-center w-full max-w-xs px-4 scale-95 md:scale-100">
        {isActive && mode === 'work' && (
          <div className="mb-4 px-4 py-1.5 bg-white/5 border border-white/10 rounded-full backdrop-blur-md animate-in fade-in slide-in-from-top-4">
             <span className="text-[10px] font-black uppercase tracking-widest text-[#00ff88] flex items-center gap-2 italic"><Target size={12}/> {settings.objective}</span>
          </div>
        )}

        <div className="flex bg-white/5 backdrop-blur-3xl rounded-full p-1 border border-white/5 mb-8">
          {['work', 'shortBreak'].map(m => (
            <button key={m} onClick={() => { setMode(m); setIsActive(false); setTimeLeft(settings[m === 'work' ? 'work' : 'shortBreak']*60); }} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-white text-black shadow-2xl' : 'text-white/30 hover:text-white'}`}>
              {m === 'work' ? 'Focus' : 'Break'}
            </button>
          ))}
        </div>

        <div className="relative flex items-center justify-center mb-8">
          <svg width="210" height="210" className="-rotate-90 absolute"><circle cx="105" cy="105" r="90" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" /></svg>
          <svg width="210" height="210" className="-rotate-90">
            <circle cx="105" cy="105" r="90" fill="none" stroke={!isFocused && isActive && mode === 'work' ? '#ff4d4d' : '#00ff88'} strokeWidth="3" strokeDasharray="565" strokeDashoffset={565 - ((timeLeft/(settings[mode === 'work' ? 'work' : 'shortBreak']*60))*565)} strokeLinecap="round" className="transition-all duration-1000 ease-linear" />
          </svg>
          <div className="absolute text-center">
            <h1 className="text-6xl font-black tabular-nums tracking-tighter leading-none">{Math.floor(timeLeft/60).toString().padStart(2,'0')}:{(timeLeft%60).toString().padStart(2,'0')}</h1>
            <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-white/30 mt-2">{mode === 'work' ? 'Neural Link' : 'System Rest'}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full mb-8">
          <div className="bg-white/5 border border-white/5 p-4 rounded-[2rem] text-center backdrop-blur-sm">
            <div className="text-[7px] font-bold text-white/30 uppercase tracking-widest mb-0.5">Gaze Pen</div>
            <div className={`text-2xl font-black ${distractions > 0 && mode === 'work' ? 'text-red-500' : 'text-white/30'}`}>{mode === 'work' ? distractions : '--'}</div>
          </div>
          <div className="bg-white/5 border border-white/5 p-4 rounded-[2rem] text-center backdrop-blur-sm">
            <div className="text-[7px] font-bold text-white/30 uppercase tracking-widest mb-0.5">App Exit</div>
            <div className={`text-2xl font-black ${appSwitches > 0 && mode === 'work' ? 'text-orange-500' : 'text-white/30'}`}>{mode === 'work' ? appSwitches : '--'}</div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button onClick={toggleFocus} disabled={isAiLoading} className={`h-16 w-16 rounded-full flex items-center justify-center transition-all active:scale-95 ${isActive ? 'bg-white/10' : 'bg-white text-black shadow-2xl'}`}>
            {isAiLoading ? <Loader2 size={24} className="animate-spin" /> : isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
          </button>
          <button onClick={() => { setTimeLeft(settings.work*60); setIsActive(false); stopAmbient(); setDistractions(0); setAppSwitches(0); statsRef.current = {distractions:0, appSwitches:0}; isFocusedRef.current = true; setIsFocused(true); }} className="h-12 w-12 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-white/30 active:scale-90"><RotateCcw size={20}/></button>
        </div>
      </main>

      {showEditor && (
        <div className="fixed inset-0 z-[100] bg-black/98 p-8 flex flex-col justify-center backdrop-blur-3xl overflow-y-auto">
          <div className="max-w-xs mx-auto w-full space-y-8">
            <div className="flex justify-between items-center mb-4">
               <h2 className="text-3xl font-black italic tracking-tighter italic">Parameters</h2>
               <X onClick={() => setShowEditor(false)} className="text-white/20 cursor-pointer" />
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                 <label className="text-[8px] font-bold uppercase tracking-widest text-white/30 ml-2">Neural Objective</label>
                 <input type="text" value={settings.objective} onChange={e => setSettings({...settings, objective: e.target.value})} className="w-full bg-white/5 border border-white/10 p-4 rounded-3xl text-xs font-black outline-none focus:border-[#00ff88]/30 transition-all text-white" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[9px] uppercase font-bold text-white/40 tracking-widest">Focus <span>{settings.work}m</span></div>
                <input type="range" min="1" max="90" value={settings.work} onChange={e => { const v = parseInt(e.target.value); setSettings({...settings, work: v}); if(mode==='work') setTimeLeft(v*60); }} className="w-full h-1 bg-white/10 accent-[#00ff88] rounded-full appearance-none" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[9px] uppercase font-bold text-white/40 tracking-widest">Break <span>{settings.shortBreak}m</span></div>
                <input type="range" min="1" max="30" value={settings.shortBreak} onChange={e => { const v = parseInt(e.target.value); setSettings({...settings, shortBreak: v}); if(mode==='shortBreak') setTimeLeft(v*60); }} className="w-full h-1 bg-white/10 accent-[#00ff88] rounded-full appearance-none" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['off', 'alpha', 'theta', 'gamma', 'rain'].map(t => (
                  <button key={t} onClick={() => { setAmbientType(t); if(isActive) startAmbient(t); }} className={`py-3 rounded-xl text-[9px] font-black uppercase border transition-all ${ambientType === t ? 'border-[#00ff88] text-[#00ff88] bg-[#00ff88]/5' : 'border-white/10 text-white/20'}`}>{t}</button>
                ))}
              </div>
            </div>
            <button onClick={() => setShowEditor(false)} className="w-full bg-white text-black py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl">Confirm Logic</button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-[100] bg-black p-8 overflow-y-auto backdrop-blur-3xl">
          <div className="max-w-xl mx-auto">
            <header className="flex justify-between items-center mb-12">
              <h2 className="text-4xl font-black italic tracking-tighter">Archive</h2>
              <X onClick={() => setShowHistory(false)} className="text-white/20 h-10 w-10 cursor-pointer" />
            </header>
            {history.length === 0 ? <p className="text-center text-white/10 py-32 font-black uppercase tracking-[0.5em] text-[8px]">Neural archive empty</p> : (
              <div className="space-y-4 pb-20">
                {history.map((s, i) => (
                  <div key={i} className="bg-white/5 border border-white/5 p-6 rounded-[2.5rem] flex justify-between items-center">
                    <div className="text-left">
                      <div className="text-[10px] font-bold text-white/20 uppercase mb-2 tracking-widest">{new Date(s.timestamp).toLocaleDateString()}</div>
                      <div className="text-lg font-bold mb-1">{s.objective || "Protocol Session"}</div>
                      <div className="text-[10px] text-[#00ff88] font-black tracking-widest uppercase">{s.score}% Accuracy</div>
                    </div>
                    <div className="text-center">
                      <span className="text-[9px] text-white/20 uppercase block font-black mb-1">Gaze</span>
                      <span className="text-2xl font-black text-red-500">{s.distractions}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: white; border: 3px solid black; cursor: pointer; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}} />
    </div>
  );
}
