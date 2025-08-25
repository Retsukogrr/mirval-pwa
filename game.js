// === Aventurier de Mirval — game.js v10 ===
console.log("game.js v10 chargé");

// ====================
// Variables & État
// ====================
let state;

function initialState(){
  return {
    name: "Eldarion",
    cls: "—",
    hasChosenClass: false,
    attrs: { STR:1, AGI:1, WIS:1 },
    hp: 20, hpMax: 20,
    gold: 10, level: 1, xp: 0, rep: 0,
    day: 1, time: "Aube",
    location: "Lisière de la forêt de Mirval",
    locationKey: "clairiere",
    inventory: [{name:"Vieille épée",desc:"+1 attaque"},{name:"Petite armure",desc:"+1 armure"}],
    potions: 1, status: [],
    flags: { fragments:0, bossUnlocked:false, torch:false },
    quests: { main:{title:"Le Chef Bandit",state:"En cours"}, side:[], artifacts:{title:"Fragments d’artefact (0/3)",state:"En cours"} },
    achievements: {},
    inCombat: false, enemy:null,
    skill: { name:"", cooldown:0, cd:0, desc:"", use:()=>{} }
  };
}

// ====================
// UI
// ====================
const ui = {};
function bindUI(){
  ui.log=document.getElementById('log');
  ui.choices=document.getElementById('choices');
  ui.hp=document.getElementById('hp');
  ui.hpmax=document.getElementById('hpmax');
  ui.hpbar=document.getElementById('hpbar');
  ui.gold=document.getElementById('gold');
  ui.lvl=document.getElementById('lvl');
  ui.xp=document.getElementById('xp');
  ui.inv=document.getElementById('inventory');
  ui.loc=document.getElementById('location');
  ui.day=document.getElementById('day');
  ui.lastRoll=document.getElementById('lastRoll');
  ui.status=document.getElementById('status');
  ui.pclass=document.getElementById('p-class');
  ui.pname=document.getElementById('p-name');
  ui.astr=document.getElementById('a-str');
  ui.aagi=document.getElementById('a-agi');
  ui.awis=document.getElementById('a-wis');
  ui.rep=document.getElementById('rep');
  ui.repLabel=document.getElementById('rep-label');
  ui.quests=document.getElementById('quests');
}

function write(text,cls=""){const p=document.createElement('p');if(cls)p.classList.add(cls);p.innerHTML=text;ui.log.appendChild(p);ui.log.scrollTop=ui.log.scrollHeight;}
function clearChoices(){ui.choices.innerHTML="";}
function addChoice(label,fn,primary=false){const b=document.createElement('button');if(primary)b.classList.add('btn-primary');b.textContent=label;b.onclick=fn;ui.choices.appendChild(b);}

// ====================
// Stats
// ====================
function setStats(){
  ui.hp.textContent=state.hp;
  ui.hpmax.textContent=state.hpMax;
  ui.hpbar.style.width=Math.max(0,Math.min(100,Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent=state.gold;
  ui.lvl.textContent=state.level;
  ui.xp.textContent=state.xp;
  ui.status.textContent=state.status.length? state.status.map(s=>s.name).join(', '):"—";
  ui.pclass.textContent=state.cls;
  ui.pname.textContent=state.name;
  ui.astr.textContent=state.attrs.STR;
  ui.aagi.textContent=state.attrs.AGI;
  ui.awis.textContent=state.attrs.WIS;
  ui.rep.textContent=state.rep;
  ui.repLabel.textContent=repText(state.rep);
  ui.inv.innerHTML="";
  state.inventory.forEach(it=>{const d=document.createElement('div');d.className='stat';d.innerHTML=`<b>${it.name}</b><span>${it.desc}</span>`;ui.inv.appendChild(d);});
}

// ====================
// Dés & utils
// ====================
function d20(mod=0){const r=Math.floor(Math.random()*20)+1;const t=r+mod;ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${r} = ${t}`;return{roll:r,total:t};}
function heal(n){state.hp=Math.min(state.hpMax,state.hp+n);setStats();write(`+${n} PV`,"good");}
function damage(n,src=""){state.hp=Math.max(0,state.hp-n);setStats();write(`-${n} PV ${src?`(${src})`:''}`,"bad");if(state.hp<=0)gameOver();}
function changeGold(n){state.gold=Math.max(0,state.gold+n);setStats();write(`Or ${n>=0?'+':''}${n} (total: ${state.gold})`,n>=0?"good":"warn");}
function gainXP(n){state.xp+=n;write(`XP +${n}`,"info");const need=20+(state.level-1)*15;if(state.xp>=need){state.level++;state.xp=0;state.hpMax+=5;state.hp=state.hpMax;write(`<b>Niveau ${state.level} !</b>`,"good");}setStats();}
function addItem(name,desc){state.inventory.push({name,desc});setStats();write(`Tu obtiens <b>${name}</b>`,"good");}
function hasItem(name){return state.inventory.some(i=>i.name===name);}
function removeItem(name){const i=state.inventory.findIndex(x=>x.name===name);if(i>=0)state.inventory.splice(i,1);setStats();}
function repText(n){return n>=30?'Vertueux':n<=-30?'Sombre':'Neutre';}

// ====================
// Classes
// ====================
function chooseClass(){
  clearChoices();
  write("Choisis ta classe :","info");
  function pick(nom,key,val,skill){
    state.cls=nom;
    if(key) state.attrs[key]=val;
    state.skill=skill;
    state.hasChosenClass=true;
    setStats();
    startAdventure();
  }
  addChoice("🛡️ Guerrier",()=>pick("Guerrier","STR",3,{name:"Frappe vaillante",cooldown:3,cd:0,desc:"Attaque puissante",use:(e)=>{const dmg=d20(2).total; e.hp-=dmg; write(`💥 Frappe vaillante : -${dmg} PV`,"good");}}),true);
  addChoice("🗡️ Voleur",()=>pick("Voleur","AGI",3,{name:"Coup de l’ombre",cooldown:3,cd:0,desc:"Jet +4, dégâts + vol",use:(e)=>{const r=d20(4).total;if(r>=e.ac){const dmg=Math.floor(Math.random()*6)+4;e.hp-=dmg;write(`🗡️ L’ombre frappe : -${dmg} PV`,"good");}else write("Tu rates.","warn");}}));
  addChoice("⚕️ Paladin",()=>pick("Paladin","WIS",2,{name:"Lumière",cooldown:3,cd:0,desc:"Soigne",use:()=>{heal(Math.floor(Math.random()*6)+6);}}));
  addChoice("🏹 Rôdeur",()=>pick("Rôdeur","AGI",3,{name:"Tir précis",cooldown:2,cd:0,desc:"Jet +6, 1d8 dégâts",use:(e)=>{const r=d20(6).total;if(r>=e.ac){const dmg=Math.floor(Math.random()*8)+1;e.hp-=dmg;write(`🏹 Tir précis : -${dmg} PV`,"good");}else write("Tir manqué.","warn");}}));
  addChoice("🔮 Mystique",()=>pick("Mystique","WIS",3,{name:"Onde arcanique",cooldown:3,cd:0,desc:"1d8 & vulnérabilité",use:(e)=>{const dmg=Math.floor(Math.random()*8)+1;e.hp-=dmg;write(`🔮 Onde arcanique : -${dmg} PV`,"good");}}));
}

// ====================
// Démarrage & Boot
// ====================
function setup(isNew=false){
  setStats();
  if(ui.loc) ui.loc.textContent=state.location;
  if(ui.day) ui.day.textContent=`Jour ${state.day} — ${state.time}`;
  clearChoices();
  const classes=["Guerrier","Voleur","Paladin","Rôdeur","Mystique"];
  const needsClass=!state.hasChosenClass||!state.cls||state.cls==="—"||!classes.includes(state.cls);
  if(isNew||ui.log.childElementCount===0||needsClass){write("v10 — Démarrage. Choisis ta classe.","sys");chooseClass();return;}
  explore(true);
}

function startAdventure(){ui.log.innerHTML="";write("L'aventure commence !","info");setStats();explore(true);}
function gameOver(){write("<b>☠️ Tu t'effondres…</b>","bad");clearChoices();addChoice("Recommencer",()=>{state=initialState();setup(true);},true);}

// watchdog anti-bug
setInterval(()=>{if(!state.hasChosenClass&&ui.choices.childElementCount===0)chooseClass();},800);

// Boot
(function boot(){
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{bindUI();state=initialState();state.hasChosenClass=false;setup(true);},{once:true});
  } else {
    bindUI();state=initialState();state.hasChosenClass=false;setup(true);
  }
})();
