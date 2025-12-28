import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, RotateCcw, Settings, History, 
  X, Target, Flame, Loader2, Battery, Users, Award, 
  Camera, Trophy, ShieldCheck, Lock, Home, LayoutGrid, BarChart3,
  MessageCircle, Send, Music, Volume2, Headphones, AlertCircle, RefreshCw
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, addDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyDivV4vQYujhG6lBQkAGxgvmF2JJOwUYGY",
  authDomain: "productivety-app.firebaseapp.com",
  projectId: "productivety-app",
  storageBucket: "productivety-app.firebasestorage.app",
  messagingSenderId: "676233842288",
  appId: "1:676233842288:web:b356d5eff17c68379c6eb5",
  measurementId: "G-W3LCRZP9K1"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "aura-synergy-v35-final";

// --- 3D ENGINE LOADER ---
const useThree = (mountRef, isFocused, isActive) => {
  useEffect(() => {
    if (!mountRef.current) return;
    let renderer, scene, camera, particlesMesh, animationId;

    const init = () => {
      const THREE = window.THREE;
      if (!THREE) return;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mountRef.current.appendChild(renderer.domElement);

      const particlesGeometry = new THREE.BufferGeometry();
      const count = 2000;
      const posArray = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i++) posArray[i] = (Math.random() - 0.5) * 10;
      particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
      
      const material = new THREE.PointsMaterial({
        size: 0.015,
        color: isFocused ? 0x00ff88 : 0xff4d4d,
        transparent: true,
        opacity: 0.6,
      });

      particlesMesh = new THREE.Points(particlesGeometry, material);
      scene.add(particlesMesh);
      camera.position.z = 3;

      const animate = () => {
        animationId = requestAnimationFrame(animate);
        particlesMesh.rotation.y += 0.001;
        particlesMesh.rotation.x += isActive ? 0.003 : 0.0005;
        renderer.render(scene, camera);
      };
      animate();
    };

    if (!window.THREE) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script.onload = init;
      document.head.appendChild(script);
    } else {
      init();
    }

    return () => {
      cancelAnimationFrame(animationId);
      if (renderer) renderer.dispose();
      if (mountRef.current && renderer?.domElement) mountRef.current.removeChild(renderer.domElement);
    };
  }, [isActive]);
};

export default function App() {
  // --- Core State ---
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState('focus'); 
  const [teamView, setTeamView] = useState('camera'); 
  
  const [settings, setSettings] = useState({ 
    work: 25, break: 5, teamId: "", name: "User_" + Math.floor(Math.random()*100),
    music: 'off'
  });
  
  const [mode, setMode] = useState('work'); 
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [violations, setViolations] = useState(0);
  const [history, setHistory] = useState([]);
  
  const [teamMembers, setTeamMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState("");

  const mountRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const ambientNode = useRef(null);
  const stateRef = useRef({ mode: 'work', isActive: false, isFocused: true });

  useThree(mountRef, isFocused, isActive);

  useEffect(() => {
    stateRef.current = { mode, isActive, isFocused };
  }, [mode, isActive, isFocused]);

  // --- Auth & Data ---
  useEffect(() => {
    const init = async () => {
      try {
        const res = await signInAnonymously(auth);
        setUser(res.user);
      } catch (e) { console.error(e); }
      setBooting(false);
    };
    init();
    const script = document.createElement('script');
    script.src = 'https://cdn.tailwindcss.com';
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!user) return;
    const qH = collection(db, 'artifacts', appId, 'users', user.uid, 'history');
    onSnapshot(qH, (s) => setHistory(s.docs.map(d => d.data()).sort((a,b) => b.timestamp - a.timestamp)));

    if (settings.teamId) {
      const tid = settings.teamId.toUpperCase();
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'teams', tid, 'members'), (s) => {
        setTeamMembers(s.docs.map(d => ({id: d.id, ...d.data()})));
      });
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'teams', tid, 'chat'), (s) => {
        const msgs = s.docs.map(d => d.data());
        setMessages(msgs.sort((a,b) => a.timestamp - b.timestamp).slice(-30));
      });
    }
  }, [user, settings.teamId]);

  // Team Heartbeat
  useEffect(() => {
    if (!user || !settings.teamId) return;
    const interval = setInterval(() => {
      const snap = canvasRef.current?.toDataURL('image/webp', 0.1) || "";
      setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', settings.teamId.toUpperCase(), 'members', user.uid), {
        name: settings.name, snapshot: snap, isActive: stateRef.current.isActive, isFocused: stateRef.current.isFocused,
        totalHours: (history.reduce((a,s) => a + (s.duration||0), 0) / 60).toFixed(1), lastSeen: Date.now()
      }, { merge: true });
    }, 6000);
    return () => clearInterval(interval);
  }, [user, settings.teamId, history]);

  // --- Logic ---
  const startMusic = async (type) => {
    if (ambientNode.current) { try { ambientNode.current.stop(); } catch(e) {} }
    if (type === 'off') return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(type === 'alpha' ? 12 : type === 'gamma' ? 40 : 120, ctx.currentTime);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); ambientNode.current = osc;
    } catch(e) {}
  };

  const toggleTimer = async () => {
    if (!isActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
        setIsActive(true);
        startMusic(settings.music);
        
        // MediaPipe
        const load = (src) => new Promise(r => {
            const s = document.createElement('script'); s.src = src; s.onload = r; document.head.appendChild(s);
        });
        await load("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js");
        await load("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
        
        const fm = new window.FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
        fm.setOptions({ maxNumFaces: 1, minDetectionConfidence: 0.6 });
        fm.onResults((results) => {
          let seen = false;
          if (results.multiFaceLandmarks?.[0]) {
            const nose = results.multiFaceLandmarks[0][1];
            seen = Math.abs(nose.x - 0.5) < 0.12 && Math.abs(nose.y - 0.5) < 0.2;
          }
          if (stateRef.current.isFocused !== seen) {
            setIsFocused(seen);
            if (!seen && stateRef.current.isActive && stateRef.current.mode === 'work') setViolations(v => v + 1);
          }
          if (videoRef.current && canvasRef.current) canvasRef.current.getContext('2d').drawImage(videoRef.current, 0, 0, 160, 120);
        });
        new window.Camera(videoRef.current, { onFrame: async () => await fm.send({ image: videoRef.current }), width: 480, height: 360 }).start();
      } catch (e) { setIsActive(true); }
    } else {
        setIsActive(false);
        if (ambientNode.current) try { ambientNode.current.stop(); } catch(e) {}
    }
  };

  const sendChat = async () => {
    if (!inputMsg.trim() || !settings.teamId) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'teams', settings.teamId.toUpperCase(), 'chat'), {
      sender: settings.name, text: inputMsg, timestamp: Date.now()
    });
    setInputMsg("");
  };

  useEffect(() => {
    if (isActive && isFocused && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else clearInterval(timerRef.current);
    if (timeLeft === 0 && isActive) {
      if (user && mode === 'work') addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), { duration: settings.work, timestamp: Date.now() });
      setIsActive(false); setMode(mode === 'work' ? 'break' : 'work');
      setTimeLeft(settings[mode === 'work' ? 'break' : 'work'] * 60);
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, isFocused, timeLeft]);

  if (booting) return <div className="h-screen bg-black flex items-center justify-center font-black text-[#00ff88] tracking-[0.4em] animate-pulse italic">Neural Sync...</div>;

  return (
    <div className="min-h-screen w-full bg-[#020202] text-white flex flex-col font-sans overflow-hidden select-none relative">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} width="160" height="120" className="hidden" />
      <div ref={mountRef} className="fixed inset-0 z-0 opacity-40 pointer-events-none" />

      {/* TOP STATUS BAR */}
      <header className="p-4 flex justify-between items-center z-[70] bg-black/40 border-b border-white/5 backdrop-blur-xl">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[#00ff88]">Aura Synergy v35</span>
          <span className="text-[8px] font-bold opacity-30 mt-0.5 uppercase">{settings.teamId ? `Room: ${settings.teamId}` : 'Neural Solo'}</span>
        </div>
        <div className={`w-2.5 h-2.5 rounded-full ${isActive ? (isFocused ? 'bg-[#00ff88] shadow-[0_0_15px_#00ff88]' : 'bg-red-500 shadow-[0_0_15px_red]') : 'bg-white/10'}`} />
      </header>

      {/* TABS CONTAINER */}
      <main className="flex-grow relative overflow-y-auto pb-24 z-10 scrollbar-hide">
        
        {/* FOCUS TAB */}
        {activeTab === 'focus' && (
          <div className="h-full flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in">
             <div className="relative flex items-center justify-center mb-10 scale-90 sm:scale-100">
                <svg width="260" height="260" className="-rotate-90 absolute opacity-5"><circle cx="130" cy="130" r="115" fill="none" stroke="white" strokeWidth="2" /></svg>
                <svg width="260" height="260" className="-rotate-90">
                  <circle cx="130" cy="130" r="115" fill="none" stroke={!isFocused && isActive ? '#ff4d4d' : '#00ff88'} strokeWidth="4" strokeDasharray="722" strokeDashoffset={722 - ((timeLeft/(settings[mode]*60))*722)} strokeLinecap="round" className="transition-all duration-1000 ease-linear shadow-[0_0_20px_#00ff8822]" />
                </svg>
                <div className="absolute text-center">
                   <h1 className={`text-7xl font-black tabular-nums tracking-tighter ${!isFocused && isActive ? 'text-red-500 blur-sm scale-90' : 'text-white'}`}>
                     {Math.floor(timeLeft/60).toString().padStart(2,'0')}:{(timeLeft%60).toString().padStart(2,'0')}
                   </h1>
                   <div className="text-[10px] font-black uppercase opacity-30 tracking-[0.2em] mt-3 italic">{mode === 'work' ? 'Locked In' : 'Neural Rest'}</div>
                </div>
             </div>

             <div className="flex items-center gap-10 mb-10">
                <button onClick={toggleTimer} className={`h-20 w-20 rounded-full flex items-center justify-center transition-all active:scale-95 ${isActive ? 'bg-white/5 border border-white/20' : 'bg-white text-black shadow-2xl hover:scale-105'}`}>
                   {isActive ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1" />}
                </button>
                <button onClick={() => { setTimeLeft(settings.work*60); setIsActive(false); setViolations(0); }} className="h-12 w-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30 active:scale-90"><RotateCcw size={20}/></button>
             </div>

             <div className="grid grid-cols-2 gap-4 w-full max-w-[300px]">
                <div className="bg-white/5 border border-white/5 p-4 rounded-[2rem] text-center backdrop-blur-md">
                   <span className="text-[8px] font-black text-white/20 uppercase block mb-1">Gaze Pen</span>
                   <span className={`text-2xl font-black ${violations > 0 ? 'text-red-500' : 'text-white/40'}`}>{violations}</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-4 rounded-[2rem] text-center backdrop-blur-md">
                   <span className="text-[8px] font-black text-white/20 uppercase block mb-1">Neural Hrs</span>
                   <span className="text-2xl font-black text-[#00ff88]">{(history.reduce((a,s)=>a+(s.duration||0),0)/60).toFixed(1)}</span>
                </div>
             </div>
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div className="p-6 h-full flex flex-col animate-in slide-in-from-right-4">
             <div className="flex bg-white/5 rounded-[2rem] p-1.5 mb-6 border border-white/5">
                <button onClick={() => setTeamView('camera')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-[1.5rem] transition-all flex items-center justify-center gap-2 ${teamView === 'camera' ? 'bg-white text-black' : 'opacity-30'}`}><Camera size={14}/> Room</button>
                <button onClick={() => setTeamView('chat')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-[1.5rem] transition-all flex items-center justify-center gap-2 ${teamView === 'chat' ? 'bg-white text-black' : 'opacity-30'}`}><MessageCircle size={14}/> Chat</button>
             </div>

             {teamView === 'camera' ? (
                <div className="grid grid-cols-2 gap-3 pb-10">
                   {teamMembers.map(m => (
                     <div key={m.id} className="relative aspect-video bg-white/5 rounded-[1.8rem] border border-white/10 overflow-hidden shadow-2xl transition-all">
                        {m.snapshot ? <img src={m.snapshot} className={`w-full h-full object-cover grayscale ${!m.isActive ? 'blur-lg opacity-20' : ''}`} alt="" /> : <div className="w-full h-full flex items-center justify-center opacity-5"><Camera size={16}/></div>}
                        <div className="absolute inset-x-0 bottom-0 p-2.5 bg-black/60 flex items-center justify-between backdrop-blur-md">
                           <span className="text-[8px] font-black uppercase truncate max-w-[65px]">{m.name}</span>
                           <div className={`w-2 h-2 rounded-full ${m.isActive ? (m.isFocused ? 'bg-[#00ff88]' : 'bg-red-500 shadow-[0_0_5px_red]') : 'bg-white/10'}`} />
                        </div>
                     </div>
                   ))}
                </div>
             ) : (
                <div className="flex flex-col h-[55vh] bg-white/5 rounded-[2.5rem] border border-white/5 p-5 backdrop-blur-3xl">
                   <div className="flex-grow overflow-y-auto space-y-4 mb-4 pr-1 scrollbar-hide text-[11px]">
                      {messages.map((m, i) => (
                        <div key={i} className={`flex flex-col ${m.sender === settings.name ? 'items-end' : 'items-start'}`}>
                           <span className="text-[7px] font-black uppercase opacity-30 mb-1">{m.sender}</span>
                           <div className={`px-4 py-2 rounded-2xl max-w-[85%] ${m.sender === settings.name ? 'bg-[#00ff88] text-black font-bold' : 'bg-white/10'}`}>
                              {m.text}
                           </div>
                        </div>
                      ))}
                   </div>
                   <div className="flex gap-2">
                      <input value={inputMsg} onChange={e => setInputMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Neural chat..." className="flex-grow bg-white/5 border border-white/10 rounded-full px-4 py-3 text-[11px] outline-none" />
                      <button onClick={sendChat} className="p-3 bg-[#00ff88] text-black rounded-full shadow-lg"><Send size={16}/></button>
                   </div>
                </div>
             )}
          </div>
        )}

        {/* RANKING TAB */}
        {activeTab === 'rank' && (
          <div className="p-8 animate-in slide-in-from-right-4">
             <div className="flex items-center gap-4 mb-10">
                <div className="p-4 bg-[#00ff88]/10 rounded-[2rem] border border-[#00ff88]/20"><Trophy size={24} className="text-[#00ff88]" /></div>
                <div>
                   <h2 className="text-2xl font-black italic uppercase italic tracking-tighter">Global Pod</h2>
                   <p className="text-[9px] font-bold uppercase opacity-30 tracking-[0.2em]">Live Ranking</p>
                </div>
             </div>
             <div className="space-y-3 pb-10">
                {teamMembers.sort((a,b) => (b.totalHours||0) - (a.totalHours||0)).map((m, i) => (
                   <div key={m.id} className="flex justify-between items-center bg-white/5 p-5 rounded-[2.2rem] border border-white/5 transition-all hover:bg-white/10">
                      <div className="flex items-center gap-4">
                         <span className={`text-xl font-black ${i < 3 ? 'text-[#00ff88]' : 'text-white/10'}`}>0{i+1}</span>
                         <span className="text-[11px] font-black uppercase tracking-widest">{m.name}</span>
                      </div>
                      <span className="text-xl font-black text-[#00ff88]">{m.totalHours || 0}h</span>
                   </div>
                ))}
             </div>
          </div>
        )}

        {/* SETUP TAB */}
        {activeTab === 'settings' && (
          <div className="p-8 animate-in slide-in-from-right-4">
             <h2 className="text-2xl font-black italic uppercase italic tracking-tighter mb-10">System Setup</h2>
             <div className="space-y-8">
                <div className="space-y-1.5"><label className="text-[9px] font-black uppercase text-white/20 ml-3">Pseudonym</label><input type="text" value={settings.name} onChange={e => setSettings({...settings, name: e.target.value})} className="w-full bg-white/5 border border-white/10 p-5 rounded-3xl text-sm font-black outline-none focus:border-[#00ff88]/40" /></div>
                <div className="space-y-1.5"><label className="text-[9px] font-black uppercase text-white/20 ml-3">Room ID (Team)</label><input type="text" value={settings.teamId} onChange={e => setSettings({...settings, teamId: e.target.value.toUpperCase()})} className="w-full bg-white/5 border border-white/10 p-5 rounded-3xl text-sm font-black outline-none focus:border-[#00ff88]/40 placeholder:text-white/10" placeholder="JOIN_SQUAD" /></div>
                
                <div className="space-y-3">
                   <label className="text-[9px] font-black uppercase text-white/20 ml-3">Neural Station</label>
                   <div className="grid grid-cols-4 gap-2">
                      {['off', 'alpha', 'gamma', 'rain'].map(t => (
                        <button key={t} onClick={() => { setSettings({...settings, music: t}); if(isActive) startMusic(t); }} className={`py-3.5 rounded-2xl text-[9px] font-black uppercase border transition-all ${settings.music === t ? 'bg-[#00ff88] text-black border-[#00ff88]' : 'bg-white/5 border-white/10 opacity-30'}`}>{t}</button>
                      ))}
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5"><label className="text-[9px] font-black text-white/20 uppercase ml-4">Focus (m)</label><input type="number" value={settings.work} onChange={e => setSettings({...settings, work: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 p-5 rounded-3xl text-sm font-black text-white" /></div>
                   <div className="space-y-1.5"><label className="text-[9px] font-black text-white/20 uppercase ml-4">Break (m)</label><input type="number" value={settings.break} onChange={e => setSettings({...settings, break: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 p-5 rounded-3xl text-sm font-black text-white" /></div>
                </div>
             </div>
          </div>
        )}

      </main>

      {/* BOTTOM NAV BAR */}
      <nav className="fixed bottom-0 left-0 w-full h-20 bg-black/80 backdrop-blur-3xl border-t border-white/5 z-[100] px-6 flex items-center justify-between rounded-t-[2.5rem]">
         <button onClick={() => setActiveTab('focus')} className={`p-4 transition-all ${activeTab === 'focus' ? 'text-[#00ff88] scale-110 drop-shadow-[0_0_10px_#00ff88]' : 'opacity-20'}`}><Home size={24}/></button>
         <button onClick={() => setActiveTab('team')} className={`p-4 transition-all ${activeTab === 'team' ? 'text-[#00ff88] scale-110 drop-shadow-[0_0_10px_#00ff88]' : 'opacity-20'}`}><LayoutGrid size={24}/></button>
         <button onClick={() => setActiveTab('rank')} className={`p-4 transition-all ${activeTab === 'rank' ? 'text-[#00ff88] scale-110 drop-shadow-[0_0_10px_#00ff88]' : 'opacity-20'}`}><BarChart3 size={24}/></button>
         <button onClick={() => setActiveTab('settings')} className={`p-4 transition-all ${activeTab === 'settings' ? 'text-[#00ff88] scale-110 drop-shadow-[0_0_10px_#00ff88]' : 'opacity-20'}`}><Settings size={24}/></button>
      </nav>

      <style dangerouslySetInnerHTML={{ __html: `
        ::-webkit-scrollbar { display: none; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      `}} />
    </div>
  );
}


