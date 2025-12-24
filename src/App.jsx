
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Settings, History, 
  X, Zap, Coffee, Shield, EyeOff, 
  Smartphone, Volume2, Target, Flame, Calendar, Loader2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot } from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'aura-focus-v11-compact';

export default function App() {
  // --- Core State ---
  const [settings, setSettings] = useState({ 
    work: 25, 
    shortBreak: 5, 
    objective: "Deep Focus Session"
  });
  const [mode, setMode] = useState('work'); 
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [user, setUser] = useState(null);
  
  // --- Audio State ---
  const [ambientType, setAmbientType] = useState('off'); 

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
  const ambientNodes = useRef({ carrier: null, modulator: null });
  
  const statsRef = useRef({ distractions: 0, appSwitches: 0 });
  const modeRef = useRef('work');
  const isActiveRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
    isActiveRef.current = isActive;
  }, [mode, isActive]);

  // --- Neural Audio Engine (Optimized for Mobile) ---
  const stopAmbient = () => {
    if (ambientNodes.current.carrier) {
      try { ambientNodes.current.carrier.stop(); ambientNodes.current.carrier.disconnect(); } catch(e) {}
    }
    if (ambientNodes.current.modulator) {
      try { ambientNodes.current.modulator.stop(); ambientNodes.current.modulator.disconnect(); } catch(e) {}
    }
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

      const carrier = ctx.createOscillator();
      carrier.type = 'sine'; carrier.frequency.setValueAtTime(200, ctx.currentTime);
      const modulator = ctx.createOscillator();
      const modGain = ctx.createGain();
      const targetFreq = type === 'alpha' ? 10 : type === 'theta' ? 6 : 40;
      modulator.frequency.setValueAtTime(targetFreq, ctx.currentTime);
      modGain.gain.setValueAtTime(0.5, ctx.currentTime);
      const amGain = ctx.createGain();
      amGain.gain.setValueAtTime(0.5, ctx.currentTime);
      modulator.connect(modGain); modGain.connect(amGain.gain);
      carrier.connect(amGain); amGain.connect(mainGain);
      carrier.start(); modulator.start();
      ambientNodes.current = { carrier, modulator };
    } catch (e) {}
  };

  const playAlert = (type) => {
    try {
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      if (type === 'end') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
      } else {
        if (modeRef.current !== 'work') return;
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(120, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
      }
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch (e) {}
  };

  // --- AI Tracking logic ---
  const onResults = useCallback((results) => {
    const isWork = modeRef.current === 'work';
    const active = isActiveRef.current;

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const nose = landmarks[1];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const horizontalOffset = Math.abs(nose.x - (leftEye.x + rightEye.x) / 2);
      const currentFocused = horizontalOffset < 0.08 && nose.y > 0.15 && nose.y < 0.85;
      
      if (currentFocused !== lastFocusState.current) {
        setIsFocused(currentFocused);
        if (!currentFocused && active && isWork) {
          setDistractions(d => d + 1);
          statsRef.current.distractions += 1;
          playAlert('alert');
        }
        lastFocusState.current = currentFocused;
      }
    } else if (lastFocusState.current) {
      setIsFocused(false);
      if (active && isWork) {
        setDistractions(d => d + 1);
        statsRef.current.distractions += 1;
        playAlert('alert');
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
      const cam = new window.Camera(videoRef.current, { onFrame: async () => await fm.send({ image: videoRef.current }), width: 640, height: 480 });
      await cam.start();
      setIsAiLoading(false);
      setIsAiActive(true);
      return true;
    } catch (e) { setIsAiLoading(false); return false; }
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && isActiveRef.current && modeRef.current === 'work') {
        setAppSwitches(s => s + 1);
        statsRef.current.appSwitches += 1;
        playAlert('alert');
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const toggle = async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();

    if (!isActive) {
      const ok = await initAi();
      if (ok) {
        try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } catch(e) {}
        setIsActive(true);
        if (ambientType !== 'off') startAmbient(ambientType);
      }
    } else {
      setIsActive(false);
      stopAmbient();
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
    stopAmbient();
    playAlert('end');
    
    if (user && mode === 'work') {
      const score = Math.max(0, 100 - (statsRef.current.distractions * 5) - (statsRef.current.appSwitches * 15));
      try {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'sessions'), {
          distractions: statsRef.current.distractions,
          appSwitches: statsRef.current.appSwitches,
          score,
          objective: settings.objective,
          timestamp: Date.now(),
          duration: settings.work
        });
      } catch (e) {}
    }

    const next = mode === 'work' ? 'shortBreak' : 'work';
    setMode(next);
    setTimeLeft(settings[next === 'work' ? 'work' : 'shortBreak'] * 60);
    setDistractions(0); setAppSwitches(0);
    statsRef.current = { distractions: 0, appSwitches: 0 };
  };

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
      else await signInAnonymously(auth);
    };
    initAuth();
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

  const streak = useMemo(() => {
    if (history.length === 0) return 0;
    let today = new Date().setHours(0,0,0,0);
    const uniqueDays = [...new Set(history.map(s => new Date(s.timestamp).setHours(0,0,0,0)))].sort((a,b) => b-a);
    let count = 0;
    for (let i = 0; i < uniqueDays.length; i++) {
      if (uniqueDays[i] === today - (i * 86400000)) count++;
      else break;
    }
    return count;
  }, [history]);

  const progress = (timeLeft / (settings[mode === 'work' ? 'work' : 'shortBreak'] * 60)) * 100;

  return (
    <div className="relative min-h-screen w-full bg-black flex flex-col items-center justify-center text-white overflow-hidden font-sans">
      
      {/* --- CINEMATIC FULLSCREEN BACKGROUND --- */}
      <div className="absolute inset-0 z-0 bg-black">
        <video ref={videoRef} autoPlay muted playsInline className={`h-full w-full object-cover grayscale transition-all duration-1000 ${isActive && (isFocused || mode === 'shortBreak') ? 'opacity-30 blur-none scale-105' : 'opacity-10 blur-2xl scale-100'}`} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-transparent to-black/90" />
        <div className={`absolute inset-0 transition-all duration-700 pointer-events-none ${!isFocused && isActive && mode === 'work' ? 'bg-red-500/10 shadow-[inset_0_0_150px_rgba(255,0,0,0.3)]' : ''}`} />
      </div>

      {/* --- HEADER --- */}
      <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isAiActive ? 'bg-[#00ff88] shadow-[0_0_10px_#00ff88]' : 'bg-white/10'}`} />
            <span className="text-[10px] font-black tracking-[0.4em] uppercase text-white/40">Aura Pro AI</span>
          </div>
          <div className="flex items-center gap-3 text-[8px] font-bold text-neutral-500 uppercase tracking-widest">
            <span className="flex items-center gap-1"><Flame size={10} className="text-orange-500" /> {streak} Streak</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowHistory(true)} className="p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all"><History size={18} /></button>
          <button onClick={() => setShowEditor(true)} className="p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all"><Settings size={18} /></button>
        </div>
      </header>

      {/* --- MAIN FOCUS CLUSTER --- */}
      <main className="relative z-10 flex flex-col items-center w-full max-w-sm px-8">
        
        {/* Active Objective (Anchor) */}
        {isActive && mode === 'work' && (
          <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-1000">
             <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-2 backdrop-blur-md">
               <Target size={12} className="text-[#00ff88]" />
               <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/80">{settings.objective}</span>
             </div>
          </div>
        )}

        {/* Mode Select */}
        <div className="flex bg-white/5 backdrop-blur-3xl rounded-full p-1 border border-white/5 mb-8">
          {['work', 'shortBreak'].map(m => (
            <button key={m} onClick={() => { setMode(m); setIsActive(false); setTimeLeft(settings[m === 'work' ? 'work' : 'shortBreak']*60); }} className={`px-8 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-white text-black' : 'text-white/30 hover:text-white'}`}>
              {m === 'work' ? 'Focus' : 'Break'}
            </button>
          ))}
        </div>

        {/* Scaled-down Clock Area */}
        <div className="relative flex items-center justify-center mb-10">
          <svg width="260" height="260" className="-rotate-90 absolute">
            <circle cx="130" cy="130" r="115" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="3" />
          </svg>
          <svg width="260" height="260" className="-rotate-90">
            <circle cx="130" cy="130" r="115" fill="none" stroke={!isFocused && isActive && mode === 'work' ? '#ff4d4d' : '#00ff88'} strokeWidth="4" strokeDasharray="722" strokeDashoffset={722 - (progress / 100) * 722} strokeLinecap="round" className="transition-all duration-1000 ease-linear drop-shadow-[0_0_15px_rgba(0,255,136,0.2)]" />
          </svg>
          <div className="absolute text-center">
            <h1 className={`text-7xl md:text-8xl font-black tracking-tighter tabular-nums leading-none transition-all duration-700 ${!isFocused && isActive && mode === 'work' ? 'text-red-500 blur-sm scale-90' : 'text-white'}`}>
              {Math.floor(timeLeft/60).toString().padStart(2,'0')}:{(timeLeft%60).toString().padStart(2,'0')}
            </h1>
          </div>
        </div>

        {/* Metric Cards (Smaller) */}
        <div className="grid grid-cols-2 gap-3 w-full mb-10">
          <div className="bg-white/5 border border-white/5 p-5 rounded-3xl text-center backdrop-blur-md">
            <div className="text-[8px] font-bold text-white/30 uppercase tracking-widest mb-1">Gaze Distract</div>
            <div className={`text-xl font-bold ${distractions > 0 && mode === 'work' ? 'text-red-500' : 'text-white/30'}`}>{mode === 'work' ? distractions : '--'}</div>
          </div>
          <div className="bg-white/5 border border-white/5 p-5 rounded-3xl text-center backdrop-blur-md">
            <div className="text-[8px] font-bold text-white/30 uppercase tracking-widest mb-1">App Escape</div>
            <div className={`text-xl font-bold ${appSwitches > 0 && mode === 'work' ? 'text-orange-500' : 'text-white/30'}`}>{mode === 'work' ? appSwitches : '--'}</div>
          </div>
        </div>

        {/* Primary Buttons */}
        <div className="flex items-center gap-6">
          <button onClick={toggle} disabled={isAiLoading} className={`h-20 w-20 rounded-full flex items-center justify-center transition-all active:scale-95 ${isActive ? 'bg-white/10 text-white border border-white/20' : 'bg-white text-black shadow-2xl hover:scale-105'}`}>
            {isAiLoading ? <Loader2 size={24} className="animate-spin" /> : isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
          </button>
          <button onClick={() => { setTimeLeft(settings[mode === 'work' ? 'work' : 'shortBreak']*60); setIsActive(false); setDistractions(0); setAppSwitches(0); stopAmbient(); statsRef.current = {distractions:0, appSwitches:0}; }} className="h-14 w-14 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-white/30 hover:text-white transition-all"><RotateCcw size={20}/></button>
        </div>
      </main>

      {/* --- SETTINGS MODAL --- */}
      {showEditor && (
        <div className="fixed inset-0 z-[100] bg-black/95 p-10 flex flex-col justify-center backdrop-blur-3xl overflow-y-auto">
          <div className="max-w-sm mx-auto w-full">
            <div className="flex justify-between items-center mb-10">
               <h2 className="text-3xl font-black italic tracking-tighter">Neural Settings</h2>
               <X onClick={() => setShowEditor(false)} className="text-white/20" />
            </div>
            <div className="space-y-10">
              <div className="space-y-3">
                 <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-2"><Target size={12}/> Current Objective</div>
                 <input type="text" value={settings.objective} onChange={e => setSettings({...settings, objective: e.target.value})} className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-xs font-bold outline-none focus:border-[#00ff88]/40 transition-all text-white" placeholder="What are you focusing on?" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['off', 'alpha', 'theta', 'gamma', 'rain'].map(t => (
                  <button key={t} onClick={() => { setAmbientType(t); if(isActive) startAmbient(t); }} className={`py-3 rounded-xl text-[9px] font-black uppercase border transition-all ${ambientType === t ? 'border-[#00ff88] text-[#00ff88] bg-[#00ff88]/5' : 'border-white/10 text-white/20'}`}>{t}</button>
                ))}
              </div>
              <div className="space-y-5">
                 <div className="flex justify-between text-[10px] font-bold uppercase text-white/30 tracking-widest">Focus Duration <span>{settings.work}m</span></div>
                 <input type="range" min="1" max="90" value={settings.work} onChange={e => setSettings({...settings, work: parseInt(e.target.value)})} className="w-full h-1 bg-white/10 accent-[#00ff88] rounded-full appearance-none" />
              </div>
              <button onClick={() => setShowEditor(false)} className="w-full bg-white text-black py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Confirm Goal</button>
            </div>
          </div>
        </div>
      )}

      {/* --- HISTORY MODAL --- */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] bg-black p-10 overflow-y-auto backdrop-blur-3xl">
          <div className="max-w-xl mx-auto">
            <header className="flex justify-between items-center mb-16">
              <h2 className="text-5xl font-black italic tracking-tighter">Archive</h2>
              <X onClick={() => setShowHistory(false)} className="text-white/20" />
            </header>
            
            <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-8 mb-10">
               <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.4em] text-white/20 mb-6"><Calendar size={12}/> 21-Day Neural Heatmap</div>
               <div className="grid grid-cols-7 gap-1.5">
                 {Array.from({length: 21}).map((_, i) => {
                    const day = new Date(new Date().setHours(0,0,0,0) - (20 - i) * 86400000);
                    const count = history.filter(s => new Date(s.timestamp).setHours(0,0,0,0) === day.getTime()).length;
                    return <div key={i} className="aspect-square rounded-[2px]" style={{ backgroundColor: count > 0 ? `rgba(0, 255, 136, ${Math.min(1, count * 0.4)})` : 'rgba(255,255,255,0.03)' }} />;
                 })}
               </div>
            </div>

            <div className="space-y-4">
              {history.length === 0 ? <p className="text-center text-white/10 py-20 font-black uppercase tracking-[0.5em] text-xs">Neural logs missing</p> : history.map((s, i) => (
                <div key={i} className="bg-white/5 border border-white/5 p-6 rounded-[2.5rem] flex justify-between items-center hover:bg-white/10 transition-all">
                  <div className="text-left">
                    <div className="text-[10px] font-bold text-white/20 uppercase mb-2 tracking-widest">{new Date(s.timestamp).toLocaleDateString()} at {new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    <div className="text-lg font-bold mb-1">{s.objective || "Focus Session"}</div>
                    <div className="text-[9px] text-[#00ff88] font-black tracking-widest uppercase">{s.score}% Sync Score</div>
                  </div>
                  <div className="flex gap-6">
                     <div className="text-center">
                        <span className="text-[8px] text-white/20 uppercase block font-black mb-1">Gaze</span>
                        <span className="text-2xl font-black text-red-500">{s.distractions}</span>
                     </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; height: 18px; width: 18px; border-radius: 50%; background: white; border: 3px solid black; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}} />
    </div>
  );
}

