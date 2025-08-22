// === Aventurier de Mirval — game.js (v10+ scènes cohérentes & choix développés, sans sauvegarde) ===
console.log("Mirval v10+ — game.js chargé");

// ---------- Wake Lock (mobile) ----------
let wakeLock;
async function keepAwake(){ try{ wakeLock = await navigator.wakeLock.request('screen'); }catch(e){} }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && 'wakeLock' in navigator) keepAwake(); });
if('wakeLock' in navigator) keepAwake();

// ---------- RNG ----------
const rng = (() => {
  const seed = (crypto.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]^Date.now():Date.now())>>>0;
  let s = seed>>>0;
  function rand(){ s ^= s<<13; s>>>=0; s ^= s>>17; s>>>=0; s ^= s<<5; s>>>=0; return (s>>>0)/0xFFFFFFFF; }
  function between(min,max){ return Math.floor(rand()*(max-min+1))+min; }
  return { rand, between, seed };
})();
const seedEl = document.getElementById('seedInfo'); if(seedEl) seedEl.textContent = `seed ${rng.seed}`;

// ---------- UI refs ----------
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
  quests: document.getElementById('quests')
};

// ---------- Styles (fade-in des scènes) ----------
(function ensureSceneStyles(){
  if(document.getElementById('mirval-scene-style')) return;
  const st=document.createElement('style'); st.id='mirval-scene-style';
  st.textContent = `
  .scene { margin:12px 0; text-align:center; }
  .scene svg { max-width:340px; height:auto; display:block; margin:10px auto;
               filter: drop-shadow(0 0 6px rgba(0,0,0,.6)); animation: sceneFade .45s ease both; }
  @keyframes sceneFade { from {opacity:0; transform: translateY(4px)} to {opacity:1; transform: none} }`;
  document.head.appendChild(st);
})();

// ---------- Outils UI ----------
let _eventLocked = false;        // empêche le multi-clic sur le même événement (anti-farm)
let _continueActive = false;     // empêche plusieurs boutons "Continuer"
function write(html, cls=""){ const p=document.createElement('p'); if(cls) p.classList.add(cls); p.innerHTML=html; ui.log.appendChild(p); ui.log.scrollTop=ui.log.scrollHeight; }
function clearChoices(){ ui.choices.innerHTML=""; _continueActive=false; _eventLocked=false; }
function disableAllChoices(){ ui.choices.querySelectorAll('button').forEach(b=>b.disabled=true); }
function addChoice(label, handler, primary=false){
  const btn=document.createElement('button'); if(primary) btn.classList.add('btn-primary'); btn.textContent=label;
  btn.addEventListener('click', ()=>{ if(btn.disabled||_eventLocked) return; _eventLocked=true; disableAllChoices(); try{ handler(); }catch(e){ console.error(e); write("Erreur : "+e.message,"bad"); continueBtn(()=>explore()); } }, { once:true });
  ui.choices.appendChild(btn);
}
function continueBtn(next=()=>explore()){
  if(_continueActive) return; _continueActive=true;
  const btn=document.createElement('button'); btn.classList.add('btn-primary'); btn.textContent="Continuer";
  btn.addEventListener('click', ()=>{ if(btn.disabled) return; disableAllChoices(); next(); }, { once:true });
  ui.choices.appendChild(btn);
}
function addScene(key, variant=null){
  const wrap=document.createElement('div'); wrap.className='scene'; wrap.innerHTML = svgScene(key, variant);
  ui.log.appendChild(wrap); ui.log.scrollTop=ui.log.scrollHeight;
}

// ---------- Stats & helpers ----------
function setStats(){
  ui.hp.textContent = state.hp; ui.hpmax.textContent=state.hpMax;
  ui.hpbar.style.width = Math.max(0,Math.min(100,Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent = state.gold; ui.lvl.textContent = state.level; ui.xp.textContent = state.xp;
  ui.status.textContent = state.status.length? state.status.map(s=>s.name).join(', ') : '—';
  ui.pclass.textContent = state.cls; ui.pname.textContent = state.name;
  ui.astr.textContent = state.attrs.STR; ui.aagi.textContent = state.attrs.AGI; ui.awis.textContent = state.attrs.WIS;
  ui.rep.textContent = state.rep; ui.repLabel.textContent = repText(state.rep);

  // Inventaire
  ui.inv.innerHTML="";
  state.inventory.forEach(it=>{
    const d=document.createElement('div'); d.className='stat item-'+(it.rarity||'common');
    d.innerHTML = `<b><span class="emoji">${it.emoji||'✨'}</span> ${it.name}</b><span>${it.desc}</span>`;
    ui.inv.appendChild(d);
  });

  // Quêtes
  ui.quests.innerHTML='';
  const mq=document.createElement('div'); mq.className='stat'; mq.innerHTML=`<b>${state.quests.main.title}</b><span>${state.quests.main.state}</span>`; ui.quests.appendChild(mq);
  const aq=document.createElement('div'); aq.className='stat'; aq.innerHTML=`<b>Fragments d’artefact (${state.flags.fragments}/3)</b><span>${state.quests.artifacts.state}</span>`; ui.quests.appendChild(aq);
  state.quests.side.forEach(q=>{ const x=document.createElement('div'); x.className='stat'; x.innerHTML=`<b>${q.title}</b><span>${q.state}</span>`; ui.quests.appendChild(x); });
}
function d20(mod=0){ const roll=rng.between(1,20); const total=roll+mod; ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${roll} = ${total}`; return {roll,total}; }
function heal(n){ state.hp=Math.min(state.hpMax,state.hp+n); setStats(); write(`+${n} PV`,"good"); }
function damage(n,src=""){ state.hp=Math.max(0,state.hp-n); setStats(); write(`-${n} PV ${src?`(${src})`:''}`,"bad"); if(state.hp<=0){ gameOver(); return true; } return false; }
function changeGold(n){ state.gold=Math.max(0,state.gold+n); setStats(); write(`Or ${n>=0?'+':''}${n} (total: ${state.gold})`, n>=0?"good":"warn"); }
function gainXP(n){ state.xp+=n; write(`XP +${n} (total ${state.xp})`,"info"); const need=20+(state.level-1)*15; if(state.xp>=need){ state.level++; state.xp=0; state.hpMax+=5; state.hp=state.hpMax; write(`<b>Niveau ${state.level} !</b> PV max +5, PV restaurés.`,"good"); } setStats(); }
function addItem(name,desc,emoji="✨",rarity="common"){ state.inventory.push({name,desc,emoji,rarity}); setStats(); write(`Tu obtiens <b>${name}</b>.`,"good"); }
function hasItem(name){ return state.inventory.some(i=>i.name===name); }
function removeItem(name){ const i=state.inventory.findIndex(x=>x.name===name); if(i>=0) state.inventory.splice(i,1); setStats(); }
function repText(n){return n>=30?'Vertueux':n<=-30?'Sombre':'Neutre'}
function rep(n){ state.rep += n; setStats(); }

// ---------- SVG scenes (plus détaillées & cohérentes) ----------
function svgScene(kind, variant=null){
  // palette & helpers
  const defs = `
  <defs>
    <linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${variant==='night'?'#0b1020':'#0f172a'}"/>
      <stop offset="1" stop-color="${variant==='night'?'#060914':'#0b1220'}"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="1.4"/></filter>
  </defs>`;
  const label = (txt) => `<text x="24" y="30" font-size="16" fill="#cbd5e1">${txt}</text>`;

  if(kind==='class'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="url(#bg1)"/>
      ${label("Choisis ta classe")}
      ${[['🛡️','Guerrier',80],['🗡️','Voleur',220],['⚕️','Paladin',360],['🏹','Rôdeur',500],['🔮','Mystique',640-80]].map(([e,t,x])=>`
        <g transform="translate(${x-40},80)">
          <circle cx="40" cy="40" r="36" fill="#0ea5e9" opacity=".18"/>
          <text x="40" y="45" text-anchor="middle" font-size="22" fill="#e5e7eb">${e}</text>
          <text x="40" y="86" text-anchor="middle" font-size="12" fill="#9ca3af">${t}</text>
        </g>`).join('')}
    </svg>`;
  }
  if(kind==='forest'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="url(#bg1)"/>
      ${label("Forêt de Mirval")}
      <rect y="170" width="640" height="60" fill="#20412c"/>
      <g fill="#0f172a" opacity=".5">${[10,70,140,520,590].map((x)=>`
        <rect x="${x}" y="110" width="46" height="90"/><polygon points="${x},110 ${x+23},70 ${x+46},110"/>`).join('')}</g>
    </svg>`;
  }
  if(kind==='marais'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="${variant==='night'?'#07141a':'#0c1d1f'}"/>
      ${label("Marais de Vire-Saule")}
      <ellipse cx="320" cy="185" rx="290" ry="45" fill="#0f3a3a" opacity=".65"/>
      <g filter="url(#soft)"><circle cx="120" cy="110" r="8" fill="#34d399"/><circle cx="160" cy="130" r="5" fill="#34d399"/><circle cx="540" cy="120" r="7" fill="#34d399"/></g>
    </svg>`;
  }
  if(kind==='clearing'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#102116"/><rect y="170" width="640" height="60" fill="#225b34"/>
      ${label("Clairière des Lys")}
      <circle cx="520" cy="60" r="24" fill="#fde68a" ${variant==='night'?'opacity=".15"':''}/>
    </svg>`;
  }
  if(kind==='hill'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#111827"/>
      <path d="M0,180 Q160,110 320,180 T640,180 L640,230 L0,230 Z" fill="#1f2937"/>
      ${label("Colline de Rocfauve")}
    </svg>`;
  }
  if(kind==='ruins'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#0f1420"/>
      <rect x="60" y="170" width="120" height="20" fill="#374151"/>
      <rect x="110" y="120" width="60" height="50" fill="#4b5563"/>
      <rect x="108" y="112" width="64" height="8" fill="#6b7280"/>
      ${label("Ruines oubliées")}
    </svg>`;
  }
  if(kind==='cave'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#0b0f1a"/>
      <ellipse cx="320" cy="170" rx="320" ry="70" fill="#111827"/>
      <path d="M280,180 Q320,90 360,180 Z" fill="#0f172a"/>
      ${label("Grotte sépulcrale")}
    </svg>`;
  }
  if(kind==='sanctuary'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#0d1320"/>
      <rect x="80" y="160" width="120" height="16" fill="#334155"/>
      <polygon points="80,160 140,120 200,160" fill="#3b82f6"/><rect x="128" y="140" width="24" height="20" fill="#e5e7eb"/>
      ${label("Ancien sanctuaire")}
    </svg>`;
  }
  if(kind==='herbalist'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="url(#bg1)"/>
      <circle cx="120" cy="110" r="32" fill="#14532d"/><text x="120" y="118" text-anchor="middle" font-size="20" fill="#d1fae5">🌿</text>
      ${label("Herboriste")}
    </svg>`;
  }
  if(kind==='smith'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#1f2937"/>
      <rect x="80" y="170" width="120" height="18" fill="#374151"/><circle cx="140" cy="140" r="24" fill="#6b7280"/>
      ${label("Forgeron itinérant")}
    </svg>`;
  }
  if(kind==='bard'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#0d1320"/>
      <path d="M60,130 q40,-60 80,0 t80,0 t80,0" stroke="#60a5fa" stroke-width="3" fill="none"/>
      ${label("Barde mélodieux")}
    </svg>`;
  }
  if(kind==='hermit'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#111827"/><circle cx="520" cy="120" r="26" fill="#374151"/>
      <text x="520" y="128" text-anchor="middle" font-size="20" fill="#e5e7eb">🧙</text>
      ${label("Ermite")}
    </svg>`;
  }
  if(kind==='peasant'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#132318"/>
      <rect x="90" y="160" width="80" height="8" fill="#a16207"/>
      <circle cx="130" cy="140" r="12" fill="#9ca3af"/><rect x="122" y="150" width="16" height="22" fill="#9ca3af"/>
      ${label("Paysan captif")}
    </svg>`;
  }
  if(kind==='bandit'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#0b1320"/>
      <circle cx="500" cy="110" r="36" fill="#1f2937"/><rect x="468" y="140" width="64" height="60" rx="8" fill="#1f2937"/>
      <rect x="472" y="102" width="56" height="16" fill="#0ea5e9" opacity=".5"/><text x="500" y="118" text-anchor="middle" font-size="20" fill="#e5e7eb">😈</text>
      ${label("Bandit embusqué")}
    </svg>`;
  }
  if(kind==='wolf'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#0b1220"/>
      <path d="M420,170 l-40,-30 20,0 -10,-20 30,10 20,-10 10,20 20,0 -40,30 z" fill="#6b7280"/>
      ${label("Loup affamé")}
    </svg>`;
  }
  if(kind==='boar'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#0b1220"/>
      <ellipse cx="500" cy="150" rx="40" ry="22" fill="#7c3f27"/><circle cx="475" cy="150" r="14" fill="#7c3f27"/>
      ${label("Sanglier irascible")}
    </svg>`;
  }
  if(kind==='harpy'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#0b1220"/>
      <path d="M470,120 q-40,-40 -80,0 q40,30 80,0" stroke="#a78bfa" stroke-width="4" fill="none"/>
      ${label("Harpie du vent")}
    </svg>`;
  }
  if(kind==='ghoul'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#0b1220"/>
      <rect x="480" y="110" width="36" height="60" rx="6" fill="#065f46"/><circle cx="498" cy="100" r="16" fill="#065f46"/>
      ${label("Goule des roseaux")}
    </svg>`;
  }
  if(kind==='boss'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="640" height="230" fill="#1b1b28"/>
      <circle cx="500" cy="110" r="36" fill="#7f1d1d"/><text x="500" y="118" text-anchor="middle" font-size="22" fill="#fde68a">👑</text>
      ${label("Chef Bandit")}
    </svg>`;
  }
  if(kind==='trap'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="230" fill="#111827"/>
      <path d="M40,180 h560" stroke="#9ca3af" stroke-width="2" stroke-dasharray="6 6"/>
      ${label("Piège tendu")}
    </svg>`;
  }
  if(kind==='oracle'){
    return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="230" fill="#0b0f1a"/>
      <circle cx="520" cy="110" r="26" fill="#1e293b"/><text x="520" y="118" text-anchor="middle" font-size="18" fill="#93c5fd">🔮</text>
      ${label("Rêve prophétique")}
    </svg>`;
  }
  return `<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="230" fill="#0f172a"/><text x="320" y="120" text-anchor="middle" font-size="16" fill="#93c5fd">Mirval</text></svg>`;
}

// ---------- Combat / calculs ----------
function playerAtkMod(){ let m=0; if(state.cls==='Guerrier') m+=2; if(state.attrs.STR>=3) m+=1; if(hasItem('Épée affûtée')) m+=1; return m; }
function playerDef(){ return 10 + (state.cls==='Paladin'?1:0) + (state.attrs.AGI>=3?1:0) + (hasItem('Petite armure')?1:0) + (hasItem('Cuir renforcé')?2:0) + (hasItem('Bouclier en fer')?2:0); }
function terrainPenalty(){ return state.locationKey==='marais' ? -1 : 0 }

function combat(mon){
  clearChoices(); state.inCombat=true; state.enemy=JSON.parse(JSON.stringify(mon));
  addScene(mon.scene||'bandit', (state.time==='Nuit'||state.time==='Crépuscule')?'night':null);
  write(`<b>${mon.name}</b> apparaît ! ❤️ ${mon.hp} — CA ${mon.ac}`,"warn");
  combatTurn();
}
function combatTurn(){
  if(!state.inCombat) return;
  if(state.hp<=0){ gameOver(); return; }
  if(state.enemy.hp<=0){ write(`<b>${state.enemy.name} est vaincu !</b>`,"good"); afterCombat(); return; }

  clearChoices();
  const e=state.enemy;

  addChoice(`⚔️ Attaquer`, ()=>aimMenu(), true);
  addChoice(`🛡️ Parer`, ()=>{
    const bonus = state.cls==='Rôdeur'?2:1;
    const m = d20(e.hitMod).total;
    const armor = 12 + bonus + (hasItem("Petite armure")?1:0) + (hasItem("Cuir renforcé")?2:0) + (hasItem("Bouclier en fer")?2:0);
    if(m>=armor){ const dmg=Math.max(0,rng.between(1,3+e.tier)-2-bonus); write(`Parade partielle, -${dmg} PV.`,"warn"); damage(dmg,e.name); }
    else write("Tu pares complètement !","good");
    combatTurn();
  });
  addChoice(`✨ Compétence${state.skill.cd?` (${state.skill.cd})`:''}`, ()=>{
    if(state.skill.cd){ write("Compétence en recharge.","warn"); return combatTurn(); }
    state.skill.use(e); state.skill.cd = state.skill.cooldown;
    if(e.hp>0) enemyAttack(); combatTurn();
  });
  addChoice(`🧪 Potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Plus de potions.","warn"); return combatTurn(); }
    state.potions--; heal(rng.between(8,12)); enemyAttack(); combatTurn();
  });
  addChoice(`🏃 Fuir`, ()=>{
    const r=d20(state.attrs.AGI>=3?2:0).total;
    if(r>=14){ write("Tu fuis le combat.","sys"); state.inCombat=false; state.enemy=null; explore(); }
    else { write("Échec de fuite !","bad"); enemyAttack(); combatTurn(); }
  });
}
function aimMenu(){
  clearChoices(); const e=state.enemy;
  addChoice('🎯 Viser la tête', ()=>{
    const r=d20(playerAtkMod()-2 + terrainPenalty()).total;
    if(r>=e.ac+2){ const dmg=rng.between(6,10); e.hp-=dmg; write(`🎯 Coup à la tête : -${dmg} PV`,'good'); }
    else write('Tu manques la tête.','warn');
    enemyAttack(); combatTurn();
  }, true);
  addChoice('🗡️ Viser le torse', ()=>{
    const r=d20(playerAtkMod() + terrainPenalty()).total;
    if(r>=e.ac){ const dmg=rng.between(3,7); e.hp-=dmg; write(`🗡️ Frappe au torse : -${dmg} PV`,'good'); }
    else write('Tu manques.','warn');
    enemyAttack(); combatTurn();
  });
  addChoice('🦵 Viser les jambes', ()=>{
    const r=d20(playerAtkMod()+1 + terrainPenalty()).total;
    if(r>=e.ac-1){ const dmg=rng.between(2,5); e.hp-=dmg; state.status.push({type:'slow',name:'Ralentissement',dur:2}); write(`🦵 Frappe aux jambes : -${dmg} PV (ennemi ralenti)`,'good'); }
    else write('Tu manques les jambes.','warn');
    enemyAttack(); combatTurn();
  });
  addChoice('↩️ Annuler', combatTurn);
}
function enemyAttack(){
  const e=state.enemy; const roll = d20(e.hitMod).total; const def = playerDef() + terrainPenalty();
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
function tickStatus(){
  state.status = state.status.filter(st=>{
    if(st.type==='poison'){ const dmg=rng.between(1,2); damage(dmg,"Poison"); st.dur--; }
    if(st.type==='bleed'){ const dmg=2; damage(dmg,"Saignement"); st.dur--; }
    if(st.type==='slow'){ st.dur--; if(st.dur===0) write('💨 Tu te sens plus léger.','info') }
    return st.dur>0 && state.hp>0;
  });
}
function afterCombat(){
  const e=state.enemy; state.inCombat=false; state.enemy=null;
  const gold=rng.between(e.tier, e.tier*3); const xp=rng.between(e.tier*3, e.tier*6);
  changeGold(gold); gainXP(xp);
  const r=rng.rand();
  if(r<0.2 && !hasItem("Épée affûtée")) addItem("Épée affûtée","+1 attaque","🗡️","rare");
  else if(r<0.35 && !hasItem("Bouclier en bois")) addItem("Bouclier en bois","+1 armure légère","🛡️","common");
  else if(r<0.45) { state.potions++; write("Tu trouves une potion.","good"); }
  else if(r<0.5 && !hasItem("Cuir renforcé")) addItem("Cuir renforcé","+2 armure souple","🧥","rare");
  if(e.name.includes("Bandit")){
    state.flags.rumors = (state.flags.rumors||0)+1;
    if(state.flags.rumors>=3 && !state.flags.bossUnlocked){ state.flags.bossUnlocked=true; write("🗡️ Tu apprends la cache du Chef Bandit… (événement rare débloqué)","info"); }
  }
  explore();
}

// ---------- Exploration ----------
function setTime(){
  const slots=["Aube","Matin","Midi","Après-midi","Crépuscule","Nuit"];
  const idx=slots.indexOf(state.time); let n=(idx+1)%slots.length; if(n===0) state.day++;
  state.time=slots[n]; ui.day.textContent=`Jour ${state.day} — ${state.time}`;
}
function gotoZone(key){
  state.locationKey=key;
  state.location = key==='marais'?"Marais de Vire-Saule": key==='clairiere'?"Clairière des Lys": key==='colline'?"Colline de Rocfauve": key==='ruines'?"Ruines Oubliées": key==='grotte'?"Grotte Sépulcrale":"Lisière";
  write(`👉 Tu te diriges vers ${state.location}.`,"sys");
  addScene(key==='marais'?'marais': key==='clairiere'?'clearing': key==='colline'?'hill': key==='ruines'?'ruins': key==='grotte'?'cave':'forest', (state.time==='Nuit'||state.time==='Crépuscule')?'night':null);
  explore(true);
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
function continueOnly(){ clearChoices(); continueBtn(()=>explore()); }

function explore(initial=false){
  setStats(); ui.loc.textContent = state.location; ui.day.textContent=`Jour ${state.day} — ${state.time}`; clearChoices();
  if(!initial) setTime(); tickStatus(); if(state.hp<=0) return;

  // Quête onirique unique
  if(state.day>=5 && !state.flags.oracleSeen){ eventOracle(); return; }

  const night = (state.time==='Nuit'||state.time==='Crépuscule');
  const zone=state.locationKey;
  const base=[
    {label:"🔎 Fouiller", act:searchArea, w:2},
    {label:"🛏️ Se reposer", act:rest, w:1},
    {label:"🎒 Utiliser un objet", act:useItemMenu, w:1},
    {label:"👀 Observer (repérage)", act:scout, w:1}
  ];

  let pool=[];
  if(zone==='marais'){
    pool.push({label:'✨ Feux-follets au loin', act:()=>{ addScene('marais', night?'night':null); eventSanctuary(); }, w:2});
    pool.push({label:'🧑‍🌾 Captif à la berge', act:()=>{ if(!state.flags.peasantSaved) eventPeasant(); else { write('La berge est silencieuse.'); continueOnly(); } }, w:1});
    pool.push({label:`🧟‍♂️ ${night?'Rôdeuse':'Goule'} des roseaux`, act:()=>combat(mobTemplates.ghoul()), w:3});
    pool.push({label:'🐺 Meute furtive', act:()=>combat(mobTemplates.wolf()), w:2});
    pool.push({label:'🪤 Une corde traîtresse', act:()=>{ addScene('trap'); eventTrap(); continueOnly(); }, w:1});
  } else if(zone==='clairiere'){
    pool.push({label:'🌿 Herboriste (potions/torche)', act:()=>{ addScene('herbalist'); eventHerbalist(); }, w:2});
    pool.push({label:'🎻 Barde (rumeurs)', act:()=>{ addScene('bard'); eventBard(); }, w:1});
    pool.push({label:'🐗 Sanglier des fourrés', act:()=>combat(mobTemplates.boar()), w:2});
    pool.push({label:'⛪ Autel moussu', act:()=>{ addScene('sanctuary'); eventSanctuary(); }, w:2});
    pool.push({label:'🥷 Bandits embusqués', act:()=>{ addScene('bandit'); combat(mobTemplates.bandit()); }, w:2});
  } else if(zone==='colline'){
    pool.push({label:'🧙 Ermite (breloque)', act:()=>{ addScene('hermit'); eventHermit(); }, w:1});
    pool.push({label:'🏚️ Ruines à explorer', act:()=>{ addScene('ruins'); eventRuins(); }, w:2});
    pool.push({label:'🪶 Harpie des crêtes', act:()=>{ addScene('harpy'); combat(mobTemplates.harpy()); }, w:3});
    pool.push({label:'⚒️ Forgeron itinérant', act:()=>{ addScene('smith'); eventSmith(); }, w:1});
  } else if(zone==='ruines'){
    pool.push({label:'🔎 Décombres', act:()=>{ addScene('ruins'); eventRuins(); }, w:3});
    pool.push({label:'⛰️ Éboulement', act:()=>{ addScene('ruins'); damage(rng.between(1,4),'Éboulement'); continueOnly(); }, w:1});
    pool.push({label:'🥷 Bande de pilleurs', act:()=>{ addScene('bandit'); combat(mobTemplates.bandit()); }, w:2});
  } else if(zone==='grotte'){
    pool.push({label:'🧟‍♀️ Goule ancienne', act:()=>{ addScene('cave'); combat({name:'Goule ancienne',hp:18,maxHp:18,ac:13,hitMod:5,tier:3,dotChance:0.35,dotType:'poison',scene:'ghoul'}) }, w:3});
    pool.push({label:'📣 Échos inquiétants', act:()=>{ addScene('cave'); const r=d20().total; if(r<10) damage(3,'Stalactite'); else write('Rien ne se passe.'); continueOnly(); }, w:1});
  }

  if(state.flags.bossUnlocked) pool.push({label:"👑 Traquer le Chef Bandit", act:()=>combatBoss(), w:1});

  const nav=[
    {label:'→ Marais', act:()=>gotoZone('marais'), w:1},
    {label:'→ Clairière', act:()=>gotoZone('clairiere'), w:1},
    {label:'→ Colline', act:()=>gotoZone('colline'), w:1},
    {label:'→ Ruines', act:()=>gotoZone('ruines'), w: state.flags.ruinsUnlocked?1:0},
    {label:'→ Grotte', act:()=> state.flags.torch? gotoZone('grotte') : (write('Il fait trop sombre pour entrer.','warn'), addScene('cave'), continueOnly()), w:1}
  ].filter(x=>x.w>0);

  const dyn = pickWeighted(pool, 3 + (rng.rand()<0.4?1:0));
  const all = pickWeighted([...base, ...dyn, ...nav], 4);
  all.forEach((c,i)=> addChoice(c.label, c.act, i===0));
}

// ---------- Actions générales & nouvelles options ----------
function scout(){
  // Repérage : réduit les risques au prochain événement, ou dévoile un choix caché
  write("Tu observes les environs et marques des repères.", "info");
  state.flags.scouted = true;
  if(rng.rand()<0.4){ write("Tu repères une trace de coffre…", "info"); state.flags.scoutedChest = true; }
  continueBtn(()=>explore());
}

function searchArea(){
  addScene(state.locationKey==='marais'?'marais':state.locationKey==='ruines'?'ruins':state.locationKey==='grotte'?'cave':'forest',
           (state.time==='Nuit'||state.time==='Crépuscule')?'night':null);
  const bonus = (state.attrs.WIS>=3?1:0) + (state.flags.scouted?1:0);
  const {total} = d20(bonus);
  state.flags.scouted=false;
  if(total>=19){ write("🔑 Tu trouves un coffre scellé et un recoin caché.","good"); chest(true); }
  else if(total>=14){ write("✨ Quelques pièces sous une pierre.","good"); changeGold(rng.between(3,7)); if(state.flags.scoutedChest){ state.flags.scoutedChest=false; chest(); } }
  else if(total>=9){ write("Des traces fraîches… une rencontre approche."); if(rng.rand()<0.6) randomEncounter(); }
  else { write("Aïe ! Ronce traîtresse.","bad"); damage(rng.between(1,3),"Ronces"); }
  continueBtn(()=>explore());
}
function rest(){
  addScene('forest',(state.time==='Nuit'||state.time==='Crépuscule')?'night':null);
  if(rng.rand()<0.35){ write("Quelque chose approche pendant ton repos…","warn"); randomEncounter(); }
  else { heal(rng.between(4,8)); write("Tu dors un peu. Ça fait du bien.","good"); }
  continueBtn(()=>explore());
}
function useItemMenu(){
  clearChoices();
  addChoice(`🧪 Potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Tu n'as pas de potion.","warn"); return continueBtn(()=>explore()); }
    state.potions--; heal(rng.between(8,12)); continueBtn(()=>explore());
  }, true);
  if(hasItem('Antidote')) addChoice("💉 Utiliser un Antidote", ()=>{ state.status = state.status.filter(s=>s.type!=='poison'); removeItem('Antidote'); write("Le poison est purgé.","good"); continueBtn(()=>explore()); });
  if(hasItem('Corde solide')) addChoice("🪢 Attacher une corde (sécurise les ruines)", ()=>{ state.flags.rope=2; write("Tu es prêt à sécuriser un passage difficile.","info"); continueBtn(()=>explore()); });
  addChoice("↩️ Annuler", ()=>explore());
}
function chest(riche=false){
  addScene('ruins');
  const r=rng.between(1,100);
  if(r>90 || (riche && r>70)){ addItem("Bouclier en fer","+2 armure","🛡️","rare"); }
  else if(r>70){ addItem("Potion de soin","Rest. 8-12 PV","🧪","common"); state.potions++; }
  else if(r>55){ addItem("Antidote","Soigne le poison","💉","common"); }
  else if(r>40){ addItem("Corde solide","Aide à éviter les chutes","🪢","common"); state.flags.rope = (state.flags.rope||0)+1; }
  else { changeGold(rng.between(8,18)); }
}
function randomEncounter(){
  const roll=rng.rand(); const zone=state.locationKey;
  if(roll<0.5){
    if(zone==='marais'){ addScene('ghoul'); combat(mobTemplates.ghoul()); }
    else if(zone==='clairiere'){ addScene('bandit'); combat(mobTemplates.bandit()); }
    else if(zone==='colline'){ addScene('harpy'); combat(mobTemplates.harpy()); }
    else { addScene('wolf'); combat(mobTemplates.wolf()); }
  }else{
    [eventSanctuary,eventHerbalist,eventSmith,eventHermit][rng.between(0,3)]();
  }
}

// ---------- Événements & PNJ (développés) ----------
function eventHerbalist(){
  addScene('herbalist'); write("🌿 Une herboriste t’accueille sous un auvent de lierre.");
  clearChoices();
  addChoice("Acheter une potion (3 or)", ()=>{
    if(state.gold>=3){ changeGold(-3); state.potions++; write("Potion ajoutée.","good"); }
    else write("Pas assez d'or.","warn");
    continueBtn(()=>explore());
  }, true);
  addChoice("Acheter une torche (4 or)", ()=>{
    if(state.gold>=4){ changeGold(-4); state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte','🔥','common'); }
    else write("Pas assez d'or.","warn");
    continueBtn(()=>explore());
  });
  addChoice("Acheter un antidote (3 or)", ()=>{
    if(state.gold>=3){ changeGold(-3); addItem('Antidote','Soigne le poison','💉','common'); }
    else write("Pas assez d'or.","warn");
    continueBtn(()=>explore());
  });
  addChoice("Demander un soin (2 or / gratuit si rep ≥ 25)", ()=>{
    const prix = state.rep>=25 ? 0 : 2;
    if(state.gold>=prix){ if(prix>0) changeGold(-prix); heal(rng.between(6,12)); }
    else write("Pas assez d'or.","warn");
    continueBtn(()=>explore());
  });
  addChoice("Marchander (WIS)", ()=>{
    const {total}=d20(state.attrs.WIS>=3?2:0);
    if(total>=15){ heal(rng.between(4,8)); write('Elle sourit : "À prix d’ami."','good'); rep(+1); }
    else { write('Elle refuse net.','warn'); rep(-1); }
    continueBtn(()=>explore());
  });
  addChoice("Partir", ()=>continueBtn(()=>explore()));
}

function eventSmith(){
  addScene('smith'); write('⚒️ Un forgeron itinérant inspecte tes armes : "On peut améliorer."');
  clearChoices();
  addChoice('Affûter (+1 attaque, 5 or)', ()=>{
    if(state.gold>=5){ changeGold(-5); addItem('Épée affûtée','+1 attaque','🗡️','rare'); }
    else write("Pas assez d'or.",'warn');
    continueBtn(()=>explore());
  }, true);
  addChoice('Bouclier en fer (+2 armure, 6 or)', ()=>{
    if(state.gold>=6){ changeGold(-6); addItem('Bouclier en fer','+2 armure','🛡️','rare'); }
    else write("Pas assez d'or.",'warn');
    continueBtn(()=>explore());
  });
  addChoice('Cuir renforcé (+2 armure, 6 or)', ()=>{
    if(state.gold>=6){ changeGold(-6); addItem('Cuir renforcé','+2 armure souple','🧥','rare'); }
    else write("Pas assez d'or.",'warn');
    continueBtn(()=>explore());
  });
  addChoice('Bricoler (AGI) — tenter une bidouille', ()=>{
    const {total}=d20(state.attrs.AGI>=3?2:0);
    if(total>=16){ write("La garde tient mieux : +1 CA pour la prochaine rencontre.","good"); state.status.push({type:'guard',name:'Garde affermie',dur:1}); }
    else { write("Raté : tu te coupes.",'warn'); damage(2,'Mauvaise manip'); }
    continueBtn(()=>explore());
  });
}

function eventBard(){
  addScene('bard'); write('🎻 Un barde accorde son luth : "Une chanson contre une pièce ?"');
  clearChoices();
  addChoice('Écouter (1 or)', ()=>{
    if(state.gold>=1){ changeGold(-1); if(rng.rand()<0.7){ heal(rng.between(3,7)); write("L’air te ragaillardit.","good"); } else write("Tu as l’impression d’avoir déjà entendu ça…"); }
    else write("Tu fouilles ta bourse vide.","warn");
    continueBtn(()=>explore());
  }, true);
  addChoice('Demander des rumeurs (2 or)', ()=>{
    if(state.gold>=2){ changeGold(-2); write('Il chuchote : "On parle d’un chef bandit vers les ruines..."',"info"); state.flags.rumors=(state.flags.rumors||0)+1; if(state.flags.rumors>=3) state.flags.bossUnlocked=true; }
    else write("Pas assez d'or.","warn");
    continueBtn(()=>explore());
  });
  addChoice('Improviser un duo (WIS)', ()=>{
    const {total}=d20(state.attrs.WIS>=3?2:0);
    if(total>=15){ gainXP(4); rep(+1); write('Le public applaudit !',"good"); }
    else { write("Tu oublies les paroles…","warn"); rep(-1); }
    continueBtn(()=>explore());
  });
  addChoice('Partir', ()=>continueBtn(()=>explore()));
}

function eventRuins(){
  addScene('ruins'); write('🏚️ Des ruines effondrées se dressent. Des passages paraissent instables.');
  clearChoices();
  addChoice('Fouiller prudemment (WIS)', ()=>{
    const bonus = (state.attrs.WIS>=3?1:0)+(state.flags.rope?1:0);
    const {total}=d20(bonus);
    if(state.flags.rope) state.flags.rope=Math.max(0,state.flags.rope-1);
    if(total>=17){
      if(!state.flags.torch){ state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte','🔥','rare'); }
      else {
        if(rng.rand()<0.35){ state.flags.fragments++; write('✨ Tu trouves un <b>fragment d’artefact</b>.','good'); if(state.flags.fragments>=3){ write('Les fragments vibrent… Un secret se dévoilera bientôt.','info'); } }
        else chest();
      }
    } else if(total>=11){ chest(); }
    else { const hurt = state.flags.rope? rng.between(1,2) : rng.between(3,6); damage(hurt,'Éboulement'); }
    continueBtn(()=>explore());
  }, true);
  addChoice('Piocher les gravats (STR)', ()=>{
    const {total}=d20(state.attrs.STR>=3?2:0);
    if(total>=16){ changeGold(rng.between(6,12)); write("Tu dégages des reliques vendables.","good"); }
    else { damage(rng.between(1,4),'Effort'); }
    continueBtn(()=>explore());
  });
  addChoice('Tracer des repères (AGI)', ()=>{
    const {total}=d20(state.attrs.AGI>=3?2:0);
    if(total>=14){ state.flags.scouted=true; write("Tu pourras revenir plus sûrement.","info"); }
    else write("Tes marques s’effacent déjà…","warn");
    continueBtn(()=>explore());
  });
  addChoice('Partir', ()=>continueBtn(()=>explore()));
}

function eventPeasant(){
  addScene('peasant'); write('🧑‍🌾 Un paysan enchaîné appelle à l’aide.');
  clearChoices();
  addChoice('Briser les chaînes (STR)', ()=>{
    const {total}=d20(state.attrs.STR>=3?2:0);
    if(total>=14){
      write('Les chaînes cèdent.','good'); rep(+5); state.flags.peasantSaved=true;
      state.quests.side.push({title:'Le paysan reconnaissant',state:'En attente'});
      changeGold(rng.between(1,3));
    } else { damage(rng.between(1,4),'Effort'); }
    continueBtn(()=>explore());
  }, true);
  addChoice('Forcer le cadenas (AGI)', ()=>{
    const {total}=d20(state.attrs.AGI>=3?2:0);
    if(total>=15){ write('Tu ouvres sans bruit.','good'); rep(+3); state.flags.peasantSaved=true; }
    else { write("Le mécanisme te glisse des doigts.","warn"); rep(-1); }
    continueBtn(()=>explore());
  });
  addChoice('Ignorer', ()=>{ rep(-3); continueBtn(()=>explore()); });
}

function eventSanctuary(){
  addScene('sanctuary'); write('⛪ Un ancien sanctuaire se dévoile.');
  clearChoices();
  addChoice('Prier', ()=>{
    const night = state.time==='Nuit' || state.time==='Crépuscule';
    const {total}=d20(); const t=total+(night?1:0);
    if(t>=15){ heal(rng.between(6,12)); rep(+2); }
    else { damage(rng.between(2,6),'Présage'); rep(-1); }
    continueBtn(()=>explore());
  }, true);
  addChoice('Étudier les runes (WIS)', ()=>{
    const {total}=d20(state.attrs.WIS>=3?2:0);
    if(total>=16){ gainXP(4); write("Tu décryptes un avertissement ancien.","info"); }
    else write("Les symboles te donnent mal à la tête.","warn");
    continueBtn(()=>explore());
  });
  addChoice('Profaner (STR)', ()=>{
    const {total}=d20(state.attrs.STR>=3?1:0);
    if(total>=16){ changeGold(rng.between(8,16)); rep(-3); }
    else { damage(rng.between(4,7),'Malédiction'); rep(-5); }
    continueBtn(()=>explore());
  });
  addChoice('Partir', ()=>continueBtn(()=>explore()));
}

function eventHermit(){
  addScene('hermit'); write('🧙 Un ermite t’observe en silence : "Tu cherches des réponses… ou des chances ?"');
  clearChoices();
  addChoice('Boire sa décoction (aléatoire)', ()=>{
    if(rng.rand()<0.6){ heal(rng.between(5,10)); gainXP(3); }
    else { damage(rng.between(2,5),'Nausée'); }
    continueBtn(()=>explore());
  }, true);
  addChoice('Acheter une breloque (5 or)', ()=>{
    if(state.gold>=5){ changeGold(-5); addItem("Breloque d'ermite","10% d’annuler un mal","🧿","epic"); state.flags.charm=1; }
    else write("Pas assez d'or.",'warn');
    continueBtn(()=>explore());
  });
  addChoice('Demander un présage (rép ≥ 10)', ()=>{
    if(state.rep>=10){ write("“Au troisième éclat, la voie s’ouvrira près des ruines.”","info"); state.flags.rumors=(state.flags.rumors||0)+1; if(state.flags.rumors>=3) state.flags.bossUnlocked=true; }
    else write("Il t’ignore.","warn");
    continueBtn(()=>explore());
  });
}

function eventTrap(){
  addScene('trap'); write('🪤 Une corde s’enroule à ta cheville !');
  const bonus = (state.attrs.AGI>=3?2:0) + (hasItem('Corde solide')?1:0);
  const {total}=d20(bonus);
  if(total>=13) write('Tu t’en sors de justesse.','good'); else damage(rng.between(2,5),'Piège');
}

function eventOracle(){
  addScene('oracle'); write('🔮 Une voyante apparaît dans tes rêves.');
  clearChoices();
  addChoice('Écouter la prophétie', ()=>{
    write('“Quand trois éclats seront réunis, la porte s’ouvrira.”','info');
    state.flags.oracleSeen=true;
    continueBtn(()=>explore());
  }, true);
}

// ---------- Bestiaire ----------
const mobTemplates = {
  wolf: ()=>({ name:"Loup affamé", hp:10, maxHp:10, ac:11, hitMod:2, tier:1, dotChance:0, dotType:null, scene:'wolf' }),
  bandit: ()=>({ name:"Bandit des fourrés", hp:12, maxHp:12, ac:12, hitMod:3, tier:2, dotChance:0.1, dotType:'bleed', scene:'bandit' }),
  boar: ()=>({ name:"Sanglier irascible", hp:11, maxHp:11, ac:11, hitMod:2, tier:1, dotChance:0.05, dotType:'bleed', scene:'boar' }),
  harpy: ()=>({ name:"Harpie du vent", hp:14, maxHp:14, ac:13, hitMod:4, tier:2, dotChance:0.2, dotType:'bleed', scene:'harpy' }),
  ghoul: ()=>({ name:"Goule des roseaux", hp:13, maxHp:13, ac:12, hitMod:3, tier:2, dotChance:0.25, dotType:'poison', scene:'ghoul' }),
  chief: ()=>({ name:"Chef Bandit", hp:24, maxHp:24, ac:14, hitMod:5, tier:3, dotChance:0.3, dotType:'bleed', scene:'boss' })
};

// ---------- Boss ----------
function combatBoss(){
  const boss=mobTemplates.chief();
  write('🥷 Tu t’infiltres dans la planque du Chef Bandit.','warn'); addScene('boss');
  combat(boss);
  // Comportement de rage à mi-vie
  const _enemyAttack = enemyAttack;
  enemyAttack = function(){
    if(state.enemy && state.enemy.name==='Chef Bandit' && state.enemy.hp<=state.enemy.maxHp/2 && !state.enemy.enraged){
      state.enemy.enraged=true; state.enemy.hitMod+=1; write('🔥 Le Chef Bandit entre en rage !','warn');
    }
    _enemyAttack();
  }
}

// ---------- Fins ----------
function ending(){
  clearChoices();
  if(state.rep>=30){ write('<b>Fin héroïque :</b> Mirval te salue comme un sauveur.','good'); state.achievements.hero=true; }
  else if(state.rep<=-30){ write('<b>Fin sombre :</b> ta légende glace le sang des voyageurs.','bad'); state.achievements.villain=true; }
  else { write('<b>Fin neutre :</b> tu quittes la forêt, plus sage qu’avant.','info'); }
  addChoice('Rejouer (New Game+)', ()=>{
    const st=initialState(); st.attrs.STR++; st.attrs.AGI++; st.attrs.WIS++; state=st; ui.log.innerHTML=''; setup(true);
  }, true);
  addChoice('Quitter', ()=>write('Merci d’avoir joué !'));
}

// ---------- Choix de classe ----------
function chooseClass(){
  clearChoices(); write('Choisis ta classe :','info'); addScene('class');
  const pick = (nom, boostKey, boostVal, skill) => { state.cls = nom; if (boostKey) state.attrs[boostKey] = boostVal; state.skill = skill; setStats(); startAdventure(); };
  addChoice('🛡️ Guerrier', ()=> pick('Guerrier','STR',3,{ name:'Frappe vaillante', cooldown:3, cd:0, use:(e)=>{ const dmg=rng.between(2,6)+rng.between(2,6)+state.level; e.hp-=dmg; write(`💥 Frappe vaillante : -${dmg} PV`,'good'); } }), true);
  addChoice('🗡️ Voleur', ()=> pick('Voleur','AGI',3,{ name:'Coup de l’ombre', cooldown:3, cd:0, use:(e)=>{ const r=d20(4).total; if(r>=e.ac){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🗡️ L’ombre frappe : -${dmg} PV`,'good'); } else write('Tu rates.','warn'); } }));
  addChoice('⚕️ Paladin', ()=> pick('Paladin','WIS',2,{ name:'Lumière', cooldown:3, cd:0, use:()=>{ heal(rng.between(3,8)+state.level); } }));
  addChoice('🏹 Rôdeur',  ()=> pick('Rôdeur','AGI',3,{ name:'Tir précis', cooldown:2, cd:0, use:(e)=>{ const r=d20(6).total; if(r>=e.ac){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🏹 Tir précis : -${dmg} PV`,'good') } else write('Tir manqué.','warn'); } }));
  addChoice('🔮 Mystique',()=> pick('Mystique','WIS',3,{ name:'Onde arcanique', cooldown:3, cd:0, use:(e)=>{ const dmg=rng.between(3,8); e.hp-=dmg; e.dotChance=Math.min(0.6,(e.dotChance||0)+0.15); write(`🔮 Onde arcanique : -${dmg} PV`,'good'); } }));
}

// ---------- État initial ----------
function initialState(){
  return {
    name:"Eldarion",
    cls:"—",
    attrs:{STR:1,AGI:1,WIS:1},
    hp:22, hpMax:22,
    gold:12, level:1, xp:0,
    rep:0,
    day:1, time:"Aube",
    location:"Lisière de la forêt de Mirval",
    locationKey:"clairiere",
    inventory:[
      {name:"Vieille épée", desc:"+1 attaque", emoji:"🗡️", rarity:"common"},
      {name:"Petite armure", desc:"+1 armure", emoji:"🛡️", rarity:"common"}
    ],
    potions:1,
    status:[],
    flags:{
      metHerbalist:false,metSmith:false,peasantSaved:false,
      fragments:0,bossUnlocked:false,torch:false,oracleSeen:false,
      ruinsUnlocked:true,grottoUnlocked:false,rumors:0,charm:0,
      scouted:false,scoutedChest:false,rope:0
    },
    quests:{
      main:{title:'Le Chef Bandit',state:'En cours'},
      side:[],
      artifacts:{title:'Fragments d’artefact (0/3)',state:'En cours'}
    },
    achievements:{},
    lastLabels:[],
    inCombat:false,
    enemy:null,
    skill:{name:"", cooldown:0, cd:0, use:()=>{}}
  };
}
let state = initialState();

// ---------- Setup / Démarrage ----------
function setup(isNew=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();
  if (isNew || ui.log.childElementCount===0 || !state.cls || state.cls==="—"){
    write("v10 — Démarrage.","sys");
    chooseClass();
    return;
  }
  explore(true);
}

// ---------- Début aventure ----------
function startAdventure(){
  ui.log.innerHTML="";
  addScene('forest');
  write("L'aventure commence !","info");
  setStats();
  explore(true);
}

// ---------- Cooldown compétence à chaque exploration ----------
const _explore = explore;
explore = function(...args){
  if(state.skill && typeof state.skill.cd==='number'){
    state.skill.cd = Math.max(0, state.skill.cd-1);
  }
  _explore(...args);
};

// ---------- Game Over ----------
function gameOver(){
  state.inCombat=false;
  write("<b>☠️ Tu t'effondres… La forêt de Mirval se referme sur ton destin.</b>","bad");
  clearChoices();
  addChoice("Recommencer", ()=>{ state=initialState(); ui.log.innerHTML=""; setup(true); }, true);
}

// ---------- Reset bouton (dans play.html) ----------
const btnReset=document.getElementById('btn-reset');
if(btnReset) btnReset.onclick=()=>{ state=initialState(); ui.log.innerHTML=""; setup(true); };

// ---------- Boot ----------
(function boot(){
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>setup(true), { once:true });
  else setup(true);
})();
