import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Settings, History, 
  X, Zap, Coffee, Shield, AlertCircle, Loader2, Eye, EyeOff, 
  Smartphone, Volume2, Music, Target, Flame, Calendar, Radio
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';

// --- YOUR FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDivV4vQYujhG6lBQkAGxgvmF2JJOwUYGY",
  authDomain: "productivety-app.firebaseapp.com",
  projectId: "productivety-app",
  storageBucket: "productivety-app.firebasestorage.app",
  messagingSenderId: "676233842288",
  appId: "1:676233842288:web:b356d5eff17c68379c6eb5",
  measurementId: "G-W3LCRZP9K1"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  // --- Timer & Settings State ---
  const [settings, setSettings] = useState({ 
    work: 25, 
    shortBreak: 5, 
    objective: "Deep Work Session",
    zenMode: true 
  });
  const [mode, setMode] = useState('work'); 
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [user, setUser] = useState(null);
  
  // --- Audio State ---
  const [ambientType, setAmbientType] = useState('off'); 
  const [isAmbientActive, setIsAmbientActive] = useState(false);

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

  // --- Refs for Performance ---
  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const faceMeshRef = useRef(null);
  const lastFocusState = useRef(true);
  const audioCtxRef = useRef(null);
  const ambientNodes = useRef({ osc: null, modulator: null, gain: null });
  const modeRef = useRef('work');
  const isActiveRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
    isActiveRef.current = isActive;
  }, [mode, isActive]);

  // --- NEURAL AUDIO ENGINE (Mobile Optimized) ---
  const stopAmbient = () => {
    if (ambientNodes.current.osc) {
      try { ambientNodes.current.osc.stop(); ambientNodes.current.osc.disconnect(); } catch(e) {}
    }
    if (ambientNodes.current.modulator) {
      try { ambientNodes.current.modulator.stop(); ambientNodes.current.modulator.disconnect(); } catch(e) {}
    }
    ambientNodes.current = { osc: null, modulator: null, gain: null };
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
      mainGain.gain.setValueAtTime(0.04, ctx.currentTime);
      mainGain.connect(ctx.destination);

      if (type === 'rain') {
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, ctx.currentTime);
        whiteNoise.connect(filter);
        filter.connect(mainGain);
        whiteNoise.start();
        ambientNodes.current.osc = whiteNoise;
      } else {
        // AM Modulation for Mobile Speakers (Alpha: 10Hz, Theta: 6Hz, Gamma: 40Hz)
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();
        const amGain = ctx.createGain();

        carrier.frequency.setValueAtTime(200, ctx.currentTime);
        modulator.frequency.setValueAtTime(type === 'alpha' ? 10 : type === 'theta' ? 6 : 40, ctx.currentTime);
        
        modGain.gain.setValueAtTime(0.5, ctx.currentTime);
        amGain.gain.setValueAtTime(0.5, ctx.currentTime);

        modulator.connect(modGain);
        modGain.connect(amGain.gain);
        carrier.connect(amGain);
        amGain.connect(mainGain);

        carrier.start(); modulator.start();
        ambientNodes.current = { osc: carrier, modulator, gain: amGain };
      }
      setIsAmbientActive(true);
    } catch (e) { console.error(e); }
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
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
      }
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch (e) {}
  };

  // --- AI GAZE DETECTION ---
  const onResults = useCallback((results) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const nose = landmarks[1];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const hOffset = Math.abs(nose.x - (leftEye.x + rightEye.x) / 2);
      const currentFocused = hOffset < 0.08 && nose.y > 0.15 && nose.y < 0.85;
      
      if (currentFocused !== lastFocusState.current) {
        setIsFocused(currentFocused);
        if (!currentFocused && isActiveRef.current && modeRef.current === 'work') {
          setDistractions(d => d + 1);
          playAlert('alert');
        }
        lastFocusState.current = currentFocused;
      }
    } else if (lastFocusState.current) {
      setIsFocused(false);
      if (isActiveRef.current && modeRef.current === 'work') {
        setDistractions(d => d + 1);
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
      const cam = new window.Camera(videoRef.current, { 
        onFrame: async () => await fm.send({ image: videoRef.current }), 
        width: 640, height: 480 
      });
      await cam.start();
      setIsAiLoading(false);
      setIsAiActive(true);
      return true;
    } catch (e) { setIsAiLoading(false); return false; }
  };

  // --- APP CONTROLS ---
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
    setIsActive(false); stopAmbient(); playAlert('end');
    if (user && mode === 'work') {
      const score = Math.max(0, 100 - (distractions * 5) - (appSwitches * 15));
      await addDoc(collection(db, 'sessions'), {
        userId: user.uid, distractions, appSwitches, score, objective: settings.objective, timestamp: Date.now(), duration: settings.work
      });
    }
    const next = mode === 'work' ? 'shortBreak' : 'work';
    setMode(next); setTimeLeft(settings[next === 'work' ? 'work' : 'shortBreak'] * 60);
    setDistractions(0); setAppSwitches(0);
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && isActiveRef.current && modeRef.current === 'work') {
        setAppSwitches(s => s + 1);
        playAlert('alert');
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    signInAnonymously(auth).then(res => setUser(res.user));
    onAuthStateChanged(auth, u => {
      if (u) {
        onSnapshot(collection(db, 'sessions'), (snap) => {
          const logs = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(d => d.userId === u.uid);
          setHistory(logs.sort((a,b) => b.timestamp - a.timestamp));
        });
      }
    });
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const streak = useMemo(() => {
    if (history.length === 0) return 0;
    let count = 0; let today = new Date().setHours(0,0,0,0);
    const days = [...new Set(history.map(s => new Date(s.timestamp).setHours(0,0,0,0)))];
    for (let i = 0; i < days.length; i++) {
      if (days[i] === today - (i * 86400000)) count++; else break;
    }
    return count;
  }, [history]);

  return (
    <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center text-white overflow-hidden font-sans relative">
      {/* Cinematic Background */}
      <div className="absolute inset-0 z-0">
        <video ref={videoRef} autoPlay muted playsInline className={`h-full w-full object-cover grayscale transition-all duration-1000 ${isActive ? 'opacity-40' : 'opacity-10 blur-xl'}`} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/80" />
        <div className={`absolute inset-0 transition-all duration-700 pointer-events-none ${!isFocused && isActive && mode === 'work' ? 'bg-red-500/10 shadow-[inset_0_0_150px_rgba(255,0,0,0.3)]' : ''}`} />
      </div>

      <header className="absolute top-0 w-full p-6 flex justify-between items-center z-50">
        <div className="flex flex-col">
          <span className="text-[10px] font-black tracking-widest opacity-40 uppercase">Aura Pro v10</span>
          <span className="text-[8px] font-bold text-orange-500 uppercase tracking-widest flex items-center gap-1 mt-1"><Flame size={10}/> {streak} Day Streak</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowHistory(true)} className="p-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md"><History size={18}/></button>
          <button onClick={() => setShowEditor(true)} className="p-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md"><Settings size={18}/></button>
        </div>
      </header>

      <main className="relative z-10 flex flex-col items-center w-full max-w-sm px-8">
        {isActive && mode === 'work' && (
          <div className="mb-6 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-2">
            <Target size={10} className="text-[#00ff88]" />
            <span className="text-[9px] font-black uppercase tracking-widest opacity-70">{settings.objective}</span>
          </div>
        )}

        <div className="relative flex items-center justify-center mb-10">
          <svg width="240" height="240" className="-rotate-90">
            <circle cx="120" cy="120" r="105" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
            <circle cx="120" cy="120" r="105" fill="none" stroke={!isFocused && isActive && mode === 'work' ? '#ff4d4d' : '#00ff88'} strokeWidth="3" strokeDasharray="660" strokeDashoffset={660 - ((timeLeft/(settings[mode === 'work' ? 'work' : 'shortBreak']*60))*660)} strokeLinecap="round" className="transition-all duration-1000" />
          </svg>
          <div className="absolute text-center">
            <h1 className="text-7xl font-black tabular-nums drop-shadow-2xl">{Math.floor(timeLeft/60).toString().padStart(2,'0')}:{(timeLeft%60).toString().padStart(2,'0')}</h1>
            <div className="text-[8px] font-bold uppercase tracking-widest text-white/40 mt-2">{mode === 'work' ? 'Deep Focus' : 'Neural Break'}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full mb-10">
          <div className="bg-white/5 p-4 rounded-2xl text-center border border-white/5">
            <div className="text-[8px] font-bold text-white/30 uppercase mb-1">Gaze Penality</div>
            <div className={`text-xl font-bold ${distractions > 0 ? 'text-red-500' : 'text-white/40'}`}>{distractions}</div>
          </div>
          <div className="bg-white/5 p-4 rounded-2xl text-center border border-white/5">
            <div className="text-[8px] font-bold text-white/30 uppercase mb-1">App Escape</div>
            <div className={`text-xl font-bold ${appSwitches > 0 ? 'text-orange-500' : 'text-white/40'}`}>{appSwitches}</div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button onClick={toggle} disabled={isAiLoading} className={`h-20 w-20 rounded-full flex items-center justify-center transition-all ${isActive ? 'bg-white/10 border border-white/20' : 'bg-white text-black shadow-2xl hover:scale-105'}`}>
            {isAiLoading ? <Loader2 size={24} className="animate-spin" /> : isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
          </button>
          <button onClick={() => { setTimeLeft(settings.work*60); setIsActive(false); stopAmbient(); setDistractions(0); }} className="h-14 w-14 rounded-full bg-white/5 border border-white/5 flex items-center justify-center"><RotateCcw size={20}/></button>
        </div>
      </main>

      {/* MODALS */}
      {showEditor && (
        <div className="fixed inset-0 z-[100] bg-black/95 p-10 flex flex-col justify-center backdrop-blur-2xl">
          <div className="max-w-sm mx-auto w-full space-y-8">
            <h2 className="text-3xl font-black italic tracking-tighter">Neural Settings</h2>
            <div className="space-y-4">
              <label className="text-[10px] uppercase font-bold text-white/40">Active Objective</label>
              <input type="text" value={settings.objective} onChange={e => setSettings({...settings, objective: e.target.value})} className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-xs font-bold outline-none" />
            </div>
            <div className="space-y-4">
               <label className="text-[10px] uppercase font-bold text-white/40">Ambient Station</label>
               <div className="grid grid-cols-3 gap-2">
                {['off', 'alpha', 'theta', 'gamma', 'rain'].map(t => (
                  <button key={t} onClick={() => { setAmbientType(t); if(isActive) startAmbient(t); }} className={`py-3 rounded-lg text-[9px] font-bold uppercase border transition-all ${ambientType === t ? 'border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10' : 'border-white/10 text-white/40'}`}>{t}</button>
                ))}
              </div>
            </div>
            <button onClick={() => setShowEditor(false)} className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase text-xs tracking-widest">Update Core</button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-[100] bg-black p-10 overflow-y-auto backdrop-blur-3xl">
          <div className="max-w-xl mx-auto">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black italic tracking-tighter">Archive</h2>
              <button onClick={() => setShowHistory(false)} className="p-3 bg-white/5 rounded-full"><X /></button>
            </div>
            {history.length === 0 ? <p className="text-white/20 text-center py-20 font-bold uppercase text-[10px]">No Neural Records</p> : history.map((s, i) => (
              <div key={i} className="bg-white/5 p-6 rounded-[2rem] border border-white/5 mb-4 flex justify-between items-center">
                <div>
                  <div className="text-[8px] opacity-40 uppercase font-bold tracking-widest mb-1">{new Date(s.timestamp).toLocaleDateString()}</div>
                  <div className="text-sm font-bold">{s.objective}</div>
                  <div className="text-[9px] font-black text-[#00ff88] mt-1">{s.duration} MIN SESSION</div>
                </div>
                <div className="text-right">
                   <div className="text-xs font-black text-[#00ff88]">{s.score}% Score</div>
                   <div className="text-[8px] text-red-500 font-bold mt-1">{s.distractions} PENALITIES</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        input[type='range'] { -webkit-appearance: none; background: rgba(255,255,255,0.05); height: 4px; border-radius: 2px; }
        input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: white; cursor: pointer; border: 3px solid black; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}} />
    </div>
  );
                                                            }
      
