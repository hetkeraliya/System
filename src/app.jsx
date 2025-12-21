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
  AlertTriangle, Clock, Map, BookOpen, Download, Cpu
} from 'lucide-react';

// --- REPLACE THESE WITH YOUR ACTUAL FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const GEMINI_API_KEY = "YOUR_GEMINI_KEY"; 
const APP_ID = "shadow-monarch-production";

// Safe Initialization
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

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

  // Sync States
  const [leaderboard, setLeaderboard] = useState([]);
  const [globalFeed, setGlobalFeed] = useState([]);
  const [worldBoss, setWorldBoss] = useState(null);
  const [gates, setGates] = useState([]);
  const [shop, setShop] = useState([]);
  const [quests, setQuests] = useState([]);
  const [shadowArmy, setShadowArmy] = useState([]);

  // UI Flow
  const [activeTab, setActiveTab] = useState('quests');
  const [notif, setNotif] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  
  // Pomodoro & AI
  const [isFocusing, setIsFocusing] = useState(false);
  const [timerSec, setTimerSec] = useState(1500);
  const [accruedXp, setAccruedXp] = useState(0);
  const [backlash, setBacklash] = useState(false);
  const [verifying, setVerifying] = useState(null); 
  const [aiWorking, setAiWorking] = useState(false);
  const [ariseObj, setAriseObj] = useState(null);
  const fileRef = useRef(null);

  // 1. BOOTLOADER
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) await signInAnonymously(auth);
      setUser(auth.currentUser);
      setBootState('SYNC');
    });
  }, []);

  // 2. DATA GRID
  useEffect(() => {
    if (!user) return;
    const pPath = (c) => collection(db, 'artifacts', APP_ID, 'public', 'data', c);
    const uPath = (c) => collection(db, 'artifacts', APP_ID, 'users', user.uid, c);

    const unsubs = [
      onSnapshot(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), s => {
        setProfile(s.exists() ? s.data() : null);
        setBootState('READY');
      }),
      onSnapshot(uPath('quests'), s => setQuests(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(uPath('shadows'), s => setShadowArmy(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(pPath('dpps'), s => setGates(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(pPath('shop'), s => setShop(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'world_boss', 'active'), s => setWorldBoss(s.exists() ? s.data() : null)),
      onSnapshot(pPath('leaderboard'), s => setLeaderboard(s.docs.map(d => d.data()).sort((a,b) => b.level - a.level).slice(0, 10))),
      onSnapshot(pPath('feed'), s => setGlobalFeed(s.docs.map(d => d.data()).sort((a,b) => b.ts - a.ts).slice(0, 10)))
    ];
    return () => unsubs.forEach(f => f());
  }, [user]);

  // 3. POMODORO ENGINE
  useEffect(() => {
    let t;
    if (isFocusing && timerSec > 0) {
      t = setInterval(() => {
        setTimerSec(s => s - 1);
        if (timerSec % 60 === 0) setAccruedXp(x => x + 5);
      }, 1000);
    } else if (timerSec === 0 && isFocusing) {
        setIsFocusing(false);
        grantReward(accruedXp + 60, 25, 'willpower');
        setTimerSec(1500); setAccruedXp(0);
    }
    return () => clearInterval(t);
  }, [isFocusing, timerSec]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && isFocusing) {
        setIsFocusing(false); setBacklash(true);
        if (profile) updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), { hp: Math.max(0, (profile.hp || 100) - 10) });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isFocusing, profile]);

  // 4. ACTIONS
  const handleAIVerify = async (file) => {
    if (!file || !verifying) return;
    setAiWorking(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const title = verifying.mode === 'QUEST' ? verifying.obj.text : verifying.obj.title;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: `Task: "${title}". Does image show completion? JSON: {"success":boolean}` }, { inlineData: { mimeType: "image/png", data: base64 } }] }], generationConfig: { responseMimeType: "application/json" } })
        });
        const data = await res.json();
        const json = JSON.parse(data.candidates[0].content.parts[0].text);
        if (json.success) {
          const { obj, mode } = verifying;
          const bonus = (profile.playerClass && CLASSES[profile.playerClass].stat === obj.stat) ? 1.5 : 1.0;
          await grantReward(Math.floor(obj.xp * bonus), obj.gold, obj.stat);
          if (mode === 'QUEST') await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'quests', obj.id), { completed: true });
          if (worldBoss) await dealBossDamage(obj.rank);
          if (obj.rank === 'A' || obj.rank === 'S') setAriseObj(obj);
          triggerNotif("Verified.", "success");
        } else { triggerNotif("Proof Rejected", "error"); }
        setAiWorking(false); setVerifying(null);
      };
    } catch (e) { setAiWorking(false); triggerNotif("AI Error", "error"); }
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

  const triggerNotif = (msg, type) => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 4000);
  };

  if (bootState !== 'READY') return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-4 font-mono text-blue-500">
      <Cpu className="animate-spin" />
      <span className="animate-pulse tracking-[0.5em] text-xs">SYNCHRONIZING...</span>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 space-y-12">
      <h1 className="text-6xl font-black italic text-blue-600">ARISE</h1>
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        {Object.entries(CLASSES).map(([k,v]) => (
          <button key={k} onClick={()=>setActiveTab(k)} className={`p-8 rounded-3xl border-2 transition-all flex flex-col items-center gap-4 ${activeTab === k ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-900/40'}`}>
            <div className={activeTab === k ? 'text-blue-500' : 'text-slate-500'}>{v.icon}</div>
            <span className="text-[10px] font-black uppercase">{v.name}</span>
          </button>
        ))}
      </div>
      <div className="w-full max-w-sm space-y-4">
        <input id="hName" className="w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl text-center outline-none focus:border-blue-500 font-mono" placeholder="HUNTER NAME" />
        <button onClick={() => {
          const n = document.getElementById('hName').value;
          if (n) setDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), { name: n, playerClass: activeTab==='quests'?'WARRIOR':activeTab, level: 1, xp: 0, maxXp: 100, gold: 100, rank: "E", stats: { strength: 1, intelligence: 1, agility: 1, willpower: 1 }, hp: 100 });
        }} className="w-full bg-blue-600 py-5 rounded-2xl font-black uppercase tracking-widest shadow-2xl">Awaken</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-slate-100 font-sans pb-32 overflow-x-hidden">
      <input type="file" ref={fileRef} className="hidden" onChange={(e) => handleAIVerify(e.target.files[0])} />

      {/* WORLD BOSS */}
      {worldBoss && worldBoss.hp > 0 && (
        <div className="bg-red-950/20 border-b border-red-500/20 p-4 sticky top-0 z-[100] backdrop-blur-lg">
           <div className="max-w-4xl mx-auto flex items-center gap-6">
              <Flame className="text-red-500 animate-pulse" />
              <div className="flex-1 space-y-1">
                 <div className="flex justify-between text-[11px] font-black uppercase text-red-500"><span>{worldBoss.name}</span><span>{worldBoss.hp.toLocaleString()} HP</span></div>
                 <div className="h-1.5 bg-black rounded-full overflow-hidden border border-red-500/20">
                    <div className="h-full bg-red-600 transition-all duration-1000" style={{ width: `${(worldBoss.hp/worldBoss.maxHp)*100}%` }} />
                 </div>
              </div>
           </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 pt-8 space-y-8">
        {/* HUD */}
        <header className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/60 rounded-[3rem] p-8 flex flex-col md:flex-row gap-10 items-center shadow-2xl relative">
          <div className="flex items-center gap-8 flex-1">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-slate-800 border-2 border-blue-500/40 flex items-center justify-center">
                <User size={40} className="text-blue-500" />
              </div>
              <span className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-lg border bg-black text-[9px] font-black">{profile.rank}-RANK</span>
            </div>
            <div>
              <h2 className="text-2xl font-black italic text-white uppercase">{profile.name}</h2>
              <div className="flex items-center gap-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                <span className="text-blue-400">{profile.playerClass}</span>
                <span>• LVL {profile.level}</span>
                <span className="text-yellow-500">{profile.gold}G</span>
              </div>
            </div>
          </div>
          <div className="w-full md:w-64 space-y-4">
             <div className="space-y-1">
                <div className="flex justify-between text-[8px] font-black uppercase text-slate-500"><span>EXP</span><span>{profile.xp}/{profile.maxXp}</span></div>
                <div className="h-1 bg-black rounded-full overflow-hidden border border-white/5"><div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${(profile.xp/profile.maxXp)*100}%` }} /></div>
             </div>
             <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-800 text-center"><p className="text-[7px] text-slate-500 uppercase font-black">HP</p><p className="text-xs font-bold text-red-500">{profile.hp || 100}%</p></div>
                <button onClick={()=>setShowAdmin(true)} className="bg-slate-900/50 p-2 rounded-xl border border-slate-800 flex items-center justify-center text-slate-500 hover:text-white transition-colors"><Settings size={14}/></button>
             </div>
          </div>
        </header>

        {/* POMODORO */}
        <section className={`bg-slate-900/40 border-2 rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between gap-8 transition-all ${isFocusing ? 'border-blue-500 shadow-2xl' : 'border-slate-800'}`}>
           <div className="flex items-center gap-6">
              <div className={`p-5 rounded-3xl ${isFocusing ? 'bg-blue-600 text-white animate-spin' : 'bg-slate-800 text-slate-600'}`}><Clock size={32}/></div>
              <div><h3 className="text-[11px] font-black text-blue-500 uppercase tracking-widest mb-1">Mana Meditation</h3><p className="text-4xl font-black font-mono text-white">{Math.floor(timerSec/60)}:{String(timerSec%60).padStart(2,'0')}</p></div>
           </div>
           <button onClick={()=>setIsFocusing(!isFocusing)} className={`px-12 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl transition-all ${isFocusing ? 'bg-red-500/10 border border-red-500 text-red-500' : 'bg-blue-600 text-white shadow-blue-900/30'}`}>{isFocusing ? 'Stop Focus' : 'Start Focus'}</button>
        </section>

        {/* NAVIGATION */}
        <div className="flex gap-2 p-1.5 bg-slate-900/30 border border-slate-800 rounded-2xl overflow-x-auto no-scrollbar shadow-inner">
          {['quests', 'gates', 'ranking', 'shop'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 min-w-[110px] py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === t ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
              {t === 'gates' ? <Map size={12} className="inline mr-2" /> : ''}{t}
            </button>
          ))}
        </div>

        {/* CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <aside className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 space-y-6 shadow-xl">
               <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Brain size={14}/> Attributes</h3>
               {Object.entries(profile.stats || {}).map(([k, v]) => (
                 <div key={k} className="flex justify-between items-center group">
                   <span className="text-[11px] uppercase flex items-center gap-3 text-slate-500">{STAT_ICONS[k]} {k}</span>
                   <span className="text-2xl font-black text-white font-mono">{v}</span>
                 </div>
               ))}
            </div>
          </aside>

          <main className="lg:col-span-8 space-y-4">
            {activeTab === 'quests' && (
              <div className="space-y-4">
                <div className="flex justify-between px-2 items-center font-mono uppercase text-xs font-black text-blue-500">Quests<button onClick={()=>setShowAdd(true)} className="bg-blue-600 p-2 rounded-2xl"><Plus size={18}/></button></div>
                {quests.filter(q => !q.completed).map(q => (
                  <div key={q.id} className="bg-slate-900/50 border border-slate-800/80 p-6 rounded-[2rem] flex items-center justify-between group hover:border-blue-500/50 transition-all shadow-xl">
                    <div className="flex items-center gap-6"><div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center font-black text-sm border border-blue-900/50 text-blue-500">{q.rank}</div><div><h4 className="font-bold text-xl text-slate-100 uppercase">{q.text}</h4><div className="flex gap-6 text-[11px] font-black uppercase text-slate-500 mt-2 tracking-widest"><span>+{q.xp} XP</span><span>+{q.gold}G</span><span>{q.stat}</span></div></div></div>
                    <button onClick={()=> { setVerifying({ obj: q, mode: 'QUEST' }); fileRef.current.click(); }} className="p-4 bg-blue-500/10 text-blue-500 rounded-3xl hover:bg-blue-600 hover:text-white transition-all shadow-2xl active:scale-90"><Camera size={28}/></button>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'gates' && (
              <div className="space-y-6">
                 {gates.map(g => (
                   <div key={g.id} className="bg-slate-900 border-2 border-emerald-900/30 p-8 rounded-[3rem] space-y-6 relative overflow-hidden group hover:border-emerald-500 transition-all shadow-2xl">
                      <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><BookOpen size={100}/></div>
                      <div className="space-y-1"><span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{g.rank}-RANK GATE</span><h4 className="text-3xl font-black italic tracking-tighter text-white uppercase">{g.title}</h4><p className="text-slate-500 text-xs italic font-bold leading-relaxed">{g.description}</p></div>
                      <div className="flex gap-4"><a href={g.url} target="_blank" className="flex-1 bg-white text-black py-4 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 hover:scale-[1.02] transition-all"><Download size={18}/> Download DPP</a><button onClick={()=>{ setVerifying({ obj: g, mode: 'GATE' }); fileRef.current.click(); }} className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 shadow-xl"><Camera size={18}/> Verify Ritual</button></div>
                   </div>
                 ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* OVERLAYS */}
      {aiWorking && <div className="fixed inset-0 z-[500] bg-black/98 backdrop-blur-3xl flex flex-col items-center justify-center space-y-12 animate-in fade-in duration-500"><Loader2 className="text-blue-500 animate-spin" size={100} /><p className="text-4xl font-black italic text-blue-400 tracking-tighter uppercase animate-pulse">Syncing solution artifacts...</p></div>}
      {ariseObj && <div className="fixed inset-0 z-[600] bg-black/99 flex flex-col items-center justify-center space-y-16 p-12 animate-in zoom-in-95 duration-1000"><Ghost className="text-indigo-500 animate-pulse" size={250} /><h2 className="text-8xl font-black italic text-white tracking-tighter text-center uppercase underline decoration-indigo-600 decoration-8">ARISE</h2><button onClick={async () => { const name = ["Igris", "Tank", "Beru", "Iron"][Math.floor(Math.random()*4)] + " Shadow"; await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'shadows'), { name, stat: ariseObj.stat, ts: Date.now() }); setAriseObj(null); triggerNotif(`${name} added to army.`, "success"); }} className="px-32 py-10 bg-indigo-600 text-white font-black text-6xl italic rounded-full shadow-[0_0_120px_rgba(79,70,229,0.8)] active:scale-95">ARISE.</button><button onClick={() => setAriseObj(null)} className="text-slate-600 uppercase font-black text-xs tracking-[1em] hover:text-white transition-colors">Ignore</button></div>}

      {showAdd && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/99 backdrop-blur-3xl animate-in fade-in duration-300"><div className="w-full max-w-2xl bg-[#0a0a0a] border border-slate-800 rounded-[4rem] overflow-hidden shadow-2xl p-12 animate-in zoom-in-95"><div className="flex justify-between items-center mb-8"><h3 className="font-black uppercase tracking-widest text-xs text-slate-500">Deploy Mission</h3><button onClick={()=>setShowAdd(false)} className="text-slate-600"><X size={32}/></button></div>
        <form onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.target); await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'quests'), { text: fd.get('text'), rank: fd.get('rank'), stat: fd.get('stat'), xp: 150, gold: 30, completed: false, createdAt: Date.now() }); setShowAdd(false); }} className="space-y-8"><input name="text" placeholder="OBJECTIVE..." className="w-full bg-slate-900 border border-slate-800 p-8 rounded-[2rem] outline-none text-xl font-mono focus:border-blue-500 shadow-inner" required /><div className="grid grid-cols-2 gap-6"><select name="rank" className="bg-slate-900 p-6 rounded-2xl border border-slate-800 text-xs font-black uppercase">{RANKS.map(r => <option key={r} value={r}>{r}</option>)}</select><select name="stat" className="bg-slate-900 p-6 rounded-2xl border border-slate-800 text-xs font-black uppercase">{Object.keys(profile.stats || {}).map(s => <option key={s} value={s}>{s}</option>)}</select></div><button className="w-full bg-blue-600 p-8 rounded-[2.5rem] font-black uppercase text-sm tracking-widest shadow-2xl">Publish</button></form></div></div>
      )}

      {showAdmin && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/99 backdrop-blur-3xl animate-in fade-in duration-300"><div className="w-full max-w-2xl bg-[#0a0a0a] border border-slate-800 rounded-[4rem] overflow-hidden shadow-2xl p-12 animate-in zoom-in-95"><div className="flex justify-between items-center mb-8"><h3 className="font-black uppercase tracking-widest text-xs text-slate-500">Admin Control Node</h3><button onClick={()=>setShowAdmin(false)} className="text-slate-600"><X size={32}/></button></div>
        <div className="space-y-8">{!profile.isAdmin ? <div className="space-y-8 text-center"><p className="text-xs font-black text-red-500 uppercase tracking-widest">Restricted Territory.</p><input type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)} className="w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl outline-none text-center font-mono text-xl" placeholder="SYSTEM_KEY" /><button onClick={() => { if(adminKey === "SYSTEM_ADMIN_2025") updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), { isAdmin: true }); }} className="w-full bg-red-600 p-5 rounded-2xl font-black uppercase text-xs tracking-widest">Unlock Admin</button></div> : <div className="space-y-12 max-h-[500px] overflow-y-auto pr-2"><div className="space-y-6"><h4 className="text-[11px] font-black text-emerald-500 uppercase flex items-center gap-3 font-mono tracking-widest"><Map size={24}/> Deploy Global Gate (DPP)</h4><form onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.target); await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'dpps'), { title: fd.get('t'), url: fd.get('u'), description: fd.get('d'), rank: "A", stat: "intelligence", xp: 500, gold: 100, ts: Date.now() }); triggerNotif("Gate Manifested", "success"); }} className="space-y-3"><input name="t" placeholder="DPP TITLE..." className="w-full bg-slate-900 p-5 rounded-2xl border border-slate-800 text-sm font-bold" required /><input name="u" placeholder="PDF/DRIVE URL..." className="w-full bg-slate-900 p-5 rounded-2xl border border-slate-800 text-sm font-mono" required /><textarea name="d" placeholder="Description..." className="w-full bg-slate-900 p-5 rounded-2xl border border-slate-800 text-xs h-24" /><button className="w-full bg-emerald-600 py-5 rounded-3xl text-[11px] font-black uppercase tracking-[0.4em] shadow-xl">Deploy Gate</button></form></div></div>}</div></div></div>
      )}

      {backlash && <div className="fixed inset-0 z-[1000] bg-red-950/98 backdrop-blur-3xl flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-500"><AlertTriangle size={150} className="text-red-500 animate-bounce mb-12" /><h2 className="text-8xl font-black text-white italic uppercase tracking-tighter mb-6 underline decoration-red-600 decoration-8 font-serif leading-none">Mana Backlash</h2><p className="text-slate-200 max-w-xl font-mono text-xl leading-relaxed mb-16 tracking-widest uppercase italic font-bold">Grid interference detected. Mana stability broken. HP penalty applied to core.</p><button onClick={() => setBacklash(false)} className="bg-white text-black px-24 py-8 rounded-[3rem] font-black uppercase text-2xl shadow-2xl hover:scale-105 transition-all">Acknowledge</button></div>}
      {notif && <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[1100] px-14 py-6 rounded-full border-2 shadow-[0_0_100px_rgba(0,0,0,1)] animate-bounce flex items-center gap-6 ${notif.type === 'error' ? 'bg-red-500/10 border-red-500 text-red-500 shadow-red-900/40' : 'bg-blue-600/10 border-blue-500 text-blue-400 shadow-blue-900/40'}`}><span className="text-3xl font-black">{notif.type==='error'?'!':'✓'}</span><span className="text-xs font-black uppercase tracking-[0.4em] italic leading-none">{notif.msg}</span></div>}
    </div>
  );
}

// --- SUB-COMPONENTS ---
const StatWidget = ({ label, val, color }) => (
  <div className="bg-slate-900/50 p-5 rounded-3xl border border-slate-800 text-center flex-1 shadow-2xl">
    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 leading-none">{label}</p>
    <p className={`text-lg font-black ${color} tracking-tighter uppercase leading-none`}>{val}</p>
  </div>
);

const QuestCard = ({ quest, onAction }) => (
  <div className="bg-slate-900/50 border border-slate-800/80 p-8 rounded-[3.5rem] flex items-center justify-between group hover:border-blue-500/50 transition-all shadow-2xl relative overflow-hidden">
    <div className="flex items-center gap-10 relative z-10">
      <div className="w-16 h-16 rounded-3xl bg-slate-900 flex items-center justify-center font-black text-xl border-2 border-blue-900/50 text-blue-500 shadow-xl">{quest.rank}</div>
      <div><h4 className="font-bold text-2xl text-slate-100 tracking-tight leading-none uppercase font-serif">{quest.text}</h4><div className="flex gap-10 text-[11px] font-black uppercase text-slate-500 mt-3 tracking-[0.2em]"><span className="text-blue-400">+{quest.xp} XP</span><span className="text-yellow-500">+{quest.gold}G</span><span className="opacity-60 capitalize font-mono">{quest.stat}</span></div></div>
    </div>
    <button onClick={onAction} className="p-6 bg-blue-500/10 text-blue-500 rounded-[2.5rem] hover:bg-blue-600 hover:text-white transition-all shadow-2xl active:scale-90 relative z-10"><Camera size={40}/></button>
  </div>
);

const RANK_THEME = (r) => {
  if (r === 'S') return 'border-red-600 text-red-500 bg-red-600/10';
  if (r === 'A') return 'border-orange-500 text-orange-500 bg-orange-500/5';
  if (r === 'B') return 'border-purple-900/30 text-purple-500 bg-purple-500/5';
  return 'border-slate-800 text-slate-500 bg-slate-900/50';
};

