
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, collection, onSnapshot, 
  addDoc, updateDoc, runTransaction 
} from 'firebase/firestore';
import { 
  User, Zap, Shield, Sword, Brain, Timer, CheckCircle2, 
  Plus, Coins, ShoppingBag, X, Play, Settings,
  ShieldCheck, Medal, Crown, Camera, Sparkles,
  Globe, MessageSquare, Loader2, Flame, Skull, Ghost, Wand2, Axe, 
  AlertTriangle, Clock, Map, BookOpen, Download, Cpu, Activity
} from 'lucide-react';

// --- SYSTEM CORE CONFIG (INTEGRATED) ---
const firebaseConfig = {
  apiKey: "AIzaSyAw-WTRYxBG_qowDO2bdlCnZZUn6zTs_fo",
  authDomain: "system-c6465.firebaseapp.com",
  projectId: "system-c6465",
  storageBucket: "system-c6465.firebasestorage.app",
  messagingSenderId: "276543243748",
  appId: "1:276543243748:web:16e793767fdae5097cb3f1",
  measurementId: "G-9FCTH7WMRD"
};

const GEMINI_API_KEY = "AIzaSyDq5CemlgjoBP0OJm1U4ihUZ3Y5f--YqvQ"; 
const APP_ID = "shadow-monarch-production-v1";

// Initialize System Nodes
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

// --- DESIGN TOKENS ---
const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
const CLASSES = {
  WARRIOR: { name: "Warrior", stat: "strength", icon: <Axe size={20}/>, color: "text-red-500" },
  MAGE: { name: "Mage", stat: "intelligence", icon: <Wand2 size={20}/>, color: "text-blue-400" },
  ASSASSIN: { name: "Assassin", stat: "agility", icon: <Zap size={20}/>, color: "text-purple-400" },
  GUARDIAN: { name: "Guardian", stat: "willpower", icon: <Shield size={20}/>, color: "text-emerald-400" }
};
const STAT_ICONS = { strength: <Sword size={16}/>, intelligence: <Brain size={16}/>, willpower: <Shield size={16}/>, agility: <Timer size={16}/> };

export default function App() {
  const [bootState, setBootState] = useState('INIT'); 
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  // Global Sync States
  const [leaderboard, setLeaderboard] = useState([]);
  const [globalFeed, setGlobalFeed] = useState([]);
  const [worldBoss, setWorldBoss] = useState(null);
  const [gates, setGates] = useState([]);
  const [shop, setShop] = useState([]);

  // User Sync States
  const [quests, setQuests] = useState([]);
  const [shadowArmy, setShadowArmy] = useState([]);

  // UI Navigation
  const [activeTab, setActiveTab] = useState('quests');
  const [showAdd, setShowAdd] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [notif, setNotif] = useState(null);
  
  // Pomodoro & AI
  const [isFocusing, setIsFocusing] = useState(false);
  const [timerSec, setTimerSec] = useState(1500);
  const [focusXp, setFocusXp] = useState(0);
  const [backlash, setBacklash] = useState(false);
  const [verifying, setVerifying] = useState(null); 
  const [aiWorking, setAiWorking] = useState(false);
  const [ariseObj, setAriseObj] = useState(null);
  const fileRef = useRef(null);

  // 1. BOOTLOADER (Rule 3)
  useEffect(() => {
    const initAuth = async () => {
        try {
            const u = await signInAnonymously(auth);
            setUser(u.user);
            setBootState('SYNC');
        } catch (e) { console.error("Auth Error", e); }
    };
    initAuth();
  }, []);

  // 2. DATA GRID SYNCHRONIZATION (Rule 1)
  useEffect(() => {
    if (!user) return;
    const publicPath = (c) => collection(db, 'artifacts', APP_ID, 'public', 'data', c);
    const userPath = (c) => collection(db, 'artifacts', APP_ID, 'users', user.uid, c);

    const unsubs = [
      onSnapshot(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), s => {
        setProfile(s.exists() ? s.data() : null);
        setBootState('READY');
      }),
      onSnapshot(userPath('quests'), s => setQuests(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(userPath('shadows'), s => setShadowArmy(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(publicPath('dpps'), s => setGates(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(publicPath('shop'), s => setShop(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'world_boss', 'active'), s => setWorldBoss(s.exists() ? s.data() : null)),
      onSnapshot(publicPath('leaderboard'), s => setLeaderboard(s.docs.map(d => d.data()).sort((a,b) => (b.level || 0) - (a.level || 0)).slice(0, 10))),
      onSnapshot(publicPath('feed'), s => setGlobalFeed(s.docs.map(d => d.data()).sort((a,b) => b.ts - a.ts).slice(0, 10)))
    ];
    return () => unsubs.forEach(f => f());
  }, [user]);

  // 3. POMODORO SYSTEM
  useEffect(() => {
    let t;
    if (isFocusing && timerSec > 0) {
      t = setInterval(() => {
        setTimerSec(s => s - 1);
        if (timerSec % 60 === 0) setFocusXp(x => x + 5);
      }, 1000);
    } else if (timerSec === 0 && isFocusing) { finalizeFocus(); }
    return () => clearInterval(t);
  }, [isFocusing, timerSec]);

  useEffect(() => {
    const handleVis = () => {
      if (document.hidden && isFocusing) {
        setIsFocusing(false); setBacklash(true);
        if (profile) updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), { hp: Math.max(0, (profile.hp || 100) - 10) });
      }
    };
    document.addEventListener("visibilitychange", handleVis);
    return () => document.removeEventListener("visibilitychange", handleVis);
  }, [isFocusing, profile]);

  const finalizeFocus = async () => {
    setIsFocusing(false);
    const xp = focusXp + 60;
    await grantReward(xp, 25, 'willpower');
    triggerNotification(`Focus Complete! +${xp} XP`, "success");
    setTimerSec(1500); setFocusXp(0);
  };

  // 4. AI SCANNER & REWARDS
  const handleAIVerify = async (file) => {
    if (!file || !verifying) return;
    setAiWorking(true);
    triggerNotification("System analyzing solution artifacts...", "info");

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const title = verifying.mode === 'QUEST' ? verifying.obj.text : verifying.obj.title;
        const prompt = `Quest: "${title}". Is this photo proof of completion? (e.g. solved DPP, notes, math). Respond JSON only: {"success": boolean, "reason": "str"}`;
        
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/png", data: base64 } }] }], generationConfig: { responseMimeType: "application/json" } })
        });
        const data = await res.json();
        const json = JSON.parse(data.candidates[0].content.parts[0].text);

        if (json.success) {
          const { obj, mode } = verifying;
          const statBonus = (profile.playerClass && CLASSES[profile.playerClass].stat === obj.stat) ? 1.5 : 1.0;
          await grantReward(Math.floor(obj.xp * statBonus), obj.gold, obj.stat);
          if (mode === 'QUEST') await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'quests', obj.id), { completed: true });
          if (worldBoss) await dealBossDamage(obj.rank);
          if (obj.rank === 'A' || obj.rank === 'S') setAriseObj(obj);
          triggerNotification("Proof Accepted", "success");
        } else { triggerNotification(json.reason, "error"); }
        setAiWorking(false); setVerifying(null);
      };
    } catch (e) { setAiWorking(false); triggerNotification("AI Error", "error"); }
  };

  const grantReward = async (xpG, goldG, sKey) => {
    let { level, xp, maxXp, gold, stats, rank } = profile;
    xp += xpG; gold += goldG; stats[sKey] = (stats[sKey] || 0) + 1;
    while (xp >= maxXp) { xp -= maxXp; level += 1; maxXp = Math.floor(maxXp * 1.4); }
    const newRank = RANKS[Math.min(Math.floor(level / 10), 5)];
    const upd = { ...profile, level, xp, maxXp, gold, stats, rank: newRank };
    await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), upd);
    await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'leaderboard', user.uid), { uid: user.uid, name: profile.name, level, rank: newRank, playerClass: profile.playerClass, ts: Date.now() });
  };

  const dealBossDamage = async (rank) => {
    const dmg = (RANKS.indexOf(rank) + 1) * 250;
    await runTransaction(db, async t => {
      const bRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'world_boss', 'active');
      const bSnap = await t.get(bRef);
      if (bSnap.exists()) t.update(bRef, { hp: Math.max(0, bSnap.data().hp - dmg) });
    });
  };

  const triggerNotification = (msg, type) => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 4000);
  };

  if (bootState !== 'READY') return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 space-y-4 font-mono text-blue-500">
      <Cpu className="animate-spin" />
      <span className="animate-pulse tracking-[0.5em] text-xs uppercase">Connecting to grid...</span>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 space-y-12">
      <h1 className="text-6xl font-black italic text-blue-600 tracking-tighter">ARISE</h1>
      <div className="w-full max-w-sm space-y-6 text-center">
        <p className="text-slate-500 uppercase tracking-widest text-[10px]">Select Your Path</p>
        <div className="grid grid-cols-2 gap-4">
            {Object.entries(CLASSES).map(([k,v]) => (
                <button key={k} onClick={()=>setActiveTab(k)} className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${activeTab === k ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-900/40'}`}>
                <div className={activeTab === k ? 'text-blue-500 scale-125' : 'text-slate-600'}>{v.icon}</div>
                <span className="text-[10px] font-black uppercase tracking-widest">{v.name}</span>
                </button>
            ))}
        </div>
        <input id="hName" className="w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl text-center outline-none focus:border-blue-500 font-mono" placeholder="HUNTER NAME" />
        <button onClick={() => {
          const n = document.getElementById('hName').value;
          if (n) setDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), { name: n, playerClass: activeTab==='quests'?'WARRIOR':activeTab, level: 1, xp: 0, maxXp: 100, gold: 100, rank: "E", stats: { strength: 1, intelligence: 1, agility: 1, willpower: 1 }, hp: 100, isAdmin: false });
        }} className="w-full bg-blue-600 py-5 rounded-2xl font-black uppercase tracking-widest shadow-2xl">Initialize</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-slate-100 font-sans pb-32 overflow-x-hidden">
      <input type="file" ref={fileRef} className="hidden" onChange={(e) => handleAIVerify(e.target.files[0])} />

      {/* WORLD BOSS BAR */}
      {worldBoss && worldBoss.hp > 0 && (
        <div className="bg-red-950/20 border-b border-red-500/20 p-4 sticky top-0 z-[100] backdrop-blur-lg">
           <div className="max-w-4xl mx-auto flex items-center gap-6">
              <Flame className="text-red-500 animate-pulse" size={28} />
              <div className="flex-1 space-y-1">
                 <div className="flex justify-between text-[11px] font-black uppercase text-red-500 tracking-widest"><span>{worldBoss.name}</span><span>{worldBoss.hp.toLocaleString()} HP</span></div>
                 <div className="h-1.5 bg-black rounded-full overflow-hidden border border-red-900/30 shadow-inner">
                    <div className="h-full bg-red-600 transition-all duration-1000" style={{ width: `${(worldBoss.hp/worldBoss.maxHp)*100}%` }} />
                 </div>
              </div>
           </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 pt-8 space-y-8">
        
        {/* HUD */}
        <header className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/60 rounded-[3rem] p-8 flex flex-col md:flex-row gap-10 items-center shadow-2xl relative overflow-hidden">
          <div className="flex items-center gap-8 flex-1">
            <div className="relative">
              <div className="w-24 h-24 rounded-[2rem] bg-slate-800 border-2 border-blue-500/40 flex items-center justify-center shadow-xl">
                <User size={48} className="text-blue-500" />
                {profile.isAdmin && <ShieldCheck className="absolute -top-2 -left-2 text-red-500" size={20} />}
              </div>
              <span className="absolute -bottom-2 -right-2 px-3 py-1 rounded-xl border bg-black text-[10px] font-black">{profile.rank}-RANK</span>
            </div>
            <div>
              <h2 className="text-3xl font-black italic text-white uppercase tracking-tighter">{profile.name}</h2>
              <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                <span className="text-blue-400">{profile.playerClass} HUNTER</span>
                <span>• LVL {profile.level}</span>
                <span className="text-yellow-500">{profile.gold}G</span>
              </div>
            </div>
          </div>
          <div className="w-full md:w-80 space-y-6">
             <Bar label="Grid EXP" val={profile.xp} max={profile.maxXp} color="bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.3)]" />
             <div className="grid grid-cols-3 gap-2">
                <StatBox label="HP" val={`${profile.hp || 100}%`} color="text-red-500" />
                <StatBox label="Army" val={shadowArmy.length} color="text-indigo-400" />
                <button onClick={()=>setShowAdmin(true)} className="bg-slate-900/50 p-2 rounded-2xl border border-slate-800 flex items-center justify-center text-slate-500 hover:text-white shadow-lg transition-all"><Settings size={18}/></button>
             </div>
          </div>
        </header>

        {/* POMODORO */}
        <section className={`bg-slate-900/40 border-2 rounded-[2.5rem] p-10 flex flex-col md:flex-row items-center justify-between gap-10 transition-all ${isFocusing ? 'border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.1)]' : 'border-slate-800'}`}>
           <div className="flex items-center gap-8 text-center md:text-left">
              <div className={`p-6 rounded-3xl ${isFocusing ? 'bg-blue-600 text-white animate-spin-slow shadow-lg' : 'bg-slate-800 text-slate-600'}`}><Clock size={40}/></div>
              <div>
                 <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.4em] mb-1">Mana Meditation</h3>
                 <p className="text-6xl font-black font-mono text-white tracking-tighter">{Math.floor(timerSec/60)}:{String(timerSec%60).padStart(2,'0')}</p>
                 {isFocusing && <p className="text-[10px] text-blue-400 font-black uppercase mt-2 tracking-widest animate-pulse">Accruing XP Resonance...</p>}
              </div>
           </div>
           <button onClick={()=>setIsFocusing(!isFocusing)} className={`px-16 py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl transition-all active:scale-95 ${isFocusing ? 'bg-red-500/10 border border-red-500 text-red-500' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
             {isFocusing ? 'Abort Focus' : 'Commence Focus'}
           </button>
        </section>

        {/* NAVIGATION */}
        <div className="flex gap-2 p-1.5 bg-slate-900/30 border border-slate-800 rounded-3xl overflow-x-auto no-scrollbar shadow-inner">
          {['quests', 'gates', 'ranking', 'shop', 'feed'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 min-w-[120px] py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === t ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
              {t === 'gates' ? <Map size={12} className="inline mr-2" /> : ''}{t}
            </button>
          ))}
        </div>

        {/* MAIN LISTS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <aside className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-10 space-y-8 shadow-2xl">
               <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-3"><Brain size={20}/> Attribute Registry</h3>
               {Object.entries(profile.stats || {}).map(([k, v]) => (
                 <div key={k} className="flex justify-between items-center group">
                   <span className={`text-[11px] uppercase flex items-center gap-3 ${CLASSES[profile.playerClass]?.stat === k ? 'text-blue-400 font-black' : 'text-slate-500'}`}>
                     {STAT_ICONS[k] || <Zap size={14}/>} {k}
                   </span>
                   <span className="text-3xl font-black font-mono text-white group-hover:text-blue-500 transition-colors">{v}</span>
                 </div>
               ))}
            </div>
          </aside>

          <main className="lg:col-span-8 space-y-6">
            {activeTab === 'quests' && (
              <div className="space-y-6">
                <div className="flex justify-between px-4 items-center uppercase text-xs font-black text-blue-500 tracking-[0.3em]">Operational Log<button onClick={()=>setShowAdd(true)} className="bg-blue-600 p-2.5 rounded-2xl text-white shadow-xl hover:scale-105 transition-all"><Plus size={24}/></button></div>
                {quests.filter(q => !q.completed).map(q => (
                  <QuestCard key={q.id} quest={q} onAction={() => { setVerifying({ obj: q, mode: 'QUEST' }); fileRef.current.click(); }} />
                ))}
                {quests.filter(q=>!q.completed).length === 0 && <div className="py-24 text-center border-2 border-dashed border-slate-800/40 rounded-[3rem] text-slate-700 uppercase font-black text-xs italic">No Active Grid Missions.</div>}
              </div>
            )}

            {activeTab === 'gates' && (
              <div className="space-y-6">
                 <h3 className="text-xs font-black text-emerald-500 uppercase tracking-[0.4em] px-4">Global Gates (DPPs)</h3>
                 {gates.map(g => (
                   <div key={g.id} className="bg-slate-900 border-2 border-emerald-900/30 p-8 rounded-[3rem] space-y-6 relative overflow-hidden group hover:border-emerald-500 transition-all shadow-2xl">
                      <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><BookOpen size={100}/></div>
                      <div className="space-y-1">
                         <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">{g.rank}-RANK GATE OPEN</span>
                         <h4 className="text-3xl font-black italic tracking-tighter text-white uppercase leading-tight">{g.title}</h4>
                         <p className="text-slate-500 text-xs italic font-bold leading-relaxed">{g.description}</p>
                      </div>
                      <div className="flex gap-4">
                         <a href={g.url} target="_blank" className="flex-1 bg-white text-black py-4 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 hover:scale-[1.02] transition-all"><Download size={18}/> Enter Gate</a>
                         <button onClick={()=>{ setVerifying({ obj: g, mode: 'GATE' }); fileRef.current.click(); }} className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 shadow-xl hover:bg-emerald-500 transition-all"><Camera size={18}/> Verify Solution</button>
                      </div>
                   </div>
                 ))}
                 {gates.length === 0 && <div className="py-24 text-center border-2 border-dashed border-slate-800/40 rounded-[3rem] text-slate-700 font-black uppercase text-xs italic">Grid Gates Inactive.</div>}
              </div>
            )}

            {activeTab === 'ranking' && (
              <div className="bg-slate-900/30 border border-slate-800 rounded-[3rem] overflow-hidden shadow-2xl">
                 {leaderboard.map((h, i) => (
                  <div key={i} className={`flex items-center justify-between p-10 border-b border-slate-800/30 last:border-0 ${h.uid === user.uid ? 'bg-blue-600/5 shadow-inner' : 'hover:bg-white/5'}`}>
                    <div className="flex items-center gap-10"><span className={`text-2xl font-black italic ${i < 3 ? 'text-blue-500' : 'text-slate-700'}`}>#{i+1}</span><div><p className="text-xl font-black uppercase tracking-tight text-white leading-none">{h.name}</p><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 block">{h.playerClass} RANK {h.rank}</span></div></div>
                    <div className="text-right text-4xl font-black font-mono text-white tracking-tighter">{h.level}</div>
                  </div>
                ))}
              </div>
            )}
            
            {activeTab === 'feed' && (
               <div className="space-y-4 px-4 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {globalFeed.map((f, i) => (
                    <div key={i} className="bg-slate-900/40 p-6 rounded-3xl border border-slate-800 animate-in fade-in slide-in-from-left-4">
                       <p className="text-sm font-bold text-slate-200 leading-relaxed italic">{f.message}</p>
                       <p className="text-[9px] font-black text-slate-600 uppercase mt-2 tracking-widest">{new Date(f.ts).toLocaleTimeString()}</p>
                    </div>
                  ))}
               </div>
            )}
          </main>
        </div>
      </div>

      {/* OVERLAYS */}
      {aiWorking && (
        <div className="fixed inset-0 z-[500] bg-black/98 backdrop-blur-3xl flex flex-col items-center justify-center space-y-10">
           <Loader2 className="text-blue-500 animate-spin" size={100} />
           <p className="text-3xl font-black italic text-blue-400 tracking-tighter uppercase animate-pulse">Scanning Visual Proof...</p>
        </div>
      )}

      {ariseObj && (
        <div className="fixed inset-0 z-[600] bg-black/99 flex flex-col items-center justify-center space-y-16 p-12 animate-in zoom-in-95 duration-1000">
           <Ghost className="text-indigo-500 animate-pulse" size={300} />
           <h2 className="text-8xl font-black italic text-white tracking-tighter text-center uppercase underline decoration-indigo-600 decoration-8 underline-offset-8">ARISE</h2>
           <button onClick={async () => {
             const name = ["Igris", "Tank", "Beru", "Kaisel", "Iron"][Math.floor(Math.random()*5)] + " Shadow";
             await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'shadows'), { name, stat: ariseObj.stat, ts: Date.now() });
             setAriseObj(null);
             triggerNotif(`ARISE: ${name} added to army.`, "success");
           }} className="px-32 py-10 bg-indigo-600 text-white font-black text-6xl italic tracking-tighter rounded-full shadow-[0_0_120px_rgba(79,70,229,0.8)] active:scale-95 transition-all">ARISE.</button>
           <button onClick={() => setAriseObj(null)} className="text-slate-600 uppercase font-black text-xs tracking-[1em] hover:text-white transition-colors">Ignore</button>
        </div>
      )}

      {showAdd && (
        <Modal title="Deploy System Quest" onClose={() => setShowAdd(false)}>
           <form onSubmit={async (e) => {
             e.preventDefault();
             const fd = new FormData(e.target);
             await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'quests'), {
               text: fd.get('text'), rank: fd.get('rank'), stat: fd.get('stat'), xp: 150, gold: 30, completed: false, createdAt: Date.now()
             });
             setShowAdd(false);
           }} className="space-y-8">
              <input name="text" placeholder="QUEST OBJECTIVE..." className="w-full bg-slate-900 border border-slate-800 p-8 rounded-[2rem] outline-none text-xl font-mono focus:border-blue-500 shadow-inner" required />
              <div className="grid grid-cols-2 gap-6">
                <select name="rank" className="bg-slate-900 p-6 rounded-2xl border border-slate-800 font-black text-xs uppercase outline-none shadow-inner">{RANKS.map(r => <option key={r} value={r}>{r}</option>)}</select>
                <select name="stat" className="bg-slate-900 p-6 rounded-2xl border border-slate-800 font-black text-xs uppercase outline-none shadow-inner">{Object.keys(profile.stats || {}).map(s => <option key={s} value={s}>{s}</option>)}</select>
              </div>
              <button className="w-full bg-blue-600 p-8 rounded-[2.5rem] font-black uppercase text-sm tracking-[0.5em] shadow-2xl active:scale-95 transition-all">Publish Mission</button>
           </form>
        </Modal>
      )}

      {showAdmin && (
        <Modal title="Administrator Console" onClose={() => setShowAdmin(false)}>
          <div className="space-y-12">
             {!profile.isAdmin ? (
               <div className="space-y-8 text-center">
                  <p className="text-xs font-black text-red-500 uppercase tracking-[0.3em]">Restricted Territory. Identity Verification Required.</p>
                  <input type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)} className="w-full bg-slate-900 border border-slate-800 p-6 rounded-3xl outline-none text-center font-mono text-xl" placeholder="SYSTEM_KEY" />
                  <button onClick={() => { if(adminKey === "SYSTEM_ADMIN_2025") updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), { isAdmin: true }); }} className="w-full bg-red-600 p-6 rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">Unlock Overide</button>
               </div>
             ) : (
               <div className="space-y-12 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  <div className="space-y-6">
                     <h4 className="text-[11px] font-black text-emerald-500 uppercase flex items-center gap-3 font-mono tracking-widest"><Map size={24}/> Deploy Global Gate (DPP)</h4>
                     <form onSubmit={async (e) => { 
                       e.preventDefault(); 
                       const fd = new FormData(e.target);
                       await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'dpps'), {
                         title: fd.get('t'), url: fd.get('u'), description: fd.get('d'), rank: fd.get('r'), stat: fd.get('s'), xp: parseInt(fd.get('xp')), gold: parseInt(fd.get('g')), ts: Date.now()
                       });
                       triggerNotif("Global Gate Deployed", "success");
                     }} className="space-y-3">
                        <input name="t" placeholder="DPP TITLE..." className="w-full bg-slate-900 p-5 rounded-2xl border border-slate-800 text-sm font-bold" required />
                        <input name="u" placeholder="PDF/DRIVE URL..." className="w-full bg-slate-900 p-5 rounded-2xl border border-slate-800 text-sm font-mono" required />
                        <textarea name="d" placeholder="Description..." className="w-full bg-slate-900 p-5 rounded-2xl border border-slate-800 text-xs h-24" />
                        <div className="grid grid-cols-2 gap-3">
                           <input name="xp" type="number" placeholder="XP" className="bg-slate-900 p-4 rounded-xl border border-slate-800 text-xs" required />
                           <input name="g" type="number" placeholder="GOLD" className="bg-slate-900 p-4 rounded-xl border border-slate-800 text-xs" required />
                        </div>
                        <button className="w-full bg-emerald-600 py-5 rounded-3xl text-[11px] font-black uppercase tracking-[0.4em] shadow-xl">Broadcast Global Gate</button>
                     </form>
                  </div>
                  <div className="space-y-6">
                     <h4 className="text-[11px] font-black text-red-500 uppercase flex items-center gap-3 font-mono tracking-widest"><Flame size={24}/> Spawn Raid Boss</h4>
                     <form onSubmit={e => { e.preventDefault(); setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'world_boss', 'active'), { name: e.target.n.value, hp: parseInt(e.target.h.value), maxHp: parseInt(e.target.h.value), active: true }); triggerNotif("Boss Manifested", "success"); }} className="grid grid-cols-2 gap-4">
                        <input name="n" placeholder="NAME..." className="bg-slate-900 p-5 rounded-xl border border-slate-800 text-sm" />
                        <input name="h" placeholder="HP..." type="number" className="bg-slate-900 p-5 rounded-xl border border-slate-800 text-sm" />
                        <button className="col-span-2 bg-red-600 py-5 rounded-3xl text-[11px] font-black uppercase tracking-[0.3em] shadow-xl">Deploy World Raid</button>
                     </form>
                  </div>
               </div>
             )}
          </div>
        </Modal>
      )}

      {backlash && (
        <div className="fixed inset-0 z-[1000] bg-red-950/98 backdrop-blur-[60px] flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-500">
           <AlertTriangle size={150} className="text-red-500 animate-bounce mb-12" />
           <h2 className="text-8xl font-black text-white italic uppercase tracking-tighter mb-6 underline decoration-red-600 decoration-[12px] underline-offset-[16px] leading-none">Mana Backlash</h2>
           <p className="text-slate-200 max-w-xl font-mono text-xl leading-relaxed mb-16 tracking-widest uppercase italic font-bold">System detected interference. Mana stability lost. HP penalty applied to spirit core.</p>
           <button onClick={() => setBacklash(false)} className="bg-white text-black px-24 py-8 rounded-[3rem] font-black uppercase text-2xl shadow-[0_0_80px_rgba(255,255,255,0.4)] hover:scale-105 transition-all active:scale-95">Acknowledge</button>
        </div>
      )}

      {notif && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[1100] px-14 py-6 rounded-full border-2 shadow-[0_0_100px_rgba(0,0,0,1)] animate-bounce flex items-center gap-6 ${notif.type === 'error' ? 'bg-red-500/10 border-red-500 text-red-500 shadow-red-900/40' : 'bg-blue-600/10 border-blue-500 text-blue-400 shadow-blue-900/40'}`}>
          <span className="text-3xl font-black">{notif.type==='error'?'!':'✓'}</span>
          <span className="text-xs font-black uppercase tracking-[0.4em] italic leading-none">{notif.msg}</span>
        </div>
      )}
    </div>
  );
}

// --- SUB-COMPONENTS ---
const Bar = ({ label, val, max, color }) => (
  <div className="w-full">
    <div className="flex justify-between text-[11px] font-black mb-2 opacity-80 uppercase tracking-[0.4em] px-2 font-mono leading-none text-slate-500"><span>{label}</span><span>{val}/{max}</span></div>
    <div className="h-3 bg-black rounded-full border border-white/5 overflow-hidden shadow-inner p-0.5">
      <div className={`h-full ${color} transition-all duration-1000 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.1)]`} style={{ width: `${Math.min((val/max)*100, 100)}%` }} />
    </div>
  </div>
);

const StatBox = ({ label, val, color }) => (
  <div className="bg-slate-900/50 p-4 rounded-3xl border border-slate-800 text-center flex-1 shadow-2xl">
    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 leading-none">{label}</p>
    <p className={`text-lg font-black ${color} tracking-tighter uppercase leading-none`}>{val}</p>
  </div>
);

const StatWidget = ({ label, val, color }) => (
  <div className="bg-slate-900/50 p-4 rounded-3xl border border-slate-800 text-center flex-1 shadow-2xl">
    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 leading-none">{label}</p>
    <p className={`text-lg font-black ${color} tracking-tighter uppercase leading-none`}>{val}</p>
  </div>
);

const QuestCard = ({ quest, onAction }) => (
  <div className="bg-slate-900/50 border border-slate-800/80 p-8 rounded-[3.5rem] flex items-center justify-between group hover:border-blue-500/50 transition-all shadow-2xl relative overflow-hidden">
    <div className="flex items-center gap-10 relative z-10">
      <div className={`w-16 h-16 rounded-3xl bg-slate-900 flex items-center justify-center font-black text-xl border-2 border-blue-900/50 text-blue-500 shadow-xl uppercase`}>{quest.rank}</div>
      <div>
        <h4 className="font-bold text-2xl text-slate-100 tracking-tight leading-none uppercase font-serif">{quest.text}</h4>
        <div className="flex gap-10 text-[11px] font-black uppercase text-slate-500 mt-3 tracking-[0.2em]">
          <span className="text-blue-400">+{quest.xp} XP</span>
          <span className="text-yellow-500">+{quest.gold}G</span>
          <span className="opacity-60 capitalize font-mono">{quest.stat}</span>
        </div>
      </div>
    </div>
    <button onClick={onAction} className="p-6 bg-blue-500/10 text-blue-500 rounded-[2.5rem] hover:bg-blue-600 hover:text-white transition-all shadow-2xl active:scale-90 relative z-10"><Camera size={40}/></button>
  </div>
);

const Modal = ({ title, children, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/99 backdrop-blur-[40px] animate-in fade-in duration-300">
    <div className="w-full max-w-2xl bg-[#0a0a0a] border border-slate-800 rounded-[4.5rem] overflow-hidden shadow-[0_0_200px_rgba(0,0,0,1)] animate-in zoom-in-95">
      <div className="p-12 border-b border-slate-900 flex justify-between items-center bg-slate-900/30"><h3 className="font-black uppercase tracking-[0.6em] text-[11px] text-slate-500 font-mono leading-none">{title}</h3><button onClick={onClose} className="text-slate-600 hover:text-white transition-all hover:rotate-90"><X size={48}/></button></div>
      <div className="p-14">{children}</div>
    </div>
  </div>
);

const RANK_THEME = (r) => {
  if (r === 'S') return 'border-red-600 text-red-500 bg-red-600/10';
  if (r === 'A') return 'border-orange-500 text-orange-500 bg-orange-500/5';
  if (r === 'B') return 'border-purple-900/30 text-purple-500 bg-purple-500/5';
  return 'border-slate-800 text-slate-500 bg-slate-900/50';
};

