// === Aventurier de Mirval — game.js v10 (SVG intégrés) ===
console.log("game.js v10 (SVG) chargé");

// === Réveil écran mobile ===
let wakeLock;
async function keepAwake(){ try{ wakeLock = await navigator.wakeLock.request('screen'); } catch(e){} }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && 'wakeLock' in navigator) keepAwake(); });
if('wakeLock' in navigator) keepAwake();

// === RNG ===
const rng = (() => {
  const seed = (crypto.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]^Date.now():Date.now())>>>0;
  let s = seed>>>0;
  function rand(){ s ^= s<<13; s>>>=0; s ^= s>>17; s>>>=0; s ^= s<<5; s>>>=0; return (s>>>0)/0xFFFFFFFF; }
  function between(min,max){ return Math.floor(rand()*(max-min+1))+min; }
  return {rand, between, seed};
})();
document.getElementById('seedInfo').textContent = `seed ${rng.seed}`;

// === Références UI ===
const ui = {
  log: document.getElementById('log'),
  choices: document.getElementById('choices'),
  hp: document.getElementById('hp'),
  hpmax: document.getElementById('hpmax'),
  hpbar: document.getElementById('hpbar'),
  gold: document.getElementById('gold'),
  lvl: document.getElementById('lvl'),
  xp: document.getElementById('xp'),
  inv: document.getElementById('inventory'),
  loc: document.getElementById('location'),
  day: document.getElementById('day'),
  lastRoll: document.getElementById('lastRoll'),
  status: document.getElementById('status'),
  pclass: document.getElementById('p-class'),
  pname: document.getElementById('p-name'),
  astr: document.getElementById('a-str'),
  aagi: document.getElementById('a-agi'),
  awis: document.getElementById('a-wis'),
  rep: document.getElementById('rep'),
  repLabel: document.getElementById('rep-label'),
  quests: document.getElementById('quests'),
};

// === Outils UI ===
function write(text, cls=""){ 
  const p=document.createElement('p'); 
  if(cls) p.classList.add(cls); 
  p.innerHTML=text; 
  ui.log.appendChild(p); 
  ui.log.scrollTop=ui.log.scrollHeight; 
}
function clearChoices(){ ui.choices.innerHTML=""; }
function addChoice(label, handler, primary=false){ 
  const btn=document.createElement('button'); 
  if(primary) btn.classList.add('btn-primary'); 
  btn.textContent = label; 
  btn.onclick = handler; 
  ui.choices.appendChild(btn); 
}

// === VISUELS SVG ===
function addScene(key){
  const div = document.createElement("div");
  div.className = "scene";
  div.innerHTML = scenes[key] || scenes["default"];
  ui.log.appendChild(div);
  ui.log.scrollTop = ui.log.scrollHeight;
}

const scenes = {
  bandit: `<svg viewBox="0 0 100 100" width="300"><circle cx="50" cy="30" r="10" fill="#444"/><rect x="40" y="40" width="20" height="35" fill="#666"/><line x1="50" y1="40" x2="70" y2="60" stroke="#c33" stroke-width="5"/></svg>`,
  loup: `<svg viewBox="0 0 120 80" width="300"><ellipse cx="60" cy="50" rx="40" ry="20" fill="#555"/><circle cx="30" cy="45" r="12" fill="#444"/><polygon points="20,30 30,10 40,30" fill="#333"/></svg>`,
  goule: `<svg viewBox="0 0 100 100" width="300"><circle cx="50" cy="30" r="12" fill="#222"/><rect x="40" y="45" width="20" height="30" fill="#555"/><line x1="30" y1="70" x2="70" y2="70" stroke="#933" stroke-width="6"/></svg>`,
  harpie: `<svg viewBox="0 0 120 80" width="300"><polygon points="20,60 60,20 100,60" fill="#555"/><line x1="40" y1="40" x2="20" y2="20" stroke="#ccc" stroke-width="4"/><line x1="80" y1="40" x2="100" y2="20" stroke="#ccc" stroke-width="4"/></svg>`,
  sanctuaire: `<svg viewBox="0 0 120 100" width="300"><rect x="20" y="40" width="80" height="50" fill="#777"/><polygon points="20,40 60,10 100,40" fill="#555"/><rect x="50" y="60" width="20" height="30" fill="#333"/></svg>`,
  grotte: `<svg viewBox="0 0 120 80" width="300"><rect x="10" y="30" width="100" height="50" fill="#444"/><ellipse cx="60" cy="55" rx="30" ry="20" fill="#222"/></svg>`,
  boss: `<svg viewBox="0 0 120 100" width="300"><rect x="40" y="30" width="40" height="50" fill="#800"/><circle cx="60" cy="20" r="12" fill="#400"/><line x1="60" y1="80" x2="60" y2="95" stroke="#600" stroke-width="6"/></svg>`,
  default: `<svg viewBox="0 0 100 60" width="300"><rect x="0" y="40" width="100" height="20" fill="#555"/><circle cx="20" cy="20" r="8" fill="#ccc"/><circle cx="80" cy="15" r="12" fill="#ddd"/></svg>`
};

// === Stats, dés, heal, dégâts etc. ===
// (identique à la version précédente v10, pas changé)

// === Sauvegarde retirée ===
function save(){ write("Sauvegarde désactivée.","warn"); }
function load(){ write("Chargement désactivé.","warn"); return null; }
function reset(){ state = initialState(); ui.log.innerHTML=""; setup(true); write("Nouvelle aventure !","sys"); }
document.getElementById('btn-save').onclick=save;
document.getElementById('btn-load').onclick=()=>{ load(); };
document.getElementById('btn-reset').onclick=reset;

// === Combat ===
function combat(mon){
  clearChoices(); 
  state.inCombat=true; 
  state.enemy=JSON.parse(JSON.stringify(mon));
  write(`<b>${mon.name}</b> apparaît ! ❤️ ${mon.hp} — CA ${mon.ac}`,"warn");

  // visuels
  if(mon.name.includes("Bandit")) addScene("bandit");
  if(mon.name.includes("Loup")) addScene("loup");
  if(mon.name.includes("Harpie")) addScene("harpie");
  if(mon.name.includes("Goule")) addScene("goule");
  if(mon.name.includes("Chef")) addScene("boss");

  combatTurn();
}

// combatTurn(), enemyAttack(), afterCombat() restent identiques
// mais tu as les visuels grâce à combat()

// === Exploration ===
function explore(initial=false){
  setStats(); ui.loc.textContent = state.location; ui.day.textContent=`Jour ${state.day} — ${state.time}`; clearChoices();
  if(!initial) setTime(); tickStatus(); if(state.hp<=0) return;

  const zone = state.locationKey;
  let pool=[];

  if(zone==='clairiere'){
    pool.push({label:'Croiser une herboriste', act:()=>{eventHerbalist(); addScene("default");}, w:2});
    pool.push({label:'Bandits embusqués', act:()=>{combat(mobTemplates.bandit());}, w:2});
  }
  if(zone==='marais'){
    pool.push({label:'Sanctuaire ancien', act:()=>{eventSanctuary(); addScene("sanctuaire");}, w:2});
    pool.push({label:'Affronter un loup', act:()=>{combat(mobTemplates.wolf());}, w:2});
  }
  if(zone==='colline'){
    pool.push({label:'Rencontrer un ermite', act:()=>{eventHermit(); addScene("default");}, w:1});
    pool.push({label:'Affronter une harpie', act:()=>{combat(mobTemplates.harpy());}, w:2});
  }
  if(zone==='grotte'){
    pool.push({label:'Explorer la grotte', act:()=>{write("La grotte s’ouvre devant toi…"); addScene("grotte"); combat(mobTemplates.ghoul());}, w:2});
  }

  // navigation et choix de base (fouiller, repos, etc.)
  const base=[{label:"Fouiller",act:searchArea,w:2},{label:"Se reposer",act:rest,w:1}];
  const nav=[{label:'→ Clairière',act:()=>gotoZone('clairiere'),w:1},
             {label:'→ Marais',act:()=>gotoZone('marais'),w:1},
             {label:'→ Colline',act:()=>gotoZone('colline'),w:1},
             {label:'→ Grotte',act:()=>gotoZone('grotte'),w:1}];

  const all=[...base,...pool,...nav];
  const dyn=pickWeighted(all,4);
  dyn.forEach((c,i)=>addChoice(c.label,c.act,i===0));
}

// === PNJ & Events ===
function eventSanctuary(){ write("⛪ Un ancien sanctuaire se dévoile."); addScene("sanctuaire"); clearChoices(); addChoice("Prier", ()=>{ heal(rng.between(6,12)); continueBtn(); }, true); addChoice("Partir", continueBtn); }
function eventHerbalist(){ write("🌿 Une herboriste t'accueille."); addScene("default"); continueBtn(); }
function eventHermit(){ write("🧙 Un ermite étrange apparaît."); addScene("default"); continueBtn(); }

// === Bestiaire ===
const mobTemplates = {
  wolf: ()=>({ name:"Loup affamé", hp:10, maxHp:10, ac:11, hitMod:2, tier:1 }),
  bandit: ()=>({ name:"Bandit des fourrés", hp:12, maxHp:12, ac:12, hitMod:3, tier:2 }),
  harpy: ()=>({ name:"Harpie du vent", hp:14, maxHp:14, ac:13, hitMod:4, tier:2 }),
  ghoul: ()=>({ name:"Goule des roseaux", hp:13, maxHp:13, ac:12, hitMod:3, tier:2 }),
  chief: ()=>({ name:"Chef Bandit", hp:24, maxHp:24, ac:14, hitMod:5, tier:3 })
};

// === Classes, Fin, Setup, GameOver ===
// inchangé de la v10, toujours présent

// === Boot DOM ===
(function boot(){
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=>setup(true), { once:true });
  } else {
    setup(true);
  }
})();
