// === Aventurier de Mirval — game.js (v10 HUB & Mini-Boss, rencontres réactives) ===
console.log("game.js v10 chargé");

// === Garder l’écran éveillé (QoL mobile) ===
let wakeLock;
async function keepAwake(){ try{ wakeLock = await navigator.wakeLock.request('screen'); } catch(e){} }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && 'wakeLock' in navigator) keepAwake(); });
if('wakeLock' in navigator) keepAwake();

// === RNG avec graine (xorshift) ===
const rng = (() => {
  const seed = (crypto.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]^Date.now():Date.now())>>>0;
  let s = seed>>>0;
  function rand(){ s ^= s<<13; s>>>=0; s ^= s>>17; s>>>=0; s ^= s<<5; s>>>=0; return (s>>>0)/0xFFFFFFFF; }
  function between(min,max){ return Math.floor(rand()*(max-min+1))+min; }
  return {rand, between, seed};
})();
const seedInfoEl = document.getElementById('seedInfo'); if(seedInfoEl) seedInfoEl.textContent = `seed ${rng.seed}`;

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

// === Visuels SVG (aucun asset externe) ===
function addScene(key){
  const div = document.createElement("div");
  div.className = "scene";
  div.innerHTML = scenes[key] || scenes["default"];
  ui.log.appendChild(div);
  ui.log.scrollTop = ui.log.scrollHeight;
}
const scenes = {
  zone_marais:`<svg width="260" height="140"><rect width="260" height="140" fill="#10261c"/><circle cx="60" cy="80" r="20" fill="#1d6b46"/><circle cx="200" cy="60" r="14" fill="#1d6b46"/><text x="130" y="24" fill="#a7ffcf" text-anchor="middle" font-size="14">Marais</text></svg>`,
  zone_clairiere:`<svg width="260" height="140"><rect width="260" height="140" fill="#132018"/><rect x="20" y="90" width="220" height="30" fill="#1c301e"/><circle cx="210" cy="50" r="12" fill="#e9e779"/><text x="130" y="24" fill="#d9f99d" text-anchor="middle" font-size="14">Clairière</text></svg>`,
  zone_colline:`<svg width="260" height="140"><rect width="260" height="140" fill="#0f172a"/><polygon points="20,110 80,60 140,110" fill="#334155"/><polygon points="80,110 160,50 240,110" fill="#1f2937"/><text x="130" y="24" fill="#93c5fd" text-anchor="middle" font-size="14">Colline</text></svg>`,
  zone_ruines:`<svg width="260" height="140"><rect width="260" height="140" fill="#1f2430"/><rect x="40" y="60" width="60" height="40" fill="#4b5563"/><rect x="130" y="55" width="80" height="45" fill="#374151"/><text x="130" y="24" fill="#cbd5e1" text-anchor="middle" font-size="14">Ruines</text></svg>`,
  zone_grotte:`<svg width="260" height="140"><rect width="260" height="140" fill="#0b0f17"/><circle cx="130" cy="80" r="40" fill="#111827"/><text x="130" y="24" fill="#e5e7eb" text-anchor="middle" font-size="14">Grotte</text></svg>`,
  zone_village:`<svg width="260" height="140"><rect width="260" height="140" fill="#1b1f2a"/><rect x="40" y="80" width="60" height="35" fill="#8b5cf6"/><rect x="120" y="70" width="90" height="45" fill="#22c55e"/><text x="130" y="24" fill="#bae6fd" text-anchor="middle" font-size="14">Village</text></svg>`,
  bandit:`<svg width="260" height="140"><rect width="260" height="140" fill="#2b1d1d"/><circle cx="130" cy="70" r="34" fill="#6b3a3a"/><text x="130" y="78" fill="#fff" text-anchor="middle" font-size="16">Bandit</text></svg>`,
  loup:`<svg width="260" height="140"><rect width="260" height="140" fill="#142618"/><circle cx="130" cy="70" r="34" fill="#264233"/><text x="130" y="78" fill="#fff" text-anchor="middle" font-size="16">Loup</text></svg>`,
  harpy:`<svg width="260" height="140"><rect width="260" height="140" fill="#0f1e2c"/><circle cx="130" cy="70" r="34" fill="#2e5d80"/><text x="130" y="78" fill="#fff" text-anchor="middle" font-size="16">Harpie</text></svg>`,
  ghoul:`<svg width="260" height="140"><rect width="260" height="140" fill="#0e1d18"/><circle cx="130" cy="70" r="34" fill="#3a7d5e"/><text x="130" y="78" fill="#fff" text-anchor="middle" font-size="16">Goule</text></svg>`,
  boar:`<svg width="260" height="140"><rect width="260" height="140" fill="#241c15"/><circle cx="130" cy="70" r="34" fill="#7a5535"/><text x="130" y="78" fill="#fff" text-anchor="middle" font-size="16">Sanglier</text></svg>`,
  boss:`<svg width="260" height="140"><rect width="260" height="140" fill="#3b1111"/><circle cx="130" cy="70" r="40" fill="#9a2e2e"/><text x="130" y="78" fill="#fff" text-anchor="middle" font-size="16">Chef Bandit</text></svg>`,
  forgeron:`<svg width="260" height="140"><rect width="260" height="140" fill="#2b1d0d"/><rect x="90" y="50" width="80" height="50" fill="#6b7280"/><text x="130" y="120" fill="#fff" text-anchor="middle" font-size="12">Forge</text></svg>`,
  barde:`<svg width="260" height="140"><rect width="260" height="140" fill="#1b2130"/><circle cx="130" cy="70" r="28" fill="#5a6b8a"/><text x="130" y="78" fill="#fff" text-anchor="middle" font-size="16">Barde</text></svg>`,
  herbalist:`<svg width="260" height="140"><rect width="260" height="140" fill="#15261a"/><circle cx="130" cy="70" r="28" fill="#3f6b4c"/><text x="130" y="78" fill="#fff" text-anchor="middle" font-size="16">Herboriste</text></svg>`,
  hermit:`<svg width="260" height="140"><rect width="260" height="140" fill="#2a2a2a"/><circle cx="130" cy="70" r="28" fill="#6b6b6b"/><text x="130" y="78" fill="#fff" text-anchor="middle" font-size="16">Ermite</text></svg>`,
  peasant:`<svg width="260" height="140"><rect width="260" height="140" fill="#303018"/><circle cx="130" cy="70" r="28" fill="#9a8b52"/><text x="130" y="78" fill="#fff" text-anchor="middle" font-size="16">Paysan</text></svg>`,
  ruins:`<svg width="260" height="140"><rect width="260" height="140" fill="#1c1d22"/><rect x="70" y="60" width="120" height="50" fill="#4b5563"/><text x="130" y="24" fill="#fff" text-anchor="middle" font-size="14">Ruines</text></svg>`,
  sanctuaire:`<svg width="260" height="140"><rect width="260" height="140" fill="#1d1d2c"/><rect x="90" y="40" width="80" height="70" fill="#6b6b90"/><text x="130" y="24" fill="#fff" text-anchor="middle" font-size="14">Sanctuaire</text></svg>`,
  guard:`<svg width="260" height="140"><rect width="260" height="140" fill="#18212f"/><rect x="100" y="40" width="60" height="60" fill="#3b82f6"/><text x="130" y="118" fill="#fff" text-anchor="middle" font-size="12">Garde</text></svg>`,
  smuggler:`<svg width="260" height="140"><rect width="260" height="140" fill="#291a2a"/><rect x="100" y="40" width="60" height="60" fill="#ef4444"/><text x="130" y="118" fill="#fff" text-anchor="middle" font-size="12">Contrebande</text></svg>`,
  pilgrim:`<svg width="260" height="140"><rect width="260" height="140" fill="#1d2231"/><rect x="110" y="50" width="40" height="40" fill="#a3e635"/><text x="130" y="120" fill="#fff" text-anchor="middle" font-size="12">Pèlerin</text></svg>`,
  doe:`<svg width="260" height="140"><rect width="260" height="140" fill="#2a2016"/><circle cx="130" cy="72" r="28" fill="#c4a484"/><text x="130" y="118" fill="#fff" text-anchor="middle" font-size="12">Biche</text></svg>`,
  locket:`<svg width="260" height="140"><rect width="260" height="140" fill="#222525"/><circle cx="130" cy="72" r="20" fill="#fbbf24"/><text x="130" y="118" fill="#fff" text-anchor="middle" font-size="12">Médaillon</text></svg>`,
  caravan:`<svg width="260" height="140"><rect width="260" height="140" fill="#1f2229"/><rect x="70" y="60" width="120" height="40" fill="#9ca3af"/><text x="130" y="118" fill="#fff" text-anchor="middle" font-size="12">Caravane</text></svg>`,
  default:`<svg width="260" height="140"><rect width="260" height="140" fill="#0f172a"/><text x="130" y="76" fill="#94a3b8" text-anchor="middle" font-size="14">...</text></svg>`
};
function zoneScene(key){
  switch(key){
    case 'marais': return 'zone_marais';
    case 'clairiere': return 'zone_clairiere';
    case 'colline': return 'zone_colline';
    case 'ruines': return 'zone_ruines';
    case 'grotte': return 'zone_grotte';
    case 'village': return 'zone_village';
    default: return 'default';
  }
}

// === Utilitaires UI ===
function write(text, cls=""){ const p=document.createElement('p'); if(cls) p.classList.add(cls); p.innerHTML=text; ui.log.appendChild(p); ui.log.scrollTop=ui.log.scrollHeight; }
let _eventLocked=false;
function clearChoices(){ ui.choices.innerHTML=""; _eventLocked=false; }
function addChoice(label, handler, primary=false){ if(_eventLocked) return; const btn=document.createElement('button'); if(primary) btn.classList.add('btn-primary'); btn.textContent=label; btn.onclick=()=>{ if(_eventLocked) return; _eventLocked=true; handler(); }; ui.choices.appendChild(btn); }
function singleContinue(next=()=>explore()){ clearChoices(); addChoice("Continuer", ()=>next(), true); }

// === Stats & affichage ===
function setStats(){
  ui.hp.textContent = state.hp; ui.hpmax.textContent=state.hpMax;
  ui.hpbar.style.width = Math.max(0,Math.min(100,Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent = state.gold; ui.lvl.textContent = state.level; ui.xp.textContent = state.xp;
  ui.status.textContent = state.status.length? state.status.map(s=>s.name).join(', ') : '—';
  ui.pclass.textContent = state.cls; ui.pname.textContent = state.name;
  ui.astr.textContent = state.attrs.STR; ui.aagi.textContent = state.attrs.AGI; ui.awis.textContent = state.attrs.WIS;
  ui.rep.textContent = state.rep; ui.repLabel.textContent = repText(state.rep);
  // inventaire
  ui.inv.innerHTML=""; state.inventory.forEach(it=>{ const d=document.createElement('div'); d.className='stat'; d.innerHTML=`<b>${it.name}</b><span>${it.desc}</span>`; ui.inv.appendChild(d); });
  // quêtes
  ui.quests.innerHTML='';
  const mq=document.createElement('div'); mq.className='stat'; mq.innerHTML=`<b>${state.quests.main.title}</b><span>${state.quests.main.state}</span>`; ui.quests.appendChild(mq);
  const aq=document.createElement('div'); aq.className='stat'; aq.innerHTML=`<b>Fragments d’artefact (${state.flags.fragments}/3)</b><span>${state.quests.artifacts.state}</span>`; ui.quests.appendChild(aq);
  state.quests.side.forEach(q=>{ const x=document.createElement('div'); x.className='stat'; x.innerHTML=`<b>${q.title}</b><span>${q.state}</span>`; ui.quests.appendChild(x); });
}
function repText(n){ return n>=30?'Vertueux':n<=-30?'Sombre':'Neutre'; }

// === Helpers gameplay ===
function d20(mod=0){ const roll=rng.between(1,20); const total=roll+mod; ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${roll} = ${total}`; return {roll,total}; }
function heal(n){ state.hp=Math.min(state.hpMax,state.hp+n); setStats(); write(`+${n} PV`,"good"); }
function damage(n,src=""){ state.hp=Math.max(0,state.hp-n); setStats(); write(`-${n} PV ${src?`(${src})`:''}`,"bad"); if(state.hp<=0){ gameOver(); return true; } return false; }
function changeGold(n){ state.gold=Math.max(0,state.gold+n); setStats(); write(`Or ${n>=0?'+':''}${n} (total: ${state.gold})`, n>=0?"good":"warn"); }
function gainXP(n){ state.xp+=n; write(`XP +${n} (total ${state.xp})`,"info"); const need=20+(state.level-1)*15; if(state.xp>=need){ state.level++; state.xp=0; state.hpMax+=5; state.hp=state.hpMax; write(`<b>Niveau ${state.level} !</b> PV max +5, PV restaurés.`,"good"); } setStats(); }
function addItem(name,desc){ if(!hasItem(name)){ state.inventory.push({name,desc}); setStats(); write(`Tu obtiens <b>${name}</b>.`,"good"); } }
function hasItem(name){ return state.inventory.some(i=>i.name===name); }
function removeItem(name){ const i=state.inventory.findIndex(x=>x.name===name); if(i>=0) state.inventory.splice(i,1); setStats(); }

// Statuts
function tickStatus(){
  state.status = state.status.filter(st=>{
    if(st.type==='poison'){ const dmg=rng.between(1,2); damage(dmg,"Poison"); st.dur--; }
    if(st.type==='bleed'){ const dmg=2; damage(dmg,"Saignement"); st.dur--; }
    if(st.type==='slow'){ st.dur--; if(st.dur===0) write('💨 Tu te sens plus léger.','info') }
    return st.dur>0 && state.hp>0;
  });
}
function rep(n){ state.rep+=n; setStats(); }

// === Combat ===
function playerAtkMod(){ let m=0; if(state.cls==='Guerrier') m+=2; if(state.attrs.STR>=3) m+=1; if(hasItem('Épée affûtée')) m+=1; return m; }
function playerDef(){ return 10 + (state.cls==='Paladin'?1:0) + (state.attrs.AGI>=3?1:0) + (hasItem('Petite armure')?1:0) + (hasItem('Cuir renforcé')?2:0) + (hasItem('Bouclier en fer')?2:0); }
function terrainPenalty(){ return state.locationKey==='marais' ? -1 : 0 }

function combat(mon){
  clearChoices();
  state.inCombat=true; state.enemy=JSON.parse(JSON.stringify(mon));
  addScene(mon.scene || 'default');
  write(`<b>${mon.name}</b> apparaît ! ❤️ ${mon.hp} — CA ${mon.ac}`,"warn");
  combatTurn();
}
function combatTurn(){
  if(!state.inCombat) return;
  if(state.hp<=0){ gameOver(); return; }
  if(state.enemy.hp<=0){ write(`<b>${state.enemy.name} est vaincu !</b>`,"good"); afterCombat(); return; }
  clearChoices();
  const e=state.enemy;
  addChoice(`Attaquer`, ()=> aimMenu(), true);
  addChoice(`Parer`, ()=>{
    const bonus = state.cls==='Rôdeur'?2:1;
    const m = d20(e.hitMod).total;
    const armor = playerDef() + bonus;
    if(m>=armor){ const dmg=Math.max(0,rng.between(1,3+e.tier)-2-bonus); write(`Parade partielle, -${dmg} PV.`,"warn"); damage(dmg,e.name); }
    else write("Tu pares complètement !","good");
    combatTurn();
  });
  addChoice(`Compétence (${state.skill.name||'—'})`, ()=>{
    if(!state.skill || !state.skill.use){ write("Pas de compétence.","warn"); return combatTurn(); }
    if(state.skill.cd>0){ write("Compétence en recharge.","warn"); return combatTurn(); }
    state.skill.use(e); state.skill.cd = state.skill.cooldown||3;
    if(e.hp>0) enemyAttack(); combatTurn();
  });
  addChoice(`Potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Plus de potions.","warn"); return combatTurn(); }
    state.potions--; heal(rng.between(8,12)); enemyAttack(); combatTurn();
  });
  addChoice(`Fuir`, ()=>{
    const r=d20(state.attrs.AGI>=3?2:0).total;
    if(r>=14){ write("Tu fuis le combat.","sys"); state.inCombat=false; state.enemy=null; explore(); }
    else { write("Échec de fuite !","bad"); enemyAttack(); combatTurn(); }
  });
}
function aimMenu(){
  clearChoices(); const e=state.enemy;
  addChoice('Viser la tête', ()=>{
    const r=d20(playerAtkMod()-2 + terrainPenalty()).total;
    if(r>=e.ac+2){ const dmg=rng.between(6,10); e.hp-=dmg; write(`🎯 Coup à la tête : -${dmg} PV`,'good'); }
    else write('Tu manques la tête.','warn');
    enemyAttack(); combatTurn();
  }, true);
  addChoice('Viser le torse', ()=>{
    const r=d20(playerAtkMod() + terrainPenalty()).total;
    if(r>=e.ac){ const dmg=rng.between(3,7); e.hp-=dmg; write(`🗡️ Frappe au torse : -${dmg} PV`,'good'); }
    else write('Tu manques.','warn');
    enemyAttack(); combatTurn();
  });
  addChoice('Viser les jambes', ()=>{
    const r=d20(playerAtkMod()+1 + terrainPenalty()).total;
    if(r>=e.ac-1){ const dmg=rng.between(2,5); e.hp-=dmg; state.status.push({type:'slow',name:'Ralentissement',dur:2}); write(`🦵 Frappe aux jambes : -${dmg} PV (ennemi ralenti)`,'good'); }
    else write('Tu manques les jambes.','warn');
    enemyAttack(); combatTurn();
  });
  addChoice('Annuler', combatTurn);
}
function enemyAttack(){
  const e=state.enemy; const roll=d20(e.hitMod).total; const def=playerDef()+terrainPenalty();
  if(roll>=def){
    const dmg=rng.between(1,3+e.tier);
    if(e.name.includes('Bandit') && rng.rand()<0.2){ changeGold(-1); write('🪙 Le bandit te détrousse !','warn'); }
    damage(dmg,e.name);
    if(e.dotChance && rng.rand()<e.dotChance){
      if(e.dotType==='poison') state.status.push({type:'poison', name:'Poison', dur:rng.between(2,4)});
      if(e.dotType==='bleed')  state.status.push({type:'bleed',  name:'Saignement', dur:rng.between(2,4)});
      write(`⚠️ ${e.name} inflige ${e.dotType==='poison'?'un poison':'un saignement'} !`,"warn");
    }
  } else write(`${e.name} rate son attaque.`,"info");
  tickStatus();
}
function afterCombat(){
  const e=state.enemy; state.inCombat=false; state.enemy=null;
  const gold=rng.between(e.tier, e.tier*3); const xp=rng.between(e.tier*3, e.tier*6);
  changeGold(gold); gainXP(xp);

  // Récompenses limitées
  const r=rng.rand();
  if(r<0.2 && !hasItem("Épée affûtée")) addItem("Épée affûtée","+1 attaque");
  else if(r<0.35 && !hasItem("Bouclier en bois")) addItem("Bouclier en bois","+1 armure légère");
  else if(r<0.45) { state.potions++; write("Tu trouves une potion.","good"); }
  else if(r<0.5 && !hasItem("Cuir renforcé")) addItem("Cuir renforcé","+2 armure souple");

  if(e.name.includes("Bandit")){
    state.flags.rumors = (state.flags.rumors||0)+1;
    if(state.flags.rumors>=3 && !state.flags.bossUnlocked){
      state.flags.bossUnlocked=true;
      write("🗡️ Tu apprends la cache du Chef Bandit… (événement rare débloqué)","info");
    }
  }
  explore();
}

// === Bestiaire ===
const mobTemplates = {
  wolf: ()=>({ name:"Loup affamé", hp:10, maxHp:10, ac:11, hitMod:2, tier:1, dotChance:0, dotType:null, scene:'loup' }),
  bandit: ()=>({ name:"Bandit des fourrés", hp:12, maxHp:12, ac:12, hitMod:3, tier:2, dotChance:0.1, dotType:'bleed', scene:'bandit' }),
  boar: ()=>({ name:"Sanglier irascible", hp:11, maxHp:11, ac:11, hitMod:2, tier:1, dotChance:0.05, dotType:'bleed', scene:'boar' }),
  harpy: ()=>({ name:"Harpie du vent", hp:14, maxHp:14, ac:13, hitMod:4, tier:2, dotChance:0.2, dotType:'bleed', scene:'harpy' }),
  ghoul: ()=>({ name:"Goule des roseaux", hp:13, maxHp:13, ac:12, hitMod:3, tier:2, dotChance:0.25, dotType:'poison', scene:'ghoul' }),
  chief: ()=>({ name:"Chef Bandit", hp:24, maxHp:24, ac:14, hitMod:5, tier:3, dotChance:0.3, dotType:'bleed', scene:'boss' }),
  guardian:`Gardienne des Roseaux`,
  matriarch:`Harpie Matriarche`,
  specter:`Spectre des Ruines`,
};
function miniBoss(name){
  if(name===mobTemplates.guardian) return { name:"Gardienne des Roseaux", hp:20, maxHp:20, ac:13, hitMod:4, tier:3, dotChance:0.25, dotType:'poison', scene:'ghoul' };
  if(name===mobTemplates.matriarch) return { name:"Harpie Matriarche", hp:22, maxHp:22, ac:14, hitMod:5, tier:3, dotChance:0.2, dotType:'bleed', scene:'harpy' };
  return { name:"Spectre des Ruines", hp:18, maxHp:18, ac:14, hitMod:5, tier:3, dotChance:0.15, dotType:null, scene:'ruins' };
}

// === Boss ===
function combatBoss(){
  const boss = mobTemplates.chief();
  addScene('boss'); write('🥷 Tu t’infiltres dans la planque du Chef Bandit.','warn');
  combat(boss);
  const _enemyAttack = enemyAttack;
  enemyAttack = function(){
    if(state.enemy && state.enemy.name==='Chef Bandit' && state.enemy.hp<=state.enemy.maxHp/2 && !state.enemy.enraged){
      state.enemy.enraged=true; state.enemy.hitMod+=1; write('🔥 Le Chef Bandit entre en rage !','warn');
    }
    _enemyAttack();
  }
}

// === Temps & exploration ===
function setTime(){
  const slots=["Aube","Matin","Midi","Après-midi","Crépuscule","Nuit"];
  const idx=slots.indexOf(state.time); let n=(idx+1)%slots.length; if(n===0) state.day++;
  state.time=slots[n]; ui.day.textContent=`Jour ${state.day} — ${state.time}`;
}
function pickWeighted(items, k){
  const recent = new Set(state.lastLabels);
  let pool = items.flatMap(it => Array((it.w||1)).fill(it)).filter(it=> !recent.has(it.label));
  if(pool.length<k) pool = items.flatMap(it => Array((it.w||1)).fill(it));
  const out=[];
  for(let i=0;i<k && pool.length;i++){ const idx=Math.floor(rng.rand()*pool.length); out.push(pool[idx]); pool=pool.filter((_,j)=>j!==idx); }
  state.lastLabels = [...out.map(o=>o.label), ...state.lastLabels].slice(0,8);
  return out;
}

function explore(initial=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();
  if(!initial) setTime();
  tickStatus();
  if(state.hp<=0) return;

  addScene(zoneScene(state.locationKey));
  if(state.day>=5 && !state.flags.oracleSeen){ eventOracle(); return; }
  if(state.locationKey==='village'){ return villageHub(); }

  const zone = state.locationKey;
  const base = [
    { label:"Fouiller", act:searchArea, w:2 },
    { label:"Se reposer", act:rest, w:1 },
    { label:"Utiliser un objet", act:useItemMenu, w:1 }
  ];
  let pool=[];
  if(zone==='marais'){
    pool.push({label:'Suivre des feux-follets', act:eventSanctuary, w:2});
    pool.push({label:'Aider un captif', act:()=>{ if(!state.flags.peasantSaved) eventPeasant(); else { write('La berge est silencieuse.'); singleContinue(); } }, w:1});
    pool.push({label:'Traquer une goule', act:()=>combat(mobTemplates.ghoul()), w:3});
    pool.push({label:'Affronter un loup', act:()=>combat(mobTemplates.wolf()), w:2});
    pool.push({label:'Biche prise au collet', act:eventRescueDoe, w:1});
    pool.push({label:'Tomber sur un piège', act:()=>{ eventTrap(); singleContinue(); }, w:1});
    if(!state.flags.frag1) pool.push({label:'Rumeur: Gardienne des Roseaux', act:()=>eventMiniBoss(1), w:1});
  } else if(zone==='clairiere'){
    pool.push({label:'Croiser une herboriste', act:eventHerbalist, w:2});
    pool.push({label:'Écouter un barde', act:eventBard, w:1});
    pool.push({label:'Chasser un sanglier', act:()=>combat(mobTemplates.boar()), w:2});
    pool.push({label:'Autel moussu', act:eventSanctuary, w:1});
    pool.push({label:'Rencontrer un forgeron', act:eventSmith, w:1});
    pool.push({label:'Pèlerin perdu', act:eventEscortPilgrim, w:1});
    pool.push({label:'Médaillon égaré', act:eventReturnLocket, w:1});
  } else if(zone==='colline'){
    pool.push({label:'Rencontrer un ermite', act:eventHermit, w:2});
    pool.push({label:'Sentier vers les ruines', act:()=>gotoZone('ruines'), w:1});
    pool.push({label:'Affronter une harpie', act:()=>combat(mobTemplates.harpy()), w:3});
    if(!state.flags.frag2) pool.push({label:'Nid de la Matriarche', act:()=>eventMiniBoss(2), w:1});
    pool.push({label:'Convoi marchand', act:eventMerchantAmbush, w:1});
  } else if(zone==='ruines'){
    pool.push({label:'Fouiller les décombres', act:eventRuins, w:3});
    pool.push({label:'Écarter des pierres instables', act:()=>{ if(d20().total<10) damage(rng.between(1,4),'Éboulement'); else write("Tu avances prudemment."); singleContinue(); }, w:1});
    pool.push({label:'Combattre des bandits', act:()=>combat(mobTemplates.bandit()), w:2});
    if(!state.flags.frag3) pool.push({label:'Voix dans la pierre', act:()=>eventMiniBoss(3), w:1});
  } else if(zone==='grotte'){
    pool.push({label:'Affronter une goule ancienne', act:()=>combat({name:'Goule ancienne',hp:18,maxHp:18,ac:13,hitMod:5,tier:3,dotChance:0.35,dotType:'poison', scene:'ghoul'}), w:3});
    pool.push({label:'Échos inquiétants', act:()=>{ const r=d20().total; if(r<10) damage(3,'Stalactite'); else write('Rien ne se passe.'); singleContinue(); }, w:1});
  }

  if(state.flags.bossUnlocked) pool.push({label:"Traquer le Chef Bandit", act:()=>combatBoss(), w:1});

  const nav=[ {label:'→ Village', act:()=>gotoZone('village'), w: state.flags.villageUnlocked?1:0},
              {label:'→ Marais', act:()=>gotoZone('marais'), w:1},
              {label:'→ Clairière', act:()=>gotoZone('clairiere'), w:1},
              {label:'→ Colline', act:()=>gotoZone('colline'), w:1},
              {label:'→ Ruines', act:()=>gotoZone('ruines'), w: 1},
              {label:'→ Grotte', act:()=> state.flags.torch? gotoZone('grotte') : (write('Il fait trop sombre pour entrer. Trouve une torche.','warn'), singleContinue()), w:1} ].filter(x=>x.w>0);

  const dyn = pickWeighted(pool, 2 + (rng.rand()<0.5?1:0));
  const navPick = pickWeighted(nav, 1);
  const all = pickWeighted([...base, ...dyn, ...navPick], 4);
  all.forEach((c,i)=> addChoice(c.label, c.act, i===0));
}

function gotoZone(key){
  state.locationKey=key;
  state.location = key==='marais'?"Marais de Vire-Saule":
                   key==='clairiere'?"Clairière des Lys":
                   key==='colline'?"Colline de Rocfauve":
                   key==='ruines'?"Ruines Oubliées":
                   key==='grotte'?"Grotte Sépulcrale":
                   key==='village'?"Village de Mirval":"Lisière";
  write(`👉 Tu te diriges vers ${state.location}.`,"sys");
  explore(true);
}

// === HUB : Village ===
function villageHub(){
  setStats(); addScene('zone_village');
  write("🏘️ Le Village de Mirval bourdonne d'activité.");
  clearChoices();

  addChoice("Marché (acheter)", eventVillageMarket, true);
  addChoice("Taverne (rumeurs)", eventVillageTavern);
  addChoice("Chapelle (bénédiction)", eventVillageChapel);
  addChoice("Forge (améliorations)", eventVillageForge);

  if(!state.flags.guardQuest && state.rep>=5)
    addChoice("Aider la Garde (quête)", questHelpGuard);
  if(!state.flags.smugglerQuest && state.rep<=-5)
    addChoice("Trafic des contrebandiers (quête)", questSmuggler);

  addChoice("Quitter le village", ()=>{ write("Tu quittes le brouhaha pour la nature."); singleContinue(()=>gotoZone('clairiere')); });
}

// Village: sous-événements
function eventVillageMarket(){
  addScene('zone_village');
  write("🛒 Étals variés : potions, rations et bric-à-brac.");
  clearChoices();
  addChoice("Potion (5 or)", ()=>{
    if(state.gold>=5){ changeGold(-5); state.potions++; write("Tu achètes une potion."); } else write("Pas assez d'or.",'warn');
    singleContinue(villageHub);
  }, true);
  addChoice("Torche (3 or)", ()=>{
    if(state.flags.torch){ write("Tu as déjà une torche.",'warn'); return singleContinue(villageHub); }
    if(state.gold>=3){ changeGold(-3); state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte'); }
    else write("Pas assez d'or.",'warn');
    singleContinue(villageHub);
  });
  addChoice("Quitter", ()=>singleContinue(villageHub));
}
function eventVillageTavern(){
  addScene('barde');
  write("🍻 La Taverne du Chêne accueille voyageurs et rumeurs.");
  clearChoices();
  addChoice("Écouter des rumeurs (2 or)", ()=>{
    if(state.gold>=2){ changeGold(-2); eventRumor(); } else write("Pas assez d'or.",'warn');
    singleContinue(villageHub);
  }, true);
  addChoice("Demander une chanson", ()=>{
    if(rng.rand()<0.7){ heal(rng.between(3,7)); write("La mélodie t’apaise.","good"); }
    else { write("Le barde est en pause."); }
    singleContinue(villageHub);
  });
  addChoice("Quitter", ()=>singleContinue(villageHub));
}
function eventVillageChapel(){
  addScene('sanctuaire');
  write("⛪ La chapelle exhale un parfum d’encens.");
  clearChoices();
  addChoice("Recevoir une bénédiction (réputation ≥ 5)", ()=>{
    if(state.rep>=5){ heal(rng.between(6,12)); write("Une chaleur te parcourt.","good"); }
    else write("Le prêtre te jauge, dubitatif…",'warn');
    singleContinue(villageHub);
  }, true);
  addChoice("Donner l’aumône (3 or → +réputation)", ()=>{
    if(state.gold>=3){ changeGold(-3); rep(+2); write("Tu fais un don discret."); }
    else write("Pas assez d'or.",'warn');
    singleContinue(villageHub);
  });
  addChoice("Partir", ()=>singleContinue(villageHub));
}
function eventVillageForge(){
  addScene('forgeron');
  write("⚒️ La forge du village résonne. Le forgeron te reconnaît.");
  clearChoices();
  const tier = state.flags.smithLevel || 1;

  addChoice("Affûter l’épée (5 or)", ()=>{
    if(hasItem('Épée affûtée')){ write("Ton épée est déjà affûtée.",'warn'); return singleContinue(villageHub); }
    if(state.gold>=5){ changeGold(-5); addItem('Épée affûtée','+1 attaque'); if(tier===1){ state.flags.smithXp=(state.flags.smithXp||0)+1; if(state.flags.smithXp>=2){ state.flags.smithLevel=2; write("Le forgeron perfectionne sa technique (Niv.2).","info"); } } }
    else write("Pas assez d'or.",'warn');
    singleContinue(villageHub);
  }, true);

  addChoice("Bouclier en fer (6 or)", ()=>{
    if(hasItem('Bouclier en fer')){ write("Tu as déjà ce bouclier.",'warn'); return singleContinue(villageHub); }
    if(state.gold>=6){ changeGold(-6); addItem('Bouclier en fer','+2 armure'); if(tier===1){ state.flags.smithXp=(state.flags.smithXp||0)+1; if(state.flags.smithXp>=2){ state.flags.smithLevel=2; write("Le forgeron perfectionne sa technique (Niv.2).","info"); } } }
    else write("Pas assez d'or.",'warn');
    singleContinue(villageHub);
  });

  if(tier>=2){
    addChoice("Cuir renforcé (8 or)", ()=>{
      if(hasItem('Cuir renforcé')){ write("Tu as déjà ce cuir.",'warn'); return singleContinue(villageHub); }
      if(state.gold>=8){ changeGold(-8); addItem('Cuir renforcé','+2 armure souple'); }
      else write("Pas assez d'or.",'warn');
      singleContinue(villageHub);
    });
  }

  addChoice("Parler métier", ()=>{ gainXP(3); write("Il te parle d’un Chef Bandit au nord.","info"); singleContinue(villageHub); });
  addChoice("Quitter la forge", ()=>singleContinue(villageHub));
}

// === Quêtes Village (réputation) ===
function questHelpGuard(){
  addScene('guard');
  write("🛡️ La Garde te confie une patrouille près des ruines.");
  clearChoices();
  addChoice("Accepter", ()=>{
    state.flags.guardQuest=true;
    write("Tu fais une ronde avec eux…");
    if(rng.rand()<0.6){ combat(mobTemplates.bandit()); }
    else { write("Ronde calme. La Garde te remercie."); rep(+3); gainXP(6); singleContinue(villageHub); }
  }, true);
  addChoice("Refuser", ()=>{ rep(-1); singleContinue(villageHub); });
}
function questSmuggler(){
  addScene('smuggler');
  write("🩸 Les contrebandiers t’offrent un marché douteux.");
  clearChoices();
  addChoice("Accepter", ()=>{
    state.flags.smugglerQuest=true;
    if(rng.rand()<0.5){ changeGold(+8); rep(-3); write("Marché conclu."); }
    else { write("Piège !", 'warn'); combat(mobTemplates.bandit()); }
  }, true);
  addChoice("Refuser", ()=>{ rep(+1); singleContinue(villageHub); });
}

// === Actions générales ===
// → Quand “quelque chose s’approche”, on déclenche FORCÉMENT un combat/PNJ (plus de vide).
function searchArea(){
  const bonus = state.attrs.WIS>=3?1:0;
  const {total} = d20(bonus);
  if(total>=18){ write("🔑 Recherche exceptionnelle : tu trouves un coffre scellé.","good"); chest(); singleContinue(); return; }
  if(total>=12){ write("✨ Quelques pièces sous une pierre.","good"); changeGold(rng.between(2,6)); singleContinue(); return; }
  // Approche garantie :
  write("…Tu repères des traces fraîches. Quelque chose approche !");
  forcedEncounter(); // ⟵ combat/PNJ immédiat
}
function rest(){
  if(rng.rand()<0.35){
    write("Quelque chose approche pendant ton repos…","warn");
    forcedEncounter(); // ⟵ interruption = rencontre immédiate
  } else {
    heal(rng.between(4,8)); write("Tu dors un peu. Ça fait du bien.","good"); singleContinue();
  }
}
function useItemMenu(){
  clearChoices();
  addChoice(`Boire une potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Tu n'as pas de potion.","warn"); return singleContinue(); }
    state.potions--; heal(rng.between(8,12)); singleContinue();
  }, true);
  addChoice("Annuler", ()=>explore());
}
function chest(){
  const r=rng.between(1,100);
  if(r>94){ addItem("Bouclier en fer","+2 armure"); }
  else if(r>78){ addItem("Potion de soin","Rest. 8-12 PV"); state.potions++; }
  else if(r>48){ changeGold(rng.between(7,15)); }
  else { write("💥 Piège !","bad"); damage(rng.between(3,6),"Piège"); }
}

// === Rencontres : FORCÉES et aléatoires ===
function forcedEncounter(){
  // 60% combat, 40% PNJ/événement ; pondéré par zone
  const roll = rng.rand();
  const zone = state.locationKey;
  if(roll < 0.6){
    // Combat selon zone
    if(zone==='marais') return combat(mobTemplates.ghoul());
    if(zone==='clairiere') return combat(mobTemplates.bandit());
    if(zone==='ruines') return combat(mobTemplates.bandit());
    return combat(mobTemplates.harpy());
  } else {
    // PNJ/événement utile
    const events = [eventHerbalist,eventSmith,eventHermit,eventSanctuary,eventRescueDoe,eventEscortPilgrim,eventReturnLocket,eventMerchantAmbush];
    return events[rng.between(0,events.length-1)]();
  }
}
function randomEncounter(){
  // Conservée pour d’autres chemins ; garde le comportement agressif (déclenchement direct)
  return forcedEncounter();
}

// === PNJ & événements étendus (avec gains de réputation) ===
function eventHerbalist(){
  addScene('herbalist'); write("🌿 Une herboriste s’approche, panier d’herbes en main."); clearChoices();
  addChoice("S’approcher", ()=>{
    if(state.rep<-20){ write("Elle se détourne : « Je ne sers pas les cruels. »",'warn'); rep(-1); return singleContinue(); }
    const cost=(state.rep>20?2:3);
    if(state.gold>=cost){ changeGold(-cost); heal(rng.between(6,12)); state.flags.herbalistTrust=(state.flags.herbalistTrust||0)+1; }
    else write("Tu n'as pas assez d'or.","warn");
    singleContinue();
  }, true);
  addChoice("Marchander", ()=>{
    const {total}=d20(state.attrs.WIS>=3?2:0);
    if(total>=15){ heal(rng.between(4,8)); write('« À prix d’ami. »','good'); state.flags.herbalistTrust=(state.flags.herbalistTrust||0)+1; }
    else write('Elle refuse.','warn');
    singleContinue();
  });
  if((state.flags.herbalistTrust||0)>=2 && !state.flags.herbalGift){
    addChoice("Offre un baume (unique)", ()=>{
      state.flags.herbalGift=true; addItem("Baume vital","Soigne 6 PV automatiquement si < 6 PV (1x)"); rep(+1);
      singleContinue();
    });
  }
  addChoice("Partir", singleContinue);
}
function eventSmith(){
  addScene('forgeron'); write('⚒️ Un forgeron surgit du sentier et te salue.'); clearChoices();
  addChoice('Acheter une torche (3 or)', ()=>{
    if(state.flags.torch){ write("Tu as déjà une torche.",'warn'); return singleContinue(); }
    if(state.gold>=3){ changeGold(-3); state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte'); rep(+1); }
    else write("Pas assez d'or.",'warn'); singleContinue();
  }, true);
  addChoice('Affûter l’épée (5 or)', ()=>{
    if(hasItem('Épée affûtée')){ write("Ton épée est déjà affûtée.",'warn'); return singleContinue(); }
    if(state.gold>=5){ changeGold(-5); addItem('Épée affûtée','+1 attaque'); }
    else write("Pas assez d'or.",'warn'); singleContinue();
  });
  addChoice('Acheter un bouclier (6 or)', ()=>{
    if(hasItem('Bouclier en fer')){ write("Tu as déjà ce bouclier.",'warn'); return singleContinue(); }
    if(state.gold>=6){ changeGold(-6); addItem('Bouclier en fer','+2 armure'); }
    else write("Pas assez d'or.",'warn'); singleContinue();
  });
  addChoice('Discuter', ()=>{ gainXP(3); write("« Si tu vois la Garde, dis-leur qu’on manque d’acier. »","info"); singleContinue(); });
}
function eventBard(){
  addScene('barde'); write('🎻 Un barde te rejoint d’un pas léger.'); clearChoices();
  addChoice('Écouter', ()=>{
    if(rng.rand()<0.7){ heal(rng.between(3,7)); write("La mélodie t’apaise.","good"); }
    else { changeGold(-2); write('…quelqu’un fait les poches.','warn'); }
    singleContinue();
  }, true);
  addChoice('L’ignorer', singleContinue);
}
function eventRuins(){
  addScene('ruins'); write('🏚️ Des ruines effondrées se dressent.'); clearChoices();
  addChoice('Fouiller', ()=>{
    const {total}=d20(state.attrs.WIS>=3?1:0);
    if(total>=16){
      if(!state.flags.torch){ state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte'); rep(+1); }
      else { changeGold(rng.between(5,9)); }
    } else if(total>=10){ chest(); } else { damage(rng.between(2,5),'Éboulement'); }
    singleContinue();
  }, true);
  addChoice('Partir', singleContinue);
}
function eventPeasant(){
  addScene('peasant'); write('🧑‍🌾 Un paysan enchaîné appelle à l’aide et s’avance tant bien que mal.'); clearChoices();
  addChoice('Le libérer', ()=>{
    const {total}=d20(state.attrs.STR>=3?2:0);
    if(total>=14){ write('Les chaînes cèdent.','good'); rep(+5); state.flags.peasantSaved=true; state.quests.side.push({title:'Le paysan reconnaissant',state:'En attente'}); if(!state.flags.villageUnlocked){ state.flags.villageUnlocked=true; write("Il t’indique la route du village.","info"); } }
    else { damage(rng.between(1,4),'Effort'); }
    singleContinue();
  }, true);
  addChoice('L’ignorer', ()=>{ rep(-3); singleContinue(); });
}
function eventSanctuary(){
  addScene('sanctuaire'); write('⛪ Un ancien sanctuaire se dévoile et une silhouette t’approche.'); clearChoices();
  addChoice('Prier', ()=>{
    const night = state.time==='Nuit' || state.time==='Crépuscule'; const {total}=d20(); const t=total+(night?1:0);
    if(t>=15){ heal(rng.between(6,12)); rep(+2); }
    else { damage(rng.between(2,6),'Présage'); rep(-1); }
    singleContinue();
  }, true);
  addChoice('Profaner (réputation ≤ -5)', ()=>{
    if(state.rep<=-5){
      const {total}=d20(-1);
      if(total>=16){ changeGold(rng.between(8,16)); rep(-3); }
      else { damage(rng.between(4,7),'Malédiction'); rep(-5); }
    } else write("Ta main hésite : trop de scrupules…",'warn');
    singleContinue();
  });
  addChoice('Partir', singleContinue);
}
function eventHermit(){
  addScene('hermit'); write('🧙 Un ermite s’avance, la barbe au vent.'); clearChoices();
  addChoice('Accepter sa décoction', ()=>{
    if(rng.rand()<0.6){ heal(rng.between(5,10)); gainXP(3); rep(+1); } else { damage(rng.between(2,5),'Nausée'); }
    singleContinue();
  }, true);
  addChoice('Acheter une breloque (5 or)', ()=>{
    if(state.flags.charm){ write("Tu as déjà la breloque.",'warn'); return singleContinue(); }
    if(state.gold>=5){ changeGold(-5); addItem("Breloque d'ermite","10% annule un mal"); state.flags.charm=1; }
    else write("Pas assez d'or.",'warn');
    singleContinue();
  });
  addChoice('Refuser', singleContinue);
}
function eventTrap(){ write('🪤 Une corde s’enroule à ta cheville !'); const {total}=d20(state.attrs.AGI>=3?2:0); if(total>=13) write('Tu t’en sors de justesse.','good'); else damage(rng.between(2,5),'Piège'); }
function eventOracle(){ write('🔮 Une voyante apparaît dans tes rêves.'); clearChoices(); addChoice('Écouter la prophétie', ()=>{ write('« Quand trois éclats seront réunis, la porte s’ouvrira. »','info'); state.flags.oracleSeen=true; singleContinue(); }, true); }
function eventRumor(){ write("🔥 On murmure qu’un Chef Bandit recrute au Nord…",'info'); state.flags.rumors=(state.flags.rumors||0)+1; if(state.flags.rumors>=3){ state.flags.bossUnlocked=true; write("🗡️ Tu as assez d’indices pour traquer le Chef Bandit.","good"); } }

// ——— Nouveaux événements “héroïques” (réputation +) ———
// 1) Sauver une biche prise au collet
function eventRescueDoe(){
  addScene('doe'); write("🦌 Une biche terrorisée se débat dans un collet et t’aperçoit.");
  clearChoices();
  addChoice("Libérer doucement", ()=>{
    const {total}=d20(state.attrs.WIS>=3?2:0);
    if(total>=13){ write("La biche s’échappe et te jette un dernier regard."); rep(+2); gainXP(4); }
    else { write("Tu desserres le collet, mais te blesses aux mains."); damage(rng.between(1,3),"Blessures"); rep(+1); }
    singleContinue();
  }, true);
  addChoice("Ignorer", ()=>{ rep(-1); singleContinue(); });
}
// 2) Escorter un pèlerin perdu jusqu’au sanctuaire
function eventEscortPilgrim(){
  addScene('pilgrim'); write("🕯️ Un pèlerin égaré s’approche et te supplie de le guider.");
  clearChoices();
  addChoice("L’escorter", ()=>{
    const risk = d20().total;
    if(risk<10){ combat(mobTemplates.bandit()); }
    else { write("Le trajet se déroule sans encombres. Le pèlerin prie pour toi."); rep(+3); gainXP(5); singleContinue(); }
  }, true);
  addChoice("Refuser", ()=>{ rep(-2); singleContinue(); });
}
// 3) Rendre un médaillon égaré
function eventReturnLocket(){
  addScene('locket'); write("🟡 Tu trouves un médaillon ; une vieille femme accourt vers toi.");
  clearChoices();
  addChoice("Le rendre", ()=>{
    write("Ses yeux s’illuminent : « Merci… c’était à mon fils. »");
    rep(+2); changeGold(+2); gainXP(2); singleContinue();
  }, true);
  addChoice("Le garder", ()=>{ write("…Tu le glisses dans ta poche."); rep(-2); addItem("Médaillon terni","Ça ne vaut pas grand-chose."); singleContinue(); });
}
// 4) Défendre une caravane attaquée
function eventMerchantAmbush(){
  addScene('caravan'); write("🚚 Des cris ! Une caravane est prise en embuscade. Les bandits s’avancent !");
  clearChoices();
  addChoice("Intervenir", ()=>{
    combat(mobTemplates.bandit());
    const _after = afterCombat;
    afterCombat = function(){
      _after();
      write("Les marchands t’offrent une bourse et leur gratitude.");
      changeGold(+5); rep(+2); gainXP(4);
      afterCombat = _after;
    };
  }, true);
  addChoice("Observer de loin", ()=>{ rep(-1); singleContinue(); });
}

// === Mini-Boss (Fragments scénarisés) ===
function eventMiniBoss(idx){
  if(idx===1){
    write("🌫️ Les roseaux s’écartent… la Gardienne s’avance vers toi.");
    combat(miniBoss(mobTemplates.guardian));
    const _after = afterCombat;
    afterCombat = function(){
      _after();
      if(!state.flags.frag1){ state.flags.frag1=true; state.flags.fragments++; state.quests.artifacts.state=`En cours`; write(`✨ Fragment des Roseaux acquis ! (${state.flags.fragments}/3)`,'good'); rep(+1); }
      afterCombat = _after;
    };
  }
  else if(idx===2){
    write("💨 Depuis son nid, la Matriarche plonge sur toi.");
    combat(miniBoss(mobTemplates.matriarch));
    const _after2 = afterCombat;
    afterCombat = function(){
      _after2();
      if(!state.flags.frag2){ state.flags.frag2=true; state.flags.fragments++; state.quests.artifacts.state=`En cours`; write(`✨ Fragment des Vents acquis ! (${state.flags.fragments}/3)`,'good'); }
      afterCombat = _after2;
    };
  }
  else { // 3
    if(!state.flags.torch){ write("Il te faut une torche pour descendre dans l’obscurité.",'warn'); return singleContinue(); }
    write("🕯️ Un froid te traverse : un spectre se matérialise et avance sur toi.");
    combat(miniBoss(mobTemplates.specter));
    const _after3 = afterCombat;
    afterCombat = function(){
      _after3();
      if(!state.flags.frag3){ state.flags.frag3=true; state.flags.fragments++; state.quests.artifacts.state=`En cours`; write(`✨ Fragment des Profondeurs acquis ! (${state.flags.fragments}/3)`,'good'); }
      if(state.flags.fragments>=3){ state.quests.artifacts.state='Complet'; write("Les trois fragments vibrent… la porte des Ruines peut s’ouvrir.","info"); }
      afterCombat = _after3;
    };
  }
}

// === Fins ===
function ending(){
  clearChoices();
  if(state.rep>=30){ write('<b>Fin héroïque :</b> Mirval te salue comme un sauveur.','good'); state.achievements.hero=true; }
  else if(state.rep<=-30){ write('<b>Fin sombre :</b> ta légende glace le sang des voyageurs.','bad'); state.achievements.villain=true; }
  else { write('<b>Fin neutre :</b> tu quittes la forêt, plus sage qu’avant.','info'); }
  addChoice('Rejouer (New Game+)', ()=>{ const st=initialState(); st.attrs.STR++; st.attrs.AGI++; st.attrs.WIS++; state=st; ui.log.innerHTML=''; setup(true); }, true);
  addChoice('Quitter', ()=>write('Merci d’avoir joué !'));
}

// === Choix de classe & compétences ===
function chooseClass(){
  clearChoices(); write('Choisis ta classe :','info');
  addChoice('🛡️ Guerrier', ()=>{
    state.cls='Guerrier'; state.attrs.STR=3;
    state.skill={ name:'Frappe vaillante', cooldown:3, cd:0, use:(e)=>{ const dmg=rng.between(2,6)+rng.between(2,6)+state.level; e.hp-=dmg; write(`💥 Frappe vaillante : -${dmg} PV`,'good'); } };
    startAdventure();
  }, true);
  addChoice('🗡️ Voleur', ()=>{
    state.cls='Voleur'; state.attrs.AGI=3;
    state.skill={ name:'Coup de l’ombre', cooldown:3, cd:0, use:(e)=>{ const r=d20(4).total; if(r>=e.ac){ const steal=Math.min(3, state.gold); const dmg=rng.between(3,8)+steal; e.hp-=dmg; changeGold(steal); write(`🗡️ L’ombre frappe : -${dmg} PV`,'good'); } else write('Tu rates.','warn'); } };
    startAdventure();
  });
  addChoice('⚕️ Paladin', ()=>{
    state.cls='Paladin'; state.attrs.WIS=2;
    state.skill={ name:'Lumière', cooldown:3, cd:0, use:()=>{ heal(rng.between(3,8)+state.level); } };
    startAdventure();
  });
  addChoice('🏹 Rôdeur', ()=>{
    state.cls='Rôdeur'; state.attrs.AGI=3;
    state.skill={ name:'Tir précis', cooldown:2, cd:0, use:(e)=>{ const r=d20(6).total; if(r>=e.ac){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🏹 Tir précis : -${dmg} PV`,'good'); } else write('Tir manqué.','warn'); } };
    startAdventure();
  });
  addChoice('🔮 Mystique', ()=>{
    state.cls='Mystique'; state.attrs.WIS=3;
    state.skill={ name:'Onde arcanique', cooldown:3, cd:0, use:(e)=>{ const dmg=rng.between(3,8); e.hp-=dmg; e.dotChance=Math.min(0.6,(e.dotChance||0)+0.15); write(`🔮 Onde arcanique : -${dmg} PV`,'good'); } };
    startAdventure();
  });
}

// === État initial ===
function initialState(){
  return {
    name:"Eldarion", cls:"—",
    attrs:{STR:1,AGI:1,WIS:1},
    hp:22, hpMax:22, gold:12,
    level:1, xp:0, rep:0,
    day:1, time:"Aube",
    location:"Lisière de la forêt de Mirval",
    locationKey:"clairiere",
    inventory:[{name:"Vieille épée", desc:"+1 attaque"},{name:"Petite armure", desc:"+1 armure"}],
    potions:1, status:[],
    flags:{
      metHerbalist:false, metSmith:false, peasantSaved:false,
      fragments:0, frag1:false, frag2:false, frag3:false,
      bossUnlocked:false, torch:false, oracleSeen:false,
      ruinsUnlocked:true, villageUnlocked:true,
      rumors:0, charm:0, herbalistTrust:0, herbalGift:false,
      smithLevel:1, smithXp:0,
      guardQuest:false, smugglerQuest:false
    },
    quests:{
      main:{title:'Le Chef Bandit',state:'En cours'},
      side:[],
      artifacts:{title:'Fragments d’artefact (0/3)',state:'En cours'}
    },
    achievements:{},
    lastLabels:[],
    inCombat:false, enemy:null,
    skill:{name:"", cooldown:0, cd:0, use:()=>{}}
  };
}
let state = initialState();

// === SETUP / DÉMARRAGE ===
function setup(isNew=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();
  const classesValides = ['Guerrier','Voleur','Paladin','Rôdeur','Mystique'];
  const needsClass = !state.cls || state.cls === '—' || !classesValides.includes(state.cls);
  if (isNew || ui.log.childElementCount===0 || needsClass){ write("v10 — Démarrage. Choisis ta classe.","sys"); chooseClass(); return; }
  explore(true);
}
function startAdventure(){ ui.log.innerHTML=""; write("L'aventure commence !","info"); setStats(); explore(true); }
function gameOver(){ state.inCombat=false; write("<b>☠️ Tu t'effondres… La forêt de Mirval se referme sur ton destin.</b>","bad"); clearChoices(); addChoice("Recommencer", ()=>{ state=initialState(); ui.log.innerHTML=""; setup(true); }, true); }

// Cooldown de compétence à chaque exploration
const _explore = explore;
explore = function(...args){ if(state.skill && typeof state.skill.cd==='number'){ state.skill.cd = Math.max(0, state.skill.cd-1); } _explore(...args); };

// (Optionnel) PWA
if('serviceWorker' in navigator){ window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js').catch(()=>{})); }

// Boot DOM-safe
(function boot(){ if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>setup(true), { once:true }); else setup(true); })();
