
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Settings, History, 
  X, Zap, Coffee, Shield, EyeOff, 
  Smartphone, Volume2, Target, Flame, Calendar, Loader2,
  Battery, Wifi, WifiOff, AlertTriangle
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot } from 'firebase/firestore';

// --- STYLES INJECTOR ---
const injectTailwind = () => {
  if (!document.getElementById('tailwind-cdn')) {
    const script = document.createElement('script');
    script.id = 'tailwind-cdn';
    script.src = 'https://cdn.tailwindcss.com';
    document.head.appendChild(script);
  }
};

// --- FIREBASE CONFIGURATION ---
// If you are deploying to Vercel, you MUST replace these with your actual keys
const getFirebaseConfig = () => {
  try {
    // Check if we are in the internal preview environment
    if (typeof __firebase_config !== 'undefined') return JSON.parse(__firebase_config);
  } catch (e) {}

  // PASTE YOUR FIREBASE CONFIG HERE FOR VERCEL DEPLOYMENT:
  return {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
  };
};

const fConfig = getFirebaseConfig();
const app = getApps().length === 0 ? initializeApp(fConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "aura-pro-v12-final";

export default function App() {
  injectTailwind();

  // --- Core State ---
  const [settings, setSettings] = useState({ work: 25, shortBreak: 5, objective: "Focus Session" });
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

  // --- Refs ---
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const faceMeshRef = useRef(null);
  const audioCtxRef = useRef(null);
  const ambientNodes = useRef({ carrier: null, modulator: null });
  const statsRef = useRef({ distractions: 0, appSwitches: 0 });
  const stateRef = useRef({ mode: 'work', isActive: false, isFocused: true });

  useEffect(() => {
    stateRef.current = { mode, isActive, isFocused };
  }, [mode, isActive, isFocused]);

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

      const carrier = ctx.createOscillator();
      carrier.frequency.setValueAtTime(220, ctx.currentTime);
      const modulator = ctx.createOscillator();
      const targetFreq = type === 'alpha' ? 10 : type === 'theta' ? 6 : 40;
      modulator.frequency.setValueAtTime(targetFreq, ctx.currentTime);
      const modGain = ctx.createGain(); modGain.gain.setValueAtTime(0.5, ctx.currentTime);
      const amGain = ctx.createGain(); amGain.gain.setValueAtTime(0.5, ctx.currentTime);
      modulator.connect(modGain); modGain.connect(amGain.gain); carrier.connect(amGain); amGain.connect(mainGain);
      carrier.start(); modulator.start();
      ambientNodes.current = { carrier, modulator };
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
      } else {
        if (stateRef.current.mode !== 'work') return;
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(140, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
      }
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch (e) {}
  };

  // --- AI & Logic ---
  const onAiResults = useCallback((results) => {
    const { mode, isActive } = stateRef.current;
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const nose = landmarks[1];
      const horizontalOffset = Math.abs(nose.x - 0.5);
      const currentFocused = horizontalOffset < 0.12 && nose.y > 0.15 && nose.y < 0.85;
      if (currentFocused !== stateRef.current.isFocused) {
        setIsFocused(currentFocused);
        if (!currentFocused && isActive && mode === 'work') {
          setDistractions(d => d + 1); statsRef.current.distractions += 1; playSystemSound('alert');
        }
      }
    } else if (stateRef.current.isFocused) {
      setIsFocused(false);
      if (isActive && mode === 'work') {
        setDistractions(d => d + 1); statsRef.current.distractions += 1; playSystemSound('alert');
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
      setIsAiLoading(false); return true;
    } catch (e) { setIsAiLoading(false); return false; }
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

  useEffect(() => {
    if (isActive && (isFocused || mode === 'shortBreak') && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    if (timeLeft === 0 && isActive) {
      setIsActive(false); stopAmbient(); playSystemSound('end');
      if (user && mode === 'work') {
        const score = Math.max(0, 100 - (statsRef.current.distractions * 5) - (statsRef.current.appSwitches * 15));
        addDoc(collection(db, 'sessions'), {
          userId: user.uid, distractions: statsRef.current.distractions,
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

  useEffect(() => {
    signInAnonymously(auth).then(res => setUser(res.user)).catch(e => console.error("Firebase Auth Error: Is your API Key correct?", e));
    onAuthStateChanged(auth, u => {
      if (u) onSnapshot(collection(db, 'sessions'), snap => {
        const logs = snap.docs.map(d => d.data()).filter(d => d.userId === u.uid);
        setHistory(logs.sort((a,b) => b.timestamp - a.timestamp));
      });
    });
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline);
    if ('getBattery' in navigator) navigator.getBattery().then(batt => {
      const update = () => setBattery({ level: Math.round(batt.level * 100), charging: batt.charging });
      update(); batt.addEventListener('levelchange', update);
    });
    return () => { window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline); };
  }, []);

  if (fConfig.apiKey === "YOUR_API_KEY") {
    return <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10 text-center font-sans">
      <AlertTriangle className="text-orange-500 mb-4" size={48} />
      <h1 className="text-2xl font-bold mb-2">Setup Required</h1>
      <p className="text-white/40 text-sm">Please paste your Firebase keys into the <b>App.jsx</b> file to start your productivity session.</p>
    </div>
  }

  return (
    <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center text-white overflow-hidden font-sans relative select-none">
      <div className="absolute inset-0 z-0">
        <video ref={videoRef} autoPlay muted playsInline className={`h-full w-full object-cover transition-all duration-1000 grayscale ${isActive ? 'opacity-30 scale-105' : 'opacity-10 blur-3xl'}`} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-transparent to-black/90" />
        <div className={`absolute inset-0 transition-all duration-700 pointer-events-none ${!isFocused && isActive && mode === 'work' ? 'bg-red-500/10 shadow-[inset_0_0_100px_rgba(255,0,0,0.3)]' : ''}`} />
      </div>

      <header className="absolute top-0 w-full p-4 flex justify-between z-50">
        <div className="flex flex-col">
          <span className="text-[9px] font-black tracking-widest opacity-40 uppercase">Aura Pro</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[8px] font-bold text-orange-500 uppercase"><Flame size={10} className="inline mr-1"/> {history.length} Session Count</span>
            <span className={`text-[8px] font-bold uppercase ${battery.level < 20 ? 'text-red-500' : 'text-neutral-500'}`}><Battery size={10} className="inline mr-1"/> {battery.level}%</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowHistory(true)} className="p-2.5 bg-white/5 rounded-xl border border-white/5 active:scale-90"><History size={16}/></button>
          <button onClick={() => setShowEditor(true)} className="p-2.5 bg-white/5 rounded-xl border border-white/5 active:scale-90"><Settings size={16}/></button>
        </div>
      </header>

      <main className="relative z-10 flex flex-col items-center w-full max-w-xs px-4 scale-90 md:scale-100">
        {isActive && mode === 'work' && (
          <div className="mb-4 px-3 py-1 bg-white/5 border border-white/10 rounded-full backdrop-blur-md">
            <span className="text-[8px] font-black uppercase tracking-widest text-[#00ff88] flex items-center gap-2"><Target size={10}/> {settings.objective}</span>
          </div>
        )}

        <div className="flex bg-white/5 backdrop-blur-2xl rounded-full p-1 border border-white/5 mb-6">
          {['work', 'shortBreak'].map(m => (
            <button key={m} onClick={() => { setMode(m); setIsActive(false); setTimeLeft(settings[m === 'work' ? 'work' : 'shortBreak']*60); }} className={`px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-white text-black shadow-xl' : 'text-white/30 hover:text-white'}`}>
              {m === 'work' ? 'Focus' : 'Break'}
            </button>
          ))}
        </div>

        <div className="relative flex items-center justify-center mb-8">
          <svg width="200" height="200" className="-rotate-90 absolute"><circle cx="100" cy="100" r="85" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" /></svg>
          <svg width="200" height="200" className="-rotate-90">
            <circle cx="100" cy="100" r="85" fill="none" stroke={!isFocused && isActive && mode === 'work' ? '#ff4d4d' : '#00ff88'} strokeWidth="3" strokeDasharray="534" strokeDashoffset={534 - ((timeLeft/(settings[mode === 'work' ? 'work' : 'shortBreak']*60))*534)} strokeLinecap="round" className="transition-all duration-1000 ease-linear" />
          </svg>
          <div className="absolute text-center">
            <h1 className="text-6xl font-black tabular-nums">{Math.floor(timeLeft/60).toString().padStart(2,'0')}:{(timeLeft%60).toString().padStart(2,'0')}</h1>
            <div className="text-[7px] font-bold uppercase tracking-widest text-white/30 mt-1">{mode === 'work' ? 'Locked In' : 'Neural Rest'}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full mb-8">
          <div className="bg-white/5 p-4 rounded-2xl text-center border border-white/5 backdrop-blur-sm">
            <div className="text-[7px] font-bold text-white/30 uppercase mb-0.5 tracking-tighter">Gaze Distract</div>
            <div className={`text-xl font-bold ${distractions > 0 ? 'text-red-500' : 'text-white/30'}`}>{distractions}</div>
          </div>
          <div className="bg-white/5 p-4 rounded-2xl text-center border border-white/5 backdrop-blur-sm">
            <div className="text-[7px] font-bold text-white/30 uppercase mb-0.5 tracking-tighter">Strict Violation</div>
            <div className={`text-xl font-bold ${appSwitches > 0 ? 'text-orange-500' : 'text-white/30'}`}>{appSwitches}</div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <button onClick={toggleFocus} disabled={isAiLoading} className={`h-16 w-16 rounded-full flex items-center justify-center transition-all ${isActive ? 'bg-white/10' : 'bg-white text-black shadow-2xl active:scale-95'}`}>
            {isAiLoading ? <Loader2 size={24} className="animate-spin" /> : isActive ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
          </button>
          <button onClick={() => { setTimeLeft(settings.work*60); setIsActive(false); stopAmbient(); setDistractions(0); setAppSwitches(0); statsRef.current = {distractions:0, appSwitches:0}; }} className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center text-white/30 active:scale-90"><RotateCcw size={20}/></button>
        </div>
      </main>

      {showEditor && (
        <div className="fixed inset-0 z-[100] bg-black/98 p-8 flex flex-col justify-center backdrop-blur-3xl">
          <div className="max-w-sm mx-auto w-full space-y-6">
            <h2 className="text-2xl font-black italic">Parameters</h2>
            <div className="space-y-4">
              <input type="text" value={settings.objective} onChange={e => setSettings({...settings, objective: e.target.value})} className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-xs font-bold outline-none focus:border-[#00ff88]/40" placeholder="Session Objective" />
              <div className="space-y-2">
                <div className="flex justify-between text-[8px] uppercase font-bold text-white/40">Focus <span>{settings.work}m</span></div>
                <input type="range" min="1" max="90" value={settings.work} onChange={e => { const v = parseInt(e.target.value); setSettings({...settings, work: v}); if(mode==='work') setTimeLeft(v*60); }} className="w-full h-1 bg-white/10 accent-[#00ff88] appearance-none rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[8px] uppercase font-bold text-white/40">Break <span>{settings.shortBreak}m</span></div>
                <input type="range" min="1" max="30" value={settings.shortBreak} onChange={e => { const v = parseInt(e.target.value); setSettings({...settings, shortBreak: v}); if(mode==='shortBreak') setTimeLeft(v*60); }} className="w-full h-1 bg-white/10 accent-[#00ff88] appearance-none rounded-full" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['off', 'alpha', 'theta', 'gamma', 'rain'].map(t => (
                  <button key={t} onClick={() => { setAmbientType(t); if(isActive) startAmbient(t); }} className={`py-3 rounded-xl text-[8px] font-black uppercase border transition-all ${ambientType === t ? 'border-[#00ff88] text-[#00ff88] bg-[#00ff88]/5' : 'border-white/10 text-white/20'}`}>{t}</button>
                ))}
              </div>
            </div>
            <button onClick={() => setShowEditor(false)} className="w-full bg-white text-black py-4 rounded-xl font-bold uppercase text-[10px] tracking-widest shadow-xl">Apply Changes</button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-[100] bg-black p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-black italic">Archive</h2>
            <X onClick={() => setShowHistory(false)} className="text-white/40" />
          </div>
          {history.length === 0 ? <p className="text-center text-white/10 py-20 uppercase text-[8px] font-bold">Neural logs missing</p> : (
            history.map((s, i) => (
              <div key={i} className="bg-white/5 p-5 rounded-2xl border border-white/5 mb-3 flex justify-between items-center">
                <div>
                  <div className="text-[7px] opacity-30 uppercase font-bold">{new Date(s.timestamp).toLocaleDateString()}</div>
                  <div className="text-xs font-bold">{s.objective}</div>
                </div>
                <div className="text-[10px] font-black text-[#00ff88]">{s.score}% Sync</div>
              </div>
            ))
          )}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: white; cursor: pointer; border: 2px solid black; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}} />
    </div>
  );
}

