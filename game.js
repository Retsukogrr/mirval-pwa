// === Aventurier de Mirval — game.js (v10 Refonte Cendres) ===
console.log("game.js v10 — Refonte Cendres de Mirval");

// =============== QoL mobile (écran éveillé) ===============
let wakeLock;
async function keepAwake(){ try{ wakeLock = await navigator.wakeLock.request('screen'); } catch(e){} }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && 'wakeLock' in navigator) keepAwake(); });
if('wakeLock' in navigator) keepAwake();

// =============== RNG (seed affichée) ===============
const rng = (() => {
  const seed = (crypto.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]^Date.now():Date.now())>>>0;
  let s = seed>>>0;
  function rand(){ s^=s<<13; s>>>=0; s^=s>>17; s>>>=0; s^=s<<5; s>>>=0; return (s>>>0)/0xFFFFFFFF; }
  function between(min,max){ return Math.floor(rand()*(max-min+1))+min; }
  return {rand, between, seed};
})();
const seedEl = document.getElementById('seedInfo'); if(seedEl) seedEl.textContent = `seed ${rng.seed}`;

// =============== Références UI ===============
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
  aFOR: document.getElementById('a-str'),
  aAGI: document.getElementById('a-agi'),
  aSAG: document.getElementById('a-wis'),
  rep: document.getElementById('rep'),
  repLabel: document.getElementById('rep-label'),
  quests: document.getElementById('quests'),
};

// =============== Visuels (SVG inline) ===============
function svgIcon(kind){
  // kind ex: place:village, npc:smith, enemy:wolf, boss:cinder
  const base = 'width:64px;height:64px;display:block;margin:6px auto;opacity:.95;';
  const wrap = (p)=>`<svg viewBox="0 0 64 64" style="${base}" xmlns="http://www.w3.org/2000/svg">${p}</svg>`;
  switch(kind){
    case 'place:village': return wrap(`<rect x="2" y="28" width="60" height="30" fill="#2b3347" stroke="#44516d"/><polygon points="2,28 32,8 62,28" fill="#556487"/><rect x="26" y="40" width="12" height="18" fill="#202636"/>`);
    case 'place:forest': return wrap(`<rect x="0" y="44" width="64" height="20" fill="#1f2a35"/><circle cx="20" cy="34" r="12" fill="#274b3b"/><circle cx="38" cy="30" r="14" fill="#2f6049"/><rect x="18" y="44" width="4" height="20" fill="#2b1f14"/><rect x="36" y="44" width="4" height="20" fill="#2b1f14"/>`);
    case 'place:hills': return wrap(`<path d="M0,48 C10,36 22,36 32,48 C40,38 52,38 64,48 L64,64 L0,64 Z" fill="#39465f"/>`);
    case 'place:swamp': return wrap(`<rect x="0" y="48" width="64" height="16" fill="#24343b"/><ellipse cx="32" cy="52" rx="26" ry="8" fill="#2a5255"/><line x1="10" y1="24" x2="10" y2="48" stroke="#466b6d" stroke-width="2"/><line x1="14" y1="22" x2="14" y2="48" stroke="#466b6d" stroke-width="2"/>`);
    case 'place:ruins': return wrap(`<rect x="10" y="30" width="44" height="24" fill="#3b3f4a"/><rect x="16" y="36" width="8" height="18" fill="#2b2f3a"/><rect x="40" y="36" width="8" height="18" fill="#2b2f3a"/><rect x="30" y="38" width="4" height="16" fill="#2b2f3a"/>`);
    case 'place:observatory': return wrap(`<circle cx="32" cy="26" r="12" fill="#4b5a88"/><rect x="16" y="34" width="32" height="20" fill="#2a3048"/><line x1="32" y1="14" x2="50" y2="6" stroke="#9fb5f5" stroke-width="3"/>`);
    case 'place:islet': return wrap(`<ellipse cx="32" cy="52" rx="28" ry="8" fill="#285876"/><ellipse cx="32" cy="50" rx="12" ry="5" fill="#4b7c4b"/>`);
    case 'place:camp': return wrap(`<polygon points="12,50 32,18 52,50" fill="#6a4730"/><line x1="12" y1="50" x2="52" y2="50" stroke="#2e2118" stroke-width="3"/>`);
    case 'place:sanctum': return wrap(`<circle cx="32" cy="32" r="20" fill="#3a2f49"/><path d="M22 44 L32 20 L42 44 Z" fill="#8651c0"/>`);
    case 'npc:smith': return wrap(`<rect x="12" y="36" width="40" height="18" fill="#2b2f3a"/><rect x="26" y="20" width="12" height="16" fill="#3f4759"/><rect x="30" y="42" width="4" height="8" fill="#8c6a2b"/>`);
    case 'npc:herbalist': return wrap(`<circle cx="22" cy="36" r="10" fill="#3a6b4a"/><rect x="32" y="28" width="14" height="18" fill="#2a3b2a"/>`);
    case 'npc:trader': return wrap(`<rect x="10" y="28" width="44" height="20" fill="#3d4357"/><rect x="14" y="24" width="36" height="8" fill="#5a6282"/>`);
    case 'npc:hermit': return wrap(`<circle cx="24" cy="36" r="10" fill="#6b5e4b"/><rect x="34" y="28" width="12" height="18" fill="#3a3026"/>`);
    case 'npc:bard': return wrap(`<circle cx="24" cy="34" r="10" fill="#5b3a6b"/><line x1="36" y1="24" x2="50" y2="50" stroke="#a98ddb" stroke-width="3"/>`);
    case 'npc:militia': return wrap(`<rect x="20" y="24" width="24" height="28" fill="#3b4b6a"/><rect x="28" y="36" width="8" height="16" fill="#2a354a"/>`);
    case 'enemy:wolf': return wrap(`<path d="M8,44 L24,36 L40,44 L56,40 L48,48 L8,48 Z" fill="#4b5568"/>`);
    case 'enemy:bandit': return wrap(`<rect x="10" y="34" width="44" height="14" fill="#5a4032"/><rect x="20" y="28" width="8" height="8" fill="#2a2522"/><rect x="36" y="28" width="8" height="8" fill="#2a2522"/>`);
    case 'enemy:boar': return wrap(`<ellipse cx="28" cy="40" rx="16" ry="10" fill="#6b5140"/><rect x="42" y="36" width="10" height="6" fill="#7b604d"/>`);
    case 'enemy:harpy': return wrap(`<path d="M16,40 C24,20 40,20 48,40 L48,48 L16,48 Z" fill="#6b6fa4"/>`);
    case 'enemy:ghoul': return wrap(`<rect x="20" y="26" width="24" height="20" fill="#4a6b6a"/><circle cx="28" cy="34" r="3" fill="#d4f7ff"/><circle cx="36" cy="34" r="3" fill="#d4f7ff"/>`);
    case 'enemy:specter': return wrap(`<path d="M22,20 C32,10 42,20 42,32 C42,46 32,48 28,56 C24,48 22,46 22,32 Z" fill="#7aa0ff"/>`);
    case 'boss:ruinlord': return wrap(`<rect x="16" y="20" width="32" height="28" fill="#5a5f78"/><path d="M16,20 L32,8 L48,20 Z" fill="#7b809a"/>`);
    case 'boss:cinder': return wrap(`<circle cx="32" cy="32" r="18" fill="#9b3f2b"/><path d="M20,40 L44,40 L32,20 Z" fill="#ff7a57"/>`);
    default: return wrap(`<circle cx="32" cy="32" r="10" fill="#607d8b"/>`);
  }
}
function showVisual(kind){
  const p=document.createElement('p');
  p.innerHTML = svgIcon(kind);
  ui.log.appendChild(p);
  ui.log.scrollTop=ui.log.scrollHeight;
}

// =============== UI helpers ===============
function write(t, cls=""){ const p=document.createElement('p'); if(cls) p.classList.add(cls); p.innerHTML=t; ui.log.appendChild(p); ui.log.scrollTop=ui.log.scrollHeight; }
function clearChoices(){ ui.choices.innerHTML=""; }
function addChoice(label, handler, primary=false){
  const btn=document.createElement('button');
  if(primary) btn.classList.add('btn-primary');
  btn.textContent = label;
  btn.addEventListener('click', ()=>{
    if(btn.disabled) return;
    btn.disabled = true; // anti double-clic local
    try{ handler(); }catch(e){ console.error(e); write(`⚠️ ${e.message}`,'warn'); }
  });
  ui.choices.appendChild(btn);
}
function repText(n){return n>=30?'Vertueux':n<=-30?'Sombre':'Neutre'}

// =============== Équipement & stats ===============
function totalMod(key){ return (state.equipped||[]).reduce((a,it)=>a+(it.mods&&it.mods[key]||0),0); }
function effFOR(){ return state.attrs.FOR + totalMod('FOR'); }
function effAGI(){ return state.attrs.AGI + totalMod('AGI'); }
function effSAG(){ return state.attrs.SAG + totalMod('SAG'); }
function effDEF(){ return 10 + totalMod('DEF') + (state.cls==='Paladin'?1:0) + (effAGI()>=3?1:0); }

function equip(item){
  const slot = item.slot||'misc';
  const prev = state.equipped.find(i=>i.slot===slot);
  if(prev){ state.inventory.push(prev); state.equipped = state.equipped.filter(i=>i!==prev); }
  state.equipped.push(item);
  state.inventory = state.inventory.filter(i=>i!==item);
  setStats();
  write(`Équipé : <b>${item.name}</b> [${slot}]`,'info');
}
function autoEquip(item){
  const slot = item.slot;
  if(!slot){ state.inventory.push(item); return; }
  const prev = state.equipped.find(i=>i.slot===slot);
  const score = it => (it.mods?.FOR||0)+(it.mods?.DEF||0)+(it.mods?.AGI||0)+(it.mods?.SAG||0);
  if(!prev || score(item)>score(prev)){ state.inventory.push(item); equip(item); }
  else { state.inventory.push(item); }
}

// =============== Affichage ===============
function setStats(){
  ui.hp.textContent = state.hp; ui.hpmax.textContent = state.hpMax;
  ui.hpbar.style.width = Math.max(0,Math.min(100,Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent = state.gold; ui.lvl.textContent = state.level; ui.xp.textContent = state.xp;
  ui.status.textContent = state.status.length? state.status.map(s=>s.name).join(', ') : '—';
  ui.pclass.textContent = state.cls; ui.pname.textContent = state.name;
  ui.aFOR.textContent = effFOR(); ui.aAGI.textContent = effAGI(); ui.aSAG.textContent = effSAG();
  ui.rep.textContent = state.rep; ui.repLabel.textContent = repText(state.rep);

  ui.inv.innerHTML="";
  const eqTitle=document.createElement('div'); eqTitle.className='stat'; eqTitle.innerHTML='<b>Équipé</b><span>—</span>'; ui.inv.appendChild(eqTitle);
  (state.equipped||[]).forEach(it=>{
    const d=document.createElement('div'); d.className='stat';
    const mods = it.mods ? Object.entries(it.mods).map(([k,v])=>`${v>0?'+':''}${v} ${k}`).join(', ') : '';
    d.innerHTML = `<b>${it.name}</b><span>${it.desc}${mods?` — ${mods}`:''} [${it.slot}]</span>`;
    ui.inv.appendChild(d);
  });
  const invTitle=document.createElement('div'); invTitle.className='stat'; invTitle.innerHTML='<b>Sac</b><span>—</span>'; ui.inv.appendChild(invTitle);
  state.inventory.forEach(it=>{
    const d=document.createElement('div'); d.className='stat';
    const mods = it.mods ? Object.entries(it.mods).map(([k,v])=>`${v>0?'+':''}${v} ${k}`).join(', ') : '';
    d.innerHTML = `<b>${it.name}</b><span>${it.desc}${mods?` — ${mods}`:''}${it.slot?` [${it.slot}]`:''}</span>`;
    ui.inv.appendChild(d);
  });

  ui.quests.innerHTML='';
  const mq=document.createElement('div'); mq.className='stat'; mq.innerHTML=`<b>${state.quests.main.title}</b><span>${state.quests.main.state}</span>`; ui.quests.appendChild(mq);
  const rq=document.createElement('div'); rq.className='stat'; rq.innerHTML=`<b>Reliques</b><span>${state.flags.relicWarrior? 'Guerrier ✓' : 'Guerrier ✗'} | ${state.flags.relicSage? 'Sage ✓' : 'Sage ✗'} | ${state.flags.relicWater? 'Eau ✓' : 'Eau ✗'}</span>`; ui.quests.appendChild(rq);
  state.quests.side.forEach(q=>{ const x=document.createElement('div'); x.className='stat'; x.innerHTML=`<b>${q.title}</b><span>${q.state}</span>`; ui.quests.appendChild(x); });
}

// =============== Core helpers ===============
function d20(mod=0){ const r=rng.between(1,20); const t=r+mod; ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${r} = ${t}`; return {roll:r,total:t}; }
function heal(n){ state.hp=Math.min(state.hpMax,state.hp+n); setStats(); write(`+${n} PV`,'good'); }
function damage(n,src=""){ state.hp=Math.max(0,state.hp-n); setStats(); write(`-${n} PV ${src?`(${src})`:''}`,'bad'); if(state.hp<=0){ gameOver(); return true; } return false; }
function changeGold(n){ state.gold=Math.max(0,state.gold+n); setStats(); write(`Or ${n>=0?'+':''}${n}`,(n>=0)?'good':'warn'); }
function gainXP(n){ state.xp+=n; const need=20+(state.level-1)*15; write(`XP +${n} (total ${state.xp}/${need})`,'info'); if(state.xp>=need){ state.level++; state.xp=0; state.hpMax+=5; state.hp=state.hpMax; write(`<b>Niveau ${state.level} !</b> PV max +5, PV restaurés.`,'good'); } setStats(); }
function addItem(name,desc,mods={},value=4,slot=null){ const it={name,desc,mods,value,slot}; autoEquip(it); write(`Tu obtiens <b>${name}</b>.`,'good'); }
function hasItem(name){ return state.inventory.some(i=>i.name===name) || state.equipped.some(i=>i.name===name); }
function removeFromCollections(name){
  let i = state.inventory.findIndex(x=>x.name===name);
  if(i>=0){ state.inventory.splice(i,1); return true; }
  i = state.equipped.findIndex(x=>x.name===name);
  if(i>=0){ state.equipped.splice(i,1); return true; }
  return false;
}
function rep(n){ state.rep+=n; setStats(); }

// =============== Statuts récurrents ===============
function tickStatus(){
  state.status = state.status.filter(st=>{
    if(st.type==='poison'){ const d=rng.between(1,2); damage(d,'Poison'); st.dur--; }
    if(st.type==='bleed'){ const d=2; damage(d,'Saignement'); st.dur--; }
    if(st.type==='slow'){ st.dur--; if(st.dur===0) write('💨 Tu te sens plus léger.','info'); }
    return st.dur>0 && state.hp>0;
  });
}

// =============== Combat ===============
function playerAtkMod(){ let m=0; if(state.cls==='Guerrier') m+=2; if(effFOR()>=3) m+=1; if(hasItem('Épée affûtée')) m+=1; return m; }
function playerDef(){ return effDEF(); }
function terrainPenalty(){ return state.locationKey==='marais' ? -1 : 0; }

function combat(mon){
  clearChoices();
  state.inCombat=true;
  state.enemy=JSON.parse(JSON.stringify(mon));
  showVisual(mon.icon || 'enemy:bandit');
  write(`<b>${mon.name}</b> apparaît ! ❤️ ${mon.hp} — CA ${mon.ac||12}`,'warn');
  combatTurn();
}
function combatTurn(){
  if(!state.inCombat) return;
  if(state.hp<=0){ gameOver(); return; }
  if(state.enemy.hp<=0){ write(`<b>${state.enemy.name} est vaincu !</b>`,'good'); afterCombat(); return; }

  clearChoices();
  const e=state.enemy;
  addChoice('⚔️ Attaquer', ()=> aimMenu(), true);
  addChoice('🛡️ Parer', ()=>{
    const bonus=(state.cls==='Rôdeur'?2:1);
    const atk=d20(e.hitMod||3).total; const armor=playerDef()+bonus;
    if(atk>=armor){ const dmg=Math.max(0,rng.between(1,3+(e.tier||2))-2-bonus); write(`Parade partielle, -${dmg} PV`,'warn'); damage(dmg,e.name); }
    else write('Tu pares complètement !','good');
    enemyAttack(); combatTurn();
  });
  addChoice('✨ Compétence', ()=>{
    if(state.skill.cd){ write('Compétence en recharge.','warn'); return combatTurn(); }
    state.skill.use(e); state.skill.cd=state.skill.cooldown;
    if(e.hp>0) enemyAttack();
    combatTurn();
  });
  addChoice(`🧪 Potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write('Plus de potions.','warn'); return combatTurn(); }
    state.potions--; heal(rng.between(8,12)); enemyAttack(); combatTurn();
  });
  addChoice('🏃 Fuir', ()=>{
    const r=d20(effAGI()>=3?2:0).total;
    if(r>=14){ write('Tu fuis le combat.','sys'); state.inCombat=false; state.enemy=null; explore(); }
    else { write('Échec de fuite !','bad'); enemyAttack(); combatTurn(); }
  });
}
function aimMenu(){
  clearChoices(); const e=state.enemy;
  addChoice('🎯 Viser la tête', ()=>{
    const r=d20(playerAtkMod()-2+terrainPenalty()).total;
    if(r>=(e.ac||12)+2){ const dmg=rng.between(6,10); e.hp-=dmg; write(`🎯 Tête : -${dmg} PV`,'good'); }
    else write('Tu manques.','warn');
    enemyAttack(); combatTurn();
  }, true);
  addChoice('🗡️ Viser le torse', ()=>{
    const r=d20(playerAtkMod()+terrainPenalty()).total;
    if(r>=(e.ac||12)){ const dmg=rng.between(3,7); e.hp-=dmg; write(`🗡️ Torse : -${dmg} PV`,'good'); }
    else write('Tu manques.','warn');
    enemyAttack(); combatTurn();
  });
  addChoice('🦵 Viser les jambes', ()=>{
    const r=d20(playerAtkMod()+1+terrainPenalty()).total;
    if(r>=(e.ac||12)-1){ const dmg=rng.between(2,5); e.hp-=dmg; state.status.push({type:'slow',name:'Ralentissement',dur:2}); write(`🦵 Jambes : -${dmg} PV (ralenti)`,'good'); }
    else write('Tu manques.','warn');
    enemyAttack(); combatTurn();
  });
  addChoice('↩️ Annuler', combatTurn);
}
function enemyAttack(){
  const e=state.enemy; const roll=d20(e.hitMod||3).total; const def=playerDef()+terrainPenalty();
  if(roll>=def){
    const dmg=rng.between(1,(e.tier||2)+3);
    if(e.name.includes('Bandit') && rng.rand()<0.2){ changeGold(-1); write('🪙 Le bandit te détrousse !','warn'); }
    damage(dmg,e.name);
    if(e.dotChance && rng.rand()<e.dotChance){
      if(e.dotType==='poison') state.status.push({type:'poison',name:'Poison',dur:rng.between(2,4)});
      if(e.dotType==='bleed')  state.status.push({type:'bleed', name:'Saignement',dur:rng.between(2,4)});
      write('⚠️ Un mal te ronge !','warn');
    }
  } else write(`${e.name} rate son attaque.`,'info');
  tickStatus();
}
function afterCombat(){
  const e=state.enemy; state.inCombat=false; state.enemy=null;
  const gold=rng.between(e.tier||1, (e.tier||2)*3); const xp=rng.between((e.tier||1)*3, (e.tier||2)*6);
  changeGold(gold); gainXP(xp);
  const r=rng.rand();
  if(r<0.18 && !hasItem('Épée affûtée')) addItem('Épée affûtée','Lame affûtée',{FOR:+1},6,'weapon');
  else if(r<0.30 && !hasItem('Bouclier en bois')) addItem('Bouclier en bois','Planche solide',{DEF:+1},5,'shield');
  else if(r<0.42) { state.potions++; write('Tu trouves une potion.','good'); }
  else if(r<0.50 && !hasItem('Cuir renforcé')) addItem('Cuir renforcé','Cuir robuste',{DEF:+2},8,'armor');

  if(e.name.includes('Bandit')){ state.factions.outlaws = (state.factions.outlaws||0)-2; state.flags.rumors = (state.flags.rumors||0)+1; if(state.flags.rumors>=3 && !state.flags.campKnown){ state.flags.campKnown = true; write('🗡️ Tu localises le camp des Bandits.','info'); } }
  explore();
}

// =============== Bestiaire ===============
const mobs = {
  wolf: ()=>({ name:'Loup affamé', hp:10, maxHp:10, ac:11, hitMod:2, tier:1, icon:'enemy:wolf' }),
  bandit: ()=>({ name:'Bandit des fourrés', hp:12, maxHp:12, ac:12, hitMod:3, tier:2, dotChance:0.1, dotType:'bleed', icon:'enemy:bandit' }),
  boar:  ()=>({ name:'Sanglier irascible', hp:11, maxHp:11, ac:11, hitMod:2, tier:1, dotChance:0.05, dotType:'bleed', icon:'enemy:boar' }),
  harpy: ()=>({ name:'Harpie du vent', hp:14, maxHp:14, ac:13, hitMod:4, tier:2, dotChance:0.2, dotType:'bleed', icon:'enemy:harpy' }),
  ghoul: ()=>({ name:'Goule des roseaux', hp:13, maxHp:13, ac:12, hitMod:3, tier:2, dotChance:0.25, dotType:'poison', icon:'enemy:ghoul' }),
  specter: ()=>({ name:'Spectre antique', hp:15, maxHp:15, ac:13, hitMod:4, tier:2, dotChance:0.2, dotType:'poison', icon:'enemy:specter' }),
  ruinLord: ()=>({ name:'Seigneur des Ruines', hp:28, maxHp:28, ac:15, hitMod:6, tier:4, icon:'boss:ruinlord' }),
  cinderLord: ()=>({ name:'Seigneur des Cendres', hp:30, maxHp:30, ac:15, hitMod:6, tier:4, dotChance:0.25, dotType:'bleed', icon:'boss:cinder' })
};
// =============== Boss helpers ===============
function combatRuinLord(){ showVisual('boss:ruinlord'); write('🗿 Les pierres vibrent… le Seigneur des Ruines s’éveille.','warn'); combat(mobs.ruinLord()); }
function combatCinderLord(){ showVisual('boss:cinder'); write('🔥 Les braises s’embrasent — le Seigneur des Cendres apparaît.','warn'); combat(mobs.cinderLord()); }

// =============== Temps & monde ===============
function setTime(){
  const slots=['Aube','Matin','Midi','Après-midi','Crépuscule','Nuit'];
  const i=slots.indexOf(state.time); let n=(i+1)%slots.length; if(n===0){ state.day++; onNewDay(); }
  state.time=slots[n]; ui.day.textContent=`Jour ${state.day} — ${state.time}`;
}
function onNewDay(){
  state.daily.herbalist = true;
  state.daily.smith = true;
  state.daily.trader = true;
}
function continueBtn(){ clearChoices(); addChoice('Continuer', ()=>explore(), true); }
function gotoZone(key){
  state.locationKey=key;
  state.location = key==='village'?"Lisière de Mirval":
                   key==='foret'?"Forêt profonde":
                   key==='collines'?"Collines de Rocfauve":
                   key==='marais'?"Marais de Vire-Saule":
                   key==='ruines'?"Ruines oubliées":
                   key==='observatoire'?"Tour de l’Observatoire":
                   key==='ilot'?"Îlot du lac":
                   key==='camp'?"Camp des Bandits":
                   key==='sanctuaire'?"Sanctuaire des Cendres":"Mirval";
  const placeMap = {
    village:'place:village', foret:'place:forest', collines:'place:hills', marais:'place:swamp',
    ruines:'place:ruins', observatoire:'place:observatory', ilot:'place:islet', camp:'place:camp', sanctuaire:'place:sanctum'
  };
  showVisual(placeMap[key]||'place:village');
  write(`👉 Tu te diriges vers <b>${state.location}</b>.`,'sys'); explore(true);
}
function pickWeighted(items, k){
  const recent = new Set(state.lastLabels);
  let pool = items.flatMap(it=>Array((it.w||1)).fill(it)).filter(it=>!recent.has(it.label));
  if(pool.length<k) pool = items.flatMap(it=>Array((it.w||1)).fill(it));
  const out=[]; for(let i=0;i<k && pool.length;i++){ const idx=Math.floor(rng.rand()*pool.length); out.push(pool[idx]); pool.splice(idx,1); }
  state.lastLabels = [...out.map(o=>o.label), ...state.lastLabels].slice(0,8);
  return out;
}

// =============== Actions génériques ===============
function searchArea(){
  const bonus = effSAG()>=3?1:0;
  const {total}=d20(bonus);
  if(total>=18){ write('🔑 Coffre scellé repéré.','good'); chest(); }
  else if(total>=12){ write('✨ Quelques pièces sous une pierre.','good'); changeGold(rng.between(2,6)); }
  else if(total>=8){ write('Des traces fraîches… une rencontre approche.'); randomEncounter(); }
  else { write('Aïe ! Ronce traîtresse.','bad'); damage(rng.between(1,3),'Ronces'); }
  continueBtn();
}
function rest(){
  if(rng.rand()<0.35){ write('Quelque chose approche pendant ton repos…','warn'); randomEncounter(); }
  else { heal(rng.between(4,8)); write('Tu dors un peu. Ça fait du bien.','good'); }
  continueBtn();
}
function useItemMenu(){
  clearChoices();
  addChoice(`Boire une potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Tu n'as pas de potion.",'warn'); return continueBtn(); }
    state.potions--; heal(rng.between(8,12)); continueBtn();
  }, true);
  addChoice('Annuler', ()=>explore());
}
function chest(){
  const r=rng.between(1,100);
  if(r>90){ addItem('Bouclier en fer','Bouclier solide',{DEF:+2},9,'shield'); }
  else if(r>70){ state.potions++; write('Tu trouves une potion.','good'); }
  else if(r>40){ changeGold(rng.between(7,15)); }
  else { write('💥 Piège !','bad'); damage(rng.between(3,6),'Piège'); }
}
function randomEncounter(){
  const zone=state.locationKey;
  const pCombat = (zone==='village'?0: zone==='foret'?0.6 : zone==='collines'?0.6 : zone==='marais'?0.65 : zone==='ruines'?0.7 : 0.5);
  if(rng.rand()<pCombat){
    if(zone==='marais') combat(mobs.ghoul());
    else if(zone==='foret') combat(rng.rand()<0.5?mobs.wolf():mobs.bandit());
    else if(zone==='collines') combat(rng.rand()<0.5?mobs.boar():mobs.harpy());
    else if(zone==='ruines') combat(rng.rand()<0.7?mobs.bandit():mobs.specter());
    else combat(mobs.wolf());
  }else{
    const bag = [eventHerbalist,eventSmith,eventTrader,eventHermit,eventBard,eventSanctuary,eventOldMap];
    bag[rng.between(0,bag.length-1)]();
  }
}

// =============== PNJ / Économie / Événements ===============
function priceWithRep(base, factionKey){
  const rep = state.factions[factionKey]||0;
  const mult = rep>=15?0.85 : rep<=-15?1.25 : 1;
  return Math.max(1, Math.round(base*mult));
}
function eventHerbalist(){
  if(state.locationKey==='village'){ showVisual('npc:herbalist'); }
  showVisual('npc:herbalist');
  if(!state.daily.herbalist){ write("🌿 L’herboriste n’est plus là pour aujourd’hui.",'info'); return continueBtn(); }
  write('🌿 Une herboriste te fait signe. Parfum de menthe.');
  clearChoices();
  addChoice(`Tisane (soin) — ${priceWithRep(3,'sanctum')} or`, ()=>{
    const cost=priceWithRep(3,'sanctum');
    if(state.gold>=cost){ changeGold(-cost); heal(rng.between(6,12)); state.factions.sanctum+=1; state.daily.herbalist=false; }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  }, true);
  addChoice(`Potion — ${priceWithRep(4,'sanctum')} or`, ()=>{
    const cost=priceWithRep(4,'sanctum');
    if(state.gold>=cost){ changeGold(-cost); state.potions++; state.factions.sanctum+=1; state.daily.herbalist=false; write("Tu obtiens une potion.",'good'); }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  });
  addChoice('Partir', continueBtn);
}
function eventSmith(){
  showVisual('npc:smith');
  if(!state.daily.smith){ write("⚒️ Le forgeron range ses outils pour aujourd’hui.",'info'); return continueBtn(); }
  write('⚒️ Un forgeron affûte une lame sur une enclume portative.');
  clearChoices();
  addChoice(`Améliorer arme (+1 FOR) — ${priceWithRep(6,'townsfolk')} or`, ()=>{
    const cost=priceWithRep(6,'townsfolk');
    if(state.gold>=cost){ changeGold(-cost); addItem('Épée affûtée','Lame affûtée',{FOR:+1},6,'weapon'); state.factions.townsfolk+=1; state.daily.smith=false; }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  }, true);
  addChoice(`Bouclier en fer (+2 DEF) — ${priceWithRep(8,'townsfolk')} or`, ()=>{
    const cost=priceWithRep(8,'townsfolk');
    if(state.gold>=cost){ changeGold(-cost); addItem('Bouclier en fer','Acier cabossé',{DEF:+2},8,'shield'); state.factions.townsfolk+=1; state.daily.smith=false; }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  });
  addChoice('Discuter (+réputation Bourgeois)', ()=>{ state.factions.townsfolk+=2; write("Il t’indique des sentiers sûrs.",'info'); state.daily.smith=false; continueBtn(); });
}
function sellMenu(){
  clearChoices();
  const vendables = [...state.inventory, ...state.equipped].filter(it=>!['Barque','Relique du Guerrier','Relique du Sage','Relique de l’Eau'].includes(it.name));
  if(vendables.length===0){ write("Tu n’as rien à vendre.",'info'); return continueBtn(); }
  vendables.forEach(it=>{
    const base = Math.max(1, Math.floor((it.value||4)/2));
    const price = priceWithRep(base,'townsfolk');
    addChoice(`Vendre ${it.name} (${price} or)`, ()=>{ if(removeFromCollections(it.name)){ changeGold(price); write(`Tu vends ${it.name}.`,'good'); } sellMenu(); });
  });
  addChoice('Terminer', continueBtn, true);
}
function eventTrader(){
  showVisual('npc:trader');
  if(!state.daily.trader){ write("🧳 Le colporteur a plié bagage pour aujourd’hui.",'info'); return continueBtn(); }
  write('🧳 Un colporteur déroule son tapis. "Tout a un prix."');
  clearChoices();
  addChoice(`Torche — ${priceWithRep(5,'townsfolk')} or`, ()=>{
    const cost=priceWithRep(5,'townsfolk');
    if(state.gold>=cost){ changeGold(-cost); state.flags.torch=true; addItem('Torche','Permet d’explorer les ruines sombres',{},2,null); state.factions.townsfolk+=1; state.daily.trader=false; write('Tu obtiens une torche.','good'); }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  }, true);
  addChoice(`Barque — ${priceWithRep(9,'townsfolk')} or`, ()=>{
    const cost=priceWithRep(9,'townsfolk');
    if(state.gold>=cost){ changeGold(-cost); state.flags.boat=true; addItem('Barque','Permet d’atteindre l’îlot du lac',{},6,null); state.factions.townsfolk+=1; state.daily.trader=false; write('Tu obtiens une petite barque pliable.','good'); }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  });
  addChoice('Vendre un objet', ()=> sellMenu());
  addChoice('Partir', continueBtn);
}
function eventBard(){
  showVisual('npc:bard');
  write('🎻 Un barde sourit : "Une chanson contre deux pièces ?"');
  clearChoices();
  addChoice('Écouter (2 or)', ()=>{
    if(state.gold>=2){ changeGold(-2); if(rng.rand()<0.7){ heal(rng.between(3,7)); write('La mélodie t’apaise.','good'); } else write('Belle chanson… mais chère.','info'); state.factions.townsfolk+=1; }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  }, true);
  addChoice('L’ignorer', continueBtn);
}
function eventHermit(){
  showVisual('npc:hermit');
  write('🧙 Un ermite t’observe au détour d’un sentier.');
  clearChoices();
  addChoice('Accepter sa décoction', ()=>{
    if(rng.rand()<0.6){ heal(rng.between(5,10)); gainXP(3); }
    else damage(rng.between(2,5),'Nausée');
    continueBtn();
  }, true);
  addChoice('Breloque (5 or)', ()=>{
    const cost=priceWithRep(5,'sanctum');
    if(state.gold>=cost){ changeGold(-cost); addItem("Breloque d'ermite","Chance & clairvoyance",{SAG:+1},5,'charm'); state.factions.sanctum+=1; }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  });
  addChoice('Refuser', continueBtn);
}
function eventSanctuary(){
  showVisual('place:sanctum');
  write('⛪ Un ancien sanctuaire, couvert de mousse.');
  clearChoices();
  addChoice('Prier', ()=>{
    const night=(state.time==='Nuit'||state.time==='Crépuscule');
    const {total}=d20(); const t=total+(night?1:0);
    if(t>=15){ heal(rng.between(6,12)); rep(+2); state.factions.sanctum+=2; state.flags.sanctuaryFavor=true; write('Une lueur chaude te traverse.','good'); }
    else { damage(rng.between(2,6),'Présage'); rep(-1); state.factions.sanctum-=1; }
    continueBtn();
  }, true);
  addChoice('Profaner', ()=>{
    const {total}=d20(-1);
    if(total>=16){ changeGold(rng.between(8,16)); rep(-3); state.factions.sanctum-=4; }
    else { damage(rng.between(4,7),'Malédiction'); rep(-5); state.factions.sanctum-=5; }
    continueBtn();
  });
  addChoice('Partir', continueBtn);
}
function eventOldMap(){
  if(state.flags.mapFound){ write('Une vieille souche… rien.'); return continueBtn(); }
  write('🗺️ Sous une pierre, une vieille carte griffonnée !','info');
  clearChoices();
  addChoice('Étudier la carte', ()=>{ state.flags.mapFound=true; state.flags.ruinsUnlocked=true; write('Les Ruines oubliées sont indiquées…','good'); continueBtn(); }, true);
  addChoice('Laisser', continueBtn);
}
function eventPeasant(){
  write('🧑‍🌾 Un paysan enchaîné appelle à l’aide.');
  clearChoices();
  addChoice('Le libérer', ()=>{
    const {total}=d20(effFOR()>=3?2:0);
    if(total>=14){ write('Les chaînes cèdent.','good'); rep(+5); state.factions.townsfolk+=3; state.flags.peasantSaved=true; state.quests.side.push({title:'Le paysan reconnaissant',state:'En attente'}); }
    else damage(rng.between(1,4),'Effort');
    continueBtn();
  }, true);
  addChoice('L’ignorer', ()=>{ rep(-3); state.factions.townsfolk-=2; continueBtn(); });
}
function eventTrap(){ write('🪤 Une corde s’enroule à ta cheville !'); const {total}=d20(effAGI()>=3?2:0); if(total>=13) write('Tu t’en sors de justesse.','good'); else damage(rng.between(2,5),'Piège'); }
function eventRuins(){
  showVisual('place:ruins');
  write('🏚️ Des ruines englouties de lierre se dressent.');
  clearChoices();
  addChoice('Fouiller', ()=>{
    const {total}=d20(effSAG()>=3?1:0);
    if(total>=16){
      if(!state.flags.relicWarrior){ state.flags.relicWarrior=true; addItem('Relique du Guerrier','Fragment d’acier ancien',{},0,null); write('⚔️ Tu obtiens la <b>Relique du Guerrier</b>.','good'); }
      else changeGold(rng.between(4,9));
    } else if(total>=10){ chest(); }
    else { damage(rng.between(2,5),'Éboulement'); }
    continueBtn();
  }, true);
  addChoice('Partir', continueBtn);
}

// =============== Lieux uniques ===============
function eventObservatory(){
  showVisual('place:observatory');
  write('🔭 La Tour de l’Observatoire pointe vers un ciel tourmenté.');
  clearChoices();
  addChoice('Résoudre l’énigme des astres', ()=>{
    const {total}=d20(effSAG()>=3?2:0);
    if(total>=15){ state.flags.relicSage=true; addItem('Relique du Sage',"Poussière d'étoile",{},0,null); write('🌌 La voûte s’ouvre : <b>Relique du Sage</b> obtenue.','good'); }
    else { write('Un spectre jaillit des ombres !','warn'); combat(mobs.specter()); return; }
    continueBtn();
  }, true);
  addChoice('Observer le ciel (connaissance)', ()=>{ gainXP(4); continueBtn(); });
  addChoice('Partir', continueBtn);
}
function eventIslet(){
  showVisual('place:islet');
  if(!state.flags.boat){ write("Le lac t’empêche d’avancer. Il te faudrait une <b>barque</b>.","warn"); return continueBtn(); }
  write('🌊 Tu atteins l’îlot. Une lueur bleue pulse sous l’eau.');
  clearChoices();
  addChoice('Plonger prudemment', ()=>{
    const {total}=d20(effAGI()>=3?1:0);
    if(total>=13){ state.flags.relicWater=true; addItem('Relique de l’Eau','Perle azur',{},0,null); write('💧 Tu saisis la <b>Relique de l’Eau</b>.','good'); }
    else { write('Un esprit du lac te repousse !','warn'); combat(mobs.specter()); return; }
    continueBtn();
  }, true);
  addChoice('Chercher un coffre', ()=>{ chest(); continueBtn(); });
  addChoice('Partir', continueBtn);
}
function eventBanditCamp(){
  showVisual('place:camp');
  write('⛺ Le camp des bandits bruisse de voix. Torches et silhouettes armées.');
  clearChoices();
  addChoice('Infiltration (DEX)', ()=>{
    const {total}=d20(effAGI()>=3?2:0);
    if(total>=15){ write('Tu te faufiles entre les tentes.','good'); if(!state.flags.campLooted){ changeGold(rng.between(6,12)); state.flags.campLooted=true; } }
    else { write('Repéré !','bad'); combat(mobs.bandit()); return; }
    continueBtn();
  }, true);
  addChoice('Défier le Chef', ()=>{
    write('Un silence tombe sur le camp…','warn');
    combat({ ...mobs.bandit(), name:'Chef Bandit', hp:24, maxHp:24, ac:14, hitMod:5, tier:3, icon:'enemy:bandit', dotChance:0.2, dotType:'bleed' });
  });
  addChoice('Négocier (réputation sombre)', ()=>{
    if(state.rep<=-10){ changeGold(-3); state.factions.outlaws+=4; write('Ils acceptent ton “tribut”.','info'); }
    else write('Ils n’ont que faire de tes paroles.','warn');
    continueBtn();
  });
}
function eventSanctuaryCinders(){
  showVisual('place:sanctum');
  write('🔥 Au cœur du sanctuaire, des cendres tièdes tracent un cercle ancien.');
  clearChoices();
  addChoice('Invoquer le Seigneur des Cendres', ()=>{
    const alignment = state.rep>=20?'vertueux' : state.rep<=-20?'sombre' : 'neutre';
    if(alignment==='vertueux'){ write('La voix tonne : “Éprouvons ta résolution.”','info'); }
    else if(alignment==='sombre'){ write('“Je sens en toi la braise. Montre-moi ta force.”','info'); }
    else write('La cendre se lève en un tourbillon incandescent.','warn');
    combatCinderLord();
  }, true);
  addChoice('Prier (petit soin)', ()=>{ heal(rng.between(3,6)); continueBtn(); });
  addChoice('Partir', continueBtn);
}
// =============== Exploration (progression & gating) ===============
function maybeAdvanceMainQuest(){
  // Quête principale : Les Cendres de Mirval
  // Obtenir 3 reliques → accès Sanctuaire des Cendres
  if(state.flags.relicWarrior && state.flags.relicSage && state.flags.relicWater){
    if(!state.flags.cindersUnlocked){
      state.flags.cindersUnlocked = true;
      write('✨ Les trois reliques vibrent à l’unisson. Le Sanctuaire des Cendres t’appelle.','info');
      state.quests.main.state = 'Ouvrir le Sanctuaire des Cendres';
    }
  }
}
function zonePool(zone){
  const pool=[];
  if(zone==='village'){
    pool.push({label:'Voir le marchand', act:eventTrader, w:2});
    pool.push({label:'Voir le forgeron', act:eventSmith, w:2});
    pool.push({label:'Tavernier (barde)', act:eventBard, w:1});
    pool.push({label:'Sanctuaire du bourg', act:eventSanctuary, w:1});
  }
  if(zone==='foret'){
    pool.push({label:'Herboriste', act:eventHerbalist, w:2});
    pool.push({label:'Bandits embusqués', act:()=>combat(mobs.bandit()), w:3});
    pool.push({label:'Loup en maraude', act:()=>combat(mobs.wolf()), w:3});
    pool.push({label:'Piège forestier', act:()=>{ eventTrap(); continueBtn(); }, w:1});
  }
  if(zone==='collines'){
    pool.push({label:'Ermite des collines', act:eventHermit, w:2});
    pool.push({label:'Harpie criarde', act:()=>combat(mobs.harpy()), w:3});
    pool.push({label:'Sanglier', act:()=>combat(mobs.boar()), w:2});
    pool.push({label:'Ruines éparses (relique Guerrier)', act:eventRuins, w:2});
    pool.push({label:'Ancienne carte', act:eventOldMap, w:1});
  }
  if(zone==='marais'){
    pool.push({label:'Goule des roseaux', act:()=>combat(mobs.ghoul()), w:3});
    pool.push({label:'Prisonnier enchaîné', act:()=>{ if(!state.flags.peasantSaved) eventPeasant(); else { write('La berge est silencieuse.'); continueBtn(); } }, w:1});
    pool.push({label:'Sanctuaire moussu', act:eventSanctuary, w:1});
    pool.push({label:'Sol traître', act:()=>{ damage(rng.between(1,4),'Bourbier'); continueBtn(); }, w:1});
  }
  if(zone==='ruines'){
    pool.push({label:'Spectre antique', act:()=>combat(mobs.specter()), w:2});
    pool.push({label:'Couloir effondré', act:()=>{ damage(rng.between(1,4),'Éboulement'); continueBtn(); }, w:1});
    pool.push({label:'Salle scellée (boss mineur)', act:combatRuinLord, w:1});
    pool.push({label:'Vestiges (relique Guerrier si manquante)', act:eventRuins, w:2});
  }
  if(zone==='observatoire'){
    pool.push({label:'Monter au dôme', act:eventObservatory, w:3});
    pool.push({label:'Observer le ciel', act:()=>{ gainXP(3); continueBtn(); }, w:1});
  }
  if(zone==='ilot'){
    pool.push({label:'Plonger vers la lueur', act:eventIslet, w:3});
    pool.push({label:'Fouiller les algues', act:()=>{ chest(); continueBtn(); }, w:1});
  }
  if(zone==='camp'){
    pool.push({label:'Infiltrer le camp', act:eventBanditCamp, w:3});
    pool.push({label:'Provoquer un duel', act:()=>combat(mobs.bandit()), w:2});
  }
  if(zone==='sanctuaire'){
    pool.push({label:'Rituel des cendres', act:eventSanctuaryCinders, w:3});
    pool.push({label:'Se recueillir', act:()=>{ heal(rng.between(3,6)); continueBtn(); }, w:1});
  }
  return pool;
}
function navForZone(){
  const nav=[];
  const add=(label,key,cond=true)=>{ if(cond) nav.push({label, act:()=>gotoZone(key), w:1}); };
  add('→ Village', 'village', true);
  add('→ Forêt', 'foret', true);
  add('→ Collines', 'collines', true);
  add('→ Marais', 'marais', true);
  add('→ Ruines', 'ruines', state.flags.ruinsUnlocked);
  add('→ Observatoire', 'observatoire', (state.flags.relicWarrior||state.flags.relicSage));
  add('→ Îlot du lac', 'ilot', state.flags.boat);
  add('→ Camp des Bandits', 'camp', state.flags.campKnown);
  add('→ Sanctuaire des Cendres', 'sanctuaire', state.flags.cindersUnlocked);
  return nav;
}

function explore(initial=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();
  if(!initial) setTime();
  tickStatus(); if(state.hp<=0) return;

  maybeAdvanceMainQuest();

  // Oracle unique vers J5
  if(state.day>=5 && !state.flags.oracleSeen){ eventOracle(); return; }

  const zone = state.locationKey;

  const base = [
    { label:"Fouiller", act:searchArea, w:2 },
    { label:"Se reposer", act:rest, w:1 },
    { label:"Utiliser un objet", act:useItemMenu, w:1 },
    { label:"Rencontre immédiate", act:randomEncounter, w:2 }
  ];

  const pool = zonePool(zone);
  const nav = navForZone();

  const dyn = pickWeighted(pool, Math.min(3, pool.length||0));
  const candidates = [...base, ...dyn, ...nav];
  const shown = pickWeighted(candidates, Math.min(5, candidates.length||5));
  const dynLabels = new Set(dyn.map(d=>d.label));
  if(!shown.some(s=>dynLabels.has(s.label)) && dyn.length>0) shown[0] = dyn[0];
  shown.forEach((c,i)=> addChoice(c.label, c.act, i===0));
}

// =============== Oracle & fins ===============
function eventOracle(){
  write('🔮 Une voyante apparaît dans tes rêves.'); 
  clearChoices();
  addChoice('Écouter la prophétie', ()=>{ write('“Trois flammes, trois sentiers : acier, astres et eau. Au cercle, la braise jugera.”','info'); state.flags.oracleSeen=true; continueBtn(); }, true);
}
function ending(){
  clearChoices();
  if(state.rep>=30){ write('<b>Fin héroïque :</b> Les Cendres sont purifiées, Mirval renaît.','good'); }
  else if(state.rep<=-30){ write('<b>Fin sombre :</b> Tu deviens le nouvel héritier des Cendres.','bad'); }
  else write('<b>Fin neutre :</b> Le sanctuaire se referme, en silence.','info');
  addChoice('Rejouer (New Game+)', ()=>{ const st=initialState(); st.attrs.FOR++; st.attrs.AGI++; st.attrs.SAG++; state=st; ui.log.innerHTML=''; setup(true); }, true);
}

// =============== Choix de classe ===============
function chooseClass(){
  clearChoices();
  write('Choisis ta classe :','info');
  const pick = (nom, key, val, skill) => { state.cls=nom; state.attrs[key]=val; state.skill=skill; setStats(); startAdventure(); };

  addChoice('🛡️ Guerrier', ()=> pick('Guerrier','FOR',3,{
    name:'Frappe vaillante', cooldown:3, cd:0, desc:'Deux dés + niveau',
    use:(e)=>{ const dmg=rng.between(2,6)+rng.between(2,6)+state.level; e.hp-=dmg; write(`💥 Frappe vaillante : -${dmg} PV`,'good'); }
  }), true);

  addChoice('🗡️ Voleur', ()=> pick('Voleur','AGI',3,{
    name:'Coup de l’ombre', cooldown:3, cd:0, desc:'+4 au jet + vol',
    use:(e)=>{ const r=d20(4).total; if(r>=(e.ac||12)){ const steal=Math.min(3,state.gold); const dmg=rng.between(3,8)+steal; e.hp-=dmg; changeGold(steal); write(`🗡️ L’ombre frappe : -${dmg} PV`,'good'); } else write('Tu rates.','warn'); }
  }));

  addChoice('⚕️ Paladin', ()=> pick('Paladin','SAG',3,{
    name:'Lumière sacrée', cooldown:3, cd:0, desc:'Soigne',
    use:()=> heal(rng.between(3,8)+state.level)
  }));

  addChoice('🏹 Rôdeur', ()=> pick('Rôdeur','AGI',3,{
    name:'Tir précis', cooldown:2, cd:0, desc:'+6 au jet, 1d8',
    use:(e)=>{ const r=d20(6).total; if(r>=(e.ac||12)){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🏹 Tir précis : -${dmg} PV`,'good'); } else write('Tir manqué.','warn'); }
  }));

  addChoice('🔮 Mystique', ()=> pick('Mystique','SAG',3,{
    name:'Onde arcanique', cooldown:3, cd:0, desc:'1d8 & vulnérabilité',
    use:(e)=>{ const dmg=rng.between(3,8); e.hp-=dmg; e.dotChance=Math.min(0.6,(e.dotChance||0)+0.15); write(`🔮 Onde arcanique : -${dmg} PV`,'good'); }
  }));
}

// =============== État initial ===============
function initialState(){
  return {
    name:'Eldarion', cls:'—',
    attrs:{FOR:1,AGI:1,SAG:1},
    hp:22, hpMax:22, gold:12,
    level:1, xp:0, rep:0,
    day:1, time:'Aube',
    location:'Lisière de Mirval',
    locationKey:'village',
    inventory:[],
    equipped: [
      {name:'Vieille épée', desc:'+1 attaque', mods:{FOR:+1}, value:4, slot:'weapon'},
      {name:'Veste matelassée', desc:'+1 défense', mods:{DEF:+1}, value:4, slot:'armor'}
    ],
    potions:1, status:[],
    factions:{ townsfolk: 0, outlaws: 0, sanctum: 0 },
    flags:{
      torch:false, boat:false, mapFound:false,
      ruinsUnlocked:false, campKnown:false,
      relicWarrior:false, relicSage:false, relicWater:false,
      cindersUnlocked:false, oracleSeen:false,
      peasantSaved:false, campLooted:false, sanctuaryFavor:false
    },
    quests:{ 
      main:{title:'Les Cendres de Mirval',state:'Se préparer au voyage'},
      side:[],
    },
    achievements:{}, lastLabels:[],
    inCombat:false, enemy:null, 
    skill:{name:'',cooldown:0,cd:0,desc:'',use:()=>{}},
    daily:{ herbalist:true, smith:true, trader:true }
  };
}
let state = initialState();

// =============== Setup / boucle ===============
function setup(isNew=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();

  if (isNew){
    showVisual('place:village');
    write('v10 — Nouvelle partie : choisis ta classe.','sys');
    chooseClass(); return;
  }
  const classes=['Guerrier','Voleur','Paladin','Rôdeur','Mystique'];
  if(!state.cls || state.cls==='—' || !classes.includes(state.cls)){
    write('v10 — Choisis ta classe pour commencer.','sys'); chooseClass(); return;
  }
  explore(true);
}
function startAdventure(){ ui.log.innerHTML=''; showVisual('place:village'); write("L'aventure commence !",'info'); setStats(); explore(true); }
function gameOver(){ state.inCombat=false; write('<b>☠️ Tu t’effondres… Le silence retombe sur Mirval.</b>','bad'); clearChoices(); addChoice('♻️ Recommencer',()=>{ state=initialState(); ui.log.innerHTML=''; setup(true); }, true); }

// Cooldown de compétence à chaque exploration
const __explore = explore;
explore = function(...args){ if(state.skill && typeof state.skill.cd==='number'){ state.skill.cd = Math.max(0, state.skill.cd-1); } __explore(...args); };

// Bouton reset (aucune sauvegarde/chargement)
const resetBtn=document.getElementById('btn-reset');
if(resetBtn) resetBtn.addEventListener('click', ()=>{ state=initialState(); ui.log.innerHTML=''; setup(true); });

// Boot
(function boot(){ if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',()=>setup(true),{once:true}); } else setup(true); })();
