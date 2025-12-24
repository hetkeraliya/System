
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Settings, History, 
  X, Zap, Coffee, Shield, AlertCircle, Loader2, Eye, EyeOff, 
  Smartphone, Volume2, Music, Target, Flame, Calendar, Radio,
  Battery, Wifi, WifiOff
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc } from 'firebase/firestore';

// --- Initialization ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'aura-pro-ultimate';

export default function App() {
  // --- Core State ---
  const [settings, setSettings] = useState({ 
    work: 25, 
    shortBreak: 5, 
    objective: "Deep Work Protocol"
  });
  const [mode, setMode] = useState('work'); 
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [user, setUser] = useState(null);
  
  // --- Audio & Environments ---
  const [ambientType, setAmbientType] = useState('off'); 
  const [isAmbientActive, setIsAmbientActive] = useState(false);
  const [battery, setBattery] = useState({ level: 100, charging: true });
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  // --- Refs (For persistent logic) ---
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const faceMeshRef = useRef(null);
  const audioCtxRef = useRef(null);
  const ambientNodes = useRef({ carrier: null, modulator: null, filter: null });
  
  const statsRef = useRef({ distractions: 0, appSwitches: 0 });
  const stateRef = useRef({ mode: 'work', isActive: false, isFocused: true });

  useEffect(() => {
    stateRef.current = { mode, isActive, isFocused };
  }, [mode, isActive, isFocused]);

  // --- Environmental Sensors ---
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    if ('getBattery' in navigator) {
      navigator.getBattery().then(batt => {
        const updateBatt = () => setBattery({ level: Math.round(batt.level * 100), charging: batt.charging });
        updateBatt();
        batt.addEventListener('levelchange', updateBatt);
        batt.addEventListener('chargingchange', updateBatt);
      });
    }
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  // --- Advanced Audio Engine ---
  const stopAmbient = () => {
    Object.values(ambientNodes.current).forEach(node => {
      if (node) { try { node.stop(); node.disconnect(); } catch(e) {} }
    });
    ambientNodes.current = { carrier: null, modulator: null, filter: null };
    setIsAmbientActive(false);
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
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, ctx.currentTime);
        whiteNoise.connect(filter); filter.connect(mainGain);
        whiteNoise.start(); ambientNodes.current.carrier = whiteNoise;
      } else if (['alpha', 'theta', 'gamma'].includes(type)) {
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
      }
      setIsAmbientActive(true);
    } catch (e) {}
  };

  const playSystemSound = (type) => {
    try {
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      if (type === 'end') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
      } else {
        if (stateRef.current.mode !== 'work') return;
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(140, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
      }
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  };

  // --- AI Tracking Logic ---
  const onAiResults = useCallback((results) => {
    const { mode, isActive } = stateRef.current;
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const nose = landmarks[1];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const horizontalOffset = Math.abs(nose.x - (leftEye.x + rightEye.x) / 2);
      const currentFocused = horizontalOffset < 0.08 && nose.y > 0.15 && nose.y < 0.85;
      
      if (currentFocused !== stateRef.current.isFocused) {
        setIsFocused(currentFocused);
        if (!currentFocused && isActive && mode === 'work') {
          setDistractions(d => d + 1);
          statsRef.current.distractions += 1;
          playSystemSound('alert');
        }
      }
    } else if (stateRef.current.isFocused) {
      setIsFocused(false);
      if (isActive && mode === 'work') {
        setDistractions(d => d + 1);
        statsRef.current.distractions += 1;
        playSystemSound('alert');
      }
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
      fm.onResults(onAiResults);
      faceMeshRef.current = fm;
      const cam = new window.Camera(videoRef.current, { onFrame: async () => await fm.send({ image: videoRef.current }), width: 640, height: 480 });
      await cam.start();
      setIsAiLoading(false); setIsAiActive(true);
      return true;
    } catch (e) { setIsAiLoading(false); return false; }
  };

  // --- Strict Session Logic ---
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && stateRef.current.isActive && stateRef.current.mode === 'work') {
        setAppSwitches(s => s + 1);
        statsRef.current.appSwitches += 1;
        playSystemSound('alert');
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const toggleFocus = async () => {
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
    if (timeLeft === 0 && isActive) finalizeSession();
    return () => clearInterval(timerRef.current);
  }, [isActive, isFocused, timeLeft, mode]);

  const finalizeSession = async () => {
    setIsActive(false);
    stopAmbient();
    playSystemSound('end');
    
    if (user && mode === 'work') {
      const score = Math.max(0, 100 - (statsRef.current.distractions * 5) - (statsRef.current.appSwitches * 15));
      try {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'sessions'), {
          distractions: statsRef.current.distractions,
          appSwitches: statsRef.current.appSwitches,
          score, objective: settings.objective, timestamp: Date.now(), duration: settings.work
        });
      } catch (e) {}
    }

    const nextMode = mode === 'work' ? 'shortBreak' : 'work';
    setMode(nextMode);
    setTimeLeft(settings[nextMode === 'work' ? 'work' : 'shortBreak'] * 60);
    setDistractions(0); setAppSwitches(0);
    statsRef.current = { distractions: 0, appSwitches: 0 };
  };

  // --- Real-time Sync ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
      else await signInAnonymously(auth);
    };
    initAuth();
    onAuthStateChanged(auth, u => {
      setUser(u);
      if (u) {
        onSnapshot(collection(db, 'artifacts', appId, 'users', u.uid, 'sessions'), snap => {
          setHistory(snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => b.timestamp - a.timestamp));
        });
      }
    });
  }, []);

  const streak = useMemo(() => {
    if (history.length === 0) return 0;
    const days = [...new Set(history.map(s => new Date(s.timestamp).toDateString()))];
    return days.length;
  }, [history]);

  const progress = (timeLeft / (settings[mode === 'work' ? 'work' : 'shortBreak'] * 60)) * 691;

  return (
    <div className="relative min-h-screen w-full bg-black flex flex-col items-center justify-center text-white overflow-hidden font-sans select-none">
      
      {/* LAYER 0: CINEMATIC FULLSCREEN CAMERA BACKGROUND */}
      <div className="absolute inset-0 z-0 bg-black">
        <video ref={videoRef} autoPlay muted playsInline className={`h-full w-full object-cover transition-all duration-1000 grayscale ${isActive && (isFocused || mode === 'shortBreak') ? 'opacity-30 scale-105' : 'opacity-10 blur-2xl scale-100'}`} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-transparent to-black/90" />
        <div className={`absolute inset-0 transition-all duration-700 pointer-events-none ${!isFocused && isActive && mode === 'work' ? 'bg-red-500/10 shadow-[inset_0_0_100px_rgba(255,0,0,0.3)]' : ''}`} />
      </div>

      {/* LAYER 1: UI HUD TOP */}
      <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-50">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isAiActive ? 'bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-pulse' : 'bg-white/10'}`} />
            <span className="text-[10px] font-black tracking-[0.4em] uppercase text-white/40">Aura Pro Ultimate</span>
          </div>
          <div className="flex items-center gap-3 text-[8px] font-bold text-neutral-500 uppercase tracking-[0.2em]">
            <span className="flex items-center gap-1"><Flame size={10} className="text-orange-500" /> {streak} Streak</span>
            <span className={`flex items-center gap-1 ${battery.level < 20 ? 'text-red-500' : ''}`}><Battery size={10} /> {battery.level}%</span>
            <span className="flex items-center gap-1">{isOnline ? <Wifi size={10} className="text-emerald-500" /> : <WifiOff size={10} className="text-red-500" />}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowHistory(true)} className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all backdrop-blur-md"><History size={18} /></button>
          <button onClick={() => setShowEditor(true)} className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all backdrop-blur-md"><Settings size={18} /></button>
        </div>
      </header>

      {/* CENTER WORKSPACE */}
      <main className="relative z-10 flex flex-col items-center w-full max-w-sm px-8">
        
        {/* Active Anchor Goal */}
        {isActive && mode === 'work' && (
          <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-1000">
             <div className="px-5 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-2 backdrop-blur-md">
               <Target size={12} className="text-[#00ff88]" />
               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/80">{settings.objective}</span>
             </div>
          </div>
        )}

        {/* Mode Toggles */}
        <div className="flex bg-white/5 backdrop-blur-3xl rounded-full p-1 border border-white/5 mb-10 shadow-inner">
          {['work', 'shortBreak'].map(m => (
            <button key={m} onClick={() => { setMode(m); setIsActive(false); setTimeLeft(settings[m === 'work' ? 'work' : 'shortBreak']*60); }} className={`px-8 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-white text-black shadow-2xl' : 'text-white/30 hover:text-white'}`}>
              {m === 'work' ? 'Deep Focus' : 'Neural Break'}
            </button>
          ))}
        </div>

        {/* Cinematic Clock */}
        <div className="relative flex items-center justify-center mb-12">
          <svg width="240" height="240" className="-rotate-90">
            <circle cx="120" cy="120" r="110" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="3" />
            <circle cx="120" cy="120" r="110" fill="none" stroke={!isFocused && isActive && mode === 'work' ? '#ff4d4d' : '#00ff88'} strokeWidth="4" strokeDasharray="691" strokeDashoffset={691 - (progress / 100) * 691} strokeLinecap="round" className="transition-all duration-1000 ease-linear drop-shadow-[0_0_15px_rgba(0,255,136,0.3)]" />
          </svg>
          <div className="absolute text-center">
            <h1 className={`text-7xl md:text-8xl font-black tracking-tighter tabular-nums leading-none transition-all duration-700 ${!isFocused && isActive && mode === 'work' ? 'text-red-500 blur-sm scale-90' : 'text-white'}`}>
              {Math.floor(timeLeft/60).toString().padStart(2,'0')}:{(timeLeft%60).toString().padStart(2,'0')}
            </h1>
          </div>
        </div>

        {/* Neural Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 w-full mb-10">
          <div className="bg-white/5 border border-white/10 p-5 rounded-[2rem] text-center backdrop-blur-md group hover:bg-white/10 transition-all">
            <div className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em] mb-1">Gaze Distract</div>
            <div className={`text-2xl font-black ${distractions > 0 && mode === 'work' ? 'text-red-500' : 'text-white/20'}`}>{mode === 'work' ? distractions : '--'}</div>
          </div>
          <div className="bg-white/5 border border-white/10 p-5 rounded-[2rem] text-center backdrop-blur-md group hover:bg-white/10 transition-all">
            <div className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em] mb-1">App Escape</div>
            <div className={`text-2xl font-black ${appSwitches > 0 && mode === 'work' ? 'text-orange-500' : 'text-white/20'}`}>{mode === 'work' ? appSwitches : '--'}</div>
          </div>
        </div>

        {/* Main Controls */}
        <div className="flex items-center gap-8">
          <button onClick={toggleFocus} disabled={isAiLoading} className={`h-24 w-24 rounded-full flex items-center justify-center transition-all active:scale-95 ${isActive ? 'bg-white/10 text-white border border-white/20 shadow-inner' : 'bg-white text-black shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:scale-105'}`}>
            {isAiLoading ? <Loader2 size={32} className="animate-spin" /> : isActive ? <Pause size={44} fill="currentColor" /> : <Play size={44} fill="currentColor" className="ml-1" />}
          </button>
          <button onClick={() => { setTimeLeft(settings.work*60); setIsActive(false); setDistractions(0); setAppSwitches(0); stopAmbient(); statsRef.current = {distractions:0, appSwitches:0}; }} className="h-14 w-14 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-white/30 hover:text-white transition-all backdrop-blur-sm"><RotateCcw size={24}/></button>
        </div>
      </main>

      {/* SETTINGS OVERLAY */}
      {showEditor && (
        <div className="fixed inset-0 z-[100] bg-black/98 p-10 flex flex-col justify-center backdrop-blur-3xl overflow-y-auto">
          <div className="max-w-sm mx-auto w-full space-y-12">
            <div className="flex justify-between items-center">
               <h2 className="text-3xl font-black italic tracking-tighter">Parameters</h2>
               <X onClick={() => setShowEditor(false)} className="text-white/40 h-8 w-8 cursor-pointer" />
            </div>
            
            <div className="space-y-4">
               <div className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2"><Target size={12}/> Neural Objective</div>
               <input type="text" value={settings.objective} onChange={e => setSettings({...settings, objective: e.target.value})} className="w-full bg-white/5 border border-white/10 p-5 rounded-3xl text-xs font-black outline-none focus:border-[#00ff88]/30 transition-all" placeholder="Enter session goal" />
            </div>

            <div className="space-y-4">
               <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/30">Focus Depth <span>{settings.work}m</span></div>
               <input type="range" min="1" max="90" value={settings.work} onChange={e => setSettings({...settings, work: parseInt(e.target.value)})} className="w-full h-1 bg-white/10 accent-[#00ff88] rounded-full appearance-none cursor-pointer" />
            </div>

            <div className="space-y-4">
               <div className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2"><Music size={12}/> Neural Audio Stations</div>
               <div className="grid grid-cols-3 gap-2">
                 {['off', 'alpha', 'theta', 'gamma', 'rain'].map(t => (
                   <button key={t} onClick={() => { setAmbientType(t); if(isActive) startAmbient(t); }} className={`py-3 rounded-2xl text-[9px] font-black uppercase border transition-all ${ambientType === t ? 'border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10 shadow-[0_0_15px_#00ff881a]' : 'border-white/5 text-white/20'}`}>{t}</button>
                 ))}
               </div>
            </div>

            <button onClick={() => setShowEditor(false)} className="w-full bg-white text-black py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-widest shadow-2xl hover:bg-neutral-200 transition-colors">Lock Configuration</button>
          </div>
        </div>
      )}

      {/* ARCHIVE & HEATMAP */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] bg-black p-10 overflow-y-auto backdrop-blur-3xl">
          <div className="max-w-xl mx-auto">
            <header className="flex justify-between items-center mb-12">
              <h2 className="text-5xl font-black italic tracking-tighter">Archive</h2>
              <X onClick={() => setShowHistory(false)} className="text-white/40 h-10 w-10 cursor-pointer" />
            </header>
            
            <div className="bg-white/5 border border-white/5 rounded-[3rem] p-10 mb-12">
               <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.4em] text-white/20 mb-8"><Calendar size={14}/> Neural Heatmap</div>
               <div className="grid grid-cols-7 gap-2">
                 {Array.from({length: 21}).map((_, i) => {
                    const day = new Date(new Date().setHours(0,0,0,0) - (20 - i) * 86400000);
                    const count = history.filter(s => new Date(s.timestamp).setHours(0,0,0,0) === day.getTime()).length;
                    return <div key={i} className="aspect-square rounded-[3px] transition-all" style={{ backgroundColor: count > 0 ? `rgba(0, 255, 136, ${Math.min(1, count * 0.4)})` : 'rgba(255,255,255,0.03)' }} title={`${count} sessions`} />;
                 })}
               </div>
            </div>

            <div className="space-y-5">
              {history.length === 0 ? <p className="text-center text-white/10 py-32 font-black uppercase tracking-[0.5em] text-[8px]">Logs empty</p> : history.map((s, i) => (
                <div key={i} className="bg-white/5 border border-white/5 p-8 rounded-[3rem] flex justify-between items-center transition-all hover:bg-white/10 group">
                  <div className="text-left">
                    <div className="text-[10px] font-bold text-white/20 uppercase mb-2 tracking-widest">{new Date(s.timestamp).toLocaleDateString()} at {new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    <div className="text-xl font-bold mb-1">{s.objective || "Protocol Block"}</div>
                    <div className="text-[9px] text-[#00ff88] font-black tracking-widest uppercase">{s.score}% Match Accuracy</div>
                  </div>
                  <div className="text-center">
                    <span className="text-[9px] text-white/20 uppercase block font-black mb-1">Gaze</span>
                    <span className="text-2xl font-black text-red-500">{s.distractions}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STATUS NOTIFICATION (Battery/Online) */}
      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[80] transition-all duration-1000 ${isActive && (!isOnline || (battery.level < 20 && !battery.charging)) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20 pointer-events-none'}`}>
        <div className="bg-orange-500 text-white px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest shadow-2xl flex items-center gap-3">
          <AlertCircle size={16} /> Neural Environment Warning
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        input[type='range'] { -webkit-appearance: none; background: rgba(255,255,255,0.05); height: 4px; border-radius: 2px; }
        input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; height: 20px; width: 20px; border-radius: 50%; background: white; border: 4px solid black; cursor: pointer; box-shadow: 0 0 15px rgba(0,255,136,0.2); }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}} />

    </div>
  );
}

