// === Aventurier de Mirval — game.js (v10 progression & anti-répétition) ===
console.log("game.js v10 progression chargé");

// Garder l’écran éveillé (mobile)
let wakeLock;
async function keepAwake(){ try{ wakeLock = await navigator.wakeLock.request('screen'); } catch(e){} }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && 'wakeLock' in navigator) keepAwake(); });
if('wakeLock' in navigator) keepAwake();

// RNG avec graine (xorshift)
const rng = (() => {
  const seed = (crypto.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]^Date.now():Date.now())>>>0;
  let s = seed>>>0;
  function rand(){ s ^= s<<13; s>>>=0; s ^= s>>17; s>>>=0; s ^= s<<5; s>>>=0; return (s>>>0)/0xFFFFFFFF; }
  function between(min,max){ return Math.floor(rand()*(max-min+1))+min; }
  return {rand, between, seed};
})();
const seedEl = document.getElementById('seedInfo'); if(seedEl) seedEl.textContent = `seed ${rng.seed}`;

// Références UI
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

// UI helpers
function write(text, cls=""){ const p=document.createElement('p'); if(cls) p.classList.add(cls); p.innerHTML=text; ui.log.appendChild(p); ui.log.scrollTop=ui.log.scrollHeight; }
function clearChoices(){ ui.choices.innerHTML=""; }
function addChoice(label, handler, primary=false){ const b=document.createElement('button'); if(primary) b.classList.add('btn-primary'); b.textContent=label; b.onclick=handler; ui.choices.appendChild(b); }

// Stats & affichage
function repText(n){return n>=30?'Vertueux':n<=-30?'Sombre':'Neutre'}
function setStats(){
  ui.hp.textContent=state.hp; ui.hpmax.textContent=state.hpMax;
  ui.hpbar.style.width=Math.max(0,Math.min(100,Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent=state.gold; ui.lvl.textContent=state.level; ui.xp.textContent=state.xp;
  ui.status.textContent = state.status.length? state.status.map(s=>s.name).join(', ') : '—';
  ui.pclass.textContent=state.cls; ui.pname.textContent=state.name;
  ui.astr.textContent=state.attrs.STR; ui.aagi.textContent=state.attrs.AGI; ui.awis.textContent=state.attrs.WIS;
  ui.rep.textContent=state.rep; ui.repLabel.textContent=repText(state.rep);

  // Inventaire
  ui.inv.innerHTML="";
  state.inventory.forEach(it=>{
    const d=document.createElement('div'); d.className='stat';
    d.innerHTML=`<b>${it.name}</b><span>${it.desc}</span>`;
    ui.inv.appendChild(d);
  });

  // Quêtes & progression
  ui.quests.innerHTML="";
  const mq=document.createElement('div'); mq.className='stat';
  mq.innerHTML=`<b>${state.quests.main.title} — Chapitre ${state.story.chapter}</b><span>${state.quests.main.state}</span>`;
  ui.quests.appendChild(mq);
  const aq=document.createElement('div'); aq.className='stat';
  aq.innerHTML=`<b>Fragments d’artefact (${state.flags.fragments}/3)</b><span>${state.quests.artifacts.state}</span>`;
  ui.quests.appendChild(aq);
  state.quests.side.forEach(q=>{
    const x=document.createElement('div'); x.className='stat';
    x.innerHTML=`<b>${q.title}</b><span>${q.state}</span>`;
    ui.quests.appendChild(x);
  });
}

// Dés & helpers
function d20(mod=0){ const roll=rng.between(1,20); const total=roll+mod; ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${roll} = ${total}`; return {roll,total}; }
function heal(n){ state.hp=Math.min(state.hpMax,state.hp+n); setStats(); write(`+${n} PV`,"good"); }
function damage(n,src=""){ state.hp=Math.max(0,state.hp-n); setStats(); write(`-${n} PV ${src?`(${src})`:''}`,"bad"); if(state.hp<=0){ gameOver(); return true; } return false; }
function changeGold(n){ state.gold=Math.max(0,state.gold+n); setStats(); write(`Or ${n>=0?'+':''}${n} (total: ${state.gold})`, n>=0?"good":"warn"); }
function addItem(name,desc){ state.inventory.push({name,desc}); if(name==='Anneau de vigueur'){ state.hpMax+=2; state.hp=Math.min(state.hp+2,state.hpMax); } setStats(); write(`Tu obtiens <b>${name}</b>.`,"good"); }
function hasItem(name){ return state.inventory.some(i=>i.name===name); }
function removeItem(name){ const i=state.inventory.findIndex(x=>x.name===name); if(i>=0){ state.inventory.splice(i,1); setStats(); } }
function gainXP(n){ state.xp+=n; write(`XP +${n} (total ${state.xp})`,"info"); const need=20+(state.level-1)*15; if(state.xp>=need){ state.level++; state.xp=0; state.hpMax+=5; state.hp=state.hpMax; write(`<b>Niveau ${state.level} !</b> PV max +5, PV restaurés.`,"good"); } setStats(); }
function rep(n){ state.rep+=n; setStats(); }

// Bouton reset (dans la colonne)
const resetBtn=document.getElementById('btn-reset');
if(resetBtn){ resetBtn.onclick=()=>{ state=initialState(); ui.log.innerHTML=""; setup(true); write("Nouvelle aventure !","sys"); }; }

// Statuts récurrents
function tickStatus(){
  state.status = state.status.filter(st=>{
    if(st.type==='poison'){ const dmg=rng.between(1,2); damage(dmg,"Poison"); st.dur--; }
    if(st.type==='bleed'){ const dmg=2; damage(dmg,"Saignement"); st.dur--; }
    if(st.type==='slow'){ st.dur--; if(st.dur===0) write('💨 Tu te sens plus léger.','info'); }
    return st.dur>0 && state.hp>0;
  });
}

// ---- Combat
function playerAtkMod(){ let m=0; if(state.cls==='Guerrier') m+=2; if(state.attrs.STR>=3) m+=1; if(hasItem('Épée affûtée')) m+=1; return m; }
function playerDef(){ return 10 + (state.cls==='Paladin'?1:0) + (state.attrs.AGI>=3?1:0) + (hasItem('Petite armure')?1:0) + (hasItem('Cuir renforcé')?2:0) + (hasItem('Bouclier en fer')?2:0); }
function terrainPenalty(){ return state.locationKey==='marais' ? -1 : 0 }
function dealDamage(e, amount, type='physical'){
  let dmg=amount;
  if(type==='physical' && e.resistPhysical) dmg=Math.max(0,Math.round(dmg*(1-e.resistPhysical)));
  if(type==='magic'    && e.weakMagic)      dmg=Math.round(dmg*(1+e.weakMagic));
  if(type==='holy'     && e.weakHoly)       dmg=Math.round(dmg*(1+e.weakHoly));
  e.hp-=dmg; return dmg;
}
function scaleEnemy(e){
  const days=Math.max(0,state.day-1);
  e.maxHp = e.maxHp??e.hp;
  e.hp += Math.floor(days*1.2);
  e.maxHp += Math.floor(days*1.2);
  if(days>=4) e.ac+=1;
  e.hitMod += Math.floor(days/3);
  return e;
}
function combat(mon){
  clearChoices(); state.inCombat=true; state.enemy=JSON.parse(JSON.stringify(mon)); scaleEnemy(state.enemy);
  write(`<b>${state.enemy.name}</b> apparaît ! ❤️ ${state.enemy.hp} — CA ${state.enemy.ac}`,"warn"); combatTurn();
}
function combatTurn(){
  if(!state.inCombat) return;
  if(state.hp<=0){ gameOver(); return; }
  if(state.enemy.hp<=0){ write(`<b>${state.enemy.name} est vaincu !</b>`,"good"); afterCombat(); return; }
  clearChoices(); const e=state.enemy;

  addChoice(`Attaquer`, ()=>aimMenu(), true);
  addChoice(`Parer`, ()=>{
    const bonus = state.cls==='Rôdeur'?2:1; const m=d20(e.hitMod).total;
    const armor = 12 + bonus + (hasItem("Petite armure")?1:0) + (hasItem("Cuir renforcé")?2:0) + (hasItem("Bouclier en fer")?2:0);
    if(m>=armor){ const dmg=Math.max(0,rng.between(1,3+e.tier)-2-bonus); write(`Parade partielle, -${dmg} PV.`,"warn"); damage(dmg,e.name); }
    else write("Tu pares complètement !","good"); combatTurn();
  });
  addChoice(`Compétence`, ()=>{
    if(state.skill.cd){ write("Compétence en recharge.","warn"); return combatTurn(); }
    state.skill.use(e); state.skill.cd=state.skill.cooldown;
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
    if(r>=e.ac+2){ const base=rng.between(6,10); const dmg=dealDamage(e,base,'physical'); write(`🎯 Coup à la tête : -${dmg} PV`,'good'); }
    else write('Tu manques la tête.','warn'); enemyAttack(); combatTurn();
  }, true);
  addChoice('Viser le torse', ()=>{
    const r=d20(playerAtkMod() + terrainPenalty()).total;
    if(r>=e.ac){ const base=rng.between(3,7); const dmg=dealDamage(e,base,'physical'); write(`🗡️ Frappe au torse : -${dmg} PV`,'good'); }
    else write('Tu manques.','warn'); enemyAttack(); combatTurn();
  });
  addChoice('Viser les jambes', ()=>{
    const r=d20(playerAtkMod()+1 + terrainPenalty()).total;
    if(r>=e.ac-1){ const base=rng.between(2,5); const dmg=dealDamage(e,base,'physical'); state.status.push({type:'slow',name:'Ralentissement',dur:2}); write(`🦵 Frappe aux jambes : -${dmg} PV (ennemi ralenti)`,'good'); }
    else write('Tu manques les jambes.','warn'); enemyAttack(); combatTurn();
  });
  addChoice('Annuler', combatTurn);
}
function enemyAttack(){
  const e=state.enemy; const roll=d20(e.hitMod).total; const def=playerDef()+terrainPenalty();
  if(roll>=def){
    let dmg=rng.between(1,3+e.tier);
    if(e.name==='Bandit des fourrés' && rng.rand()<0.2){ changeGold(-1); write('🪙 Le bandit te détrousse !','warn'); }
    if(e.name==='Assassin sinueux' && rng.rand()<0.25){
      const steal=rng.between(2,5); changeGold(-steal); write(`🗡️ L'assassin te détrousse (${steal} or) !`,'warn');
      if(rng.rand()<0.5){ write("💨 Il s'échappe dans l’ombre…",'warn'); state.inCombat=false; state.enemy=null; explore(); return; }
    }
    if(e.name==='Ours ancien' && rng.rand()<0.15){ state.status.push({type:'slow',name:'Ralentissement',dur:1}); dmg++; write('🧊 Impact assommant !','warn'); }
    damage(dmg,e.name);
    if(e.dotChance && rng.rand()<e.dotChance){
      if(e.dotType==='poison') state.status.push({type:'poison', name:'Poison', dur:rng.between(2,5)});
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
  const r=rng.rand();
  if(r<0.18 && !hasItem("Épée affûtée")) addItem("Épée affûtée","+1 attaque");
  else if(r<0.33 && !hasItem("Bouclier en bois")) addItem("Bouclier en bois","+1 armure légère");
  else if(r<0.44) { state.potions++; write("Tu trouves une potion.","good"); }
  else if(r<0.5 && !hasItem("Cuir renforcé")) addItem("Cuir renforcé","+2 armure souple");
  explore();
}

// ---- Bestiaire
const mobTemplates = {
  wolf: ()=>({ name:"Loup affamé", hp:10, maxHp:10, ac:11, hitMod:2, tier:1, dotChance:0 }),
  bandit: ()=>({ name:"Bandit des fourrés", hp:12, maxHp:12, ac:12, hitMod:3, tier:2, dotChance:0.1, dotType:'bleed' }),
  boar: ()=>({ name:"Sanglier irascible", hp:11, maxHp:11, ac:11, hitMod:2, tier:1, dotChance:0.05, dotType:'bleed' }),
  harpy: ()=>({ name:"Harpie du vent", hp:14, maxHp:14, ac:13, hitMod:4, tier:2, dotChance:0.2, dotType:'bleed' }),
  ghoul: ()=>({ name:"Goule des roseaux", hp:13, maxHp:13, ac:12, hitMod:3, tier:2, dotChance:0.25, dotType:'poison' }),
  // Nouveaux
  wraith: ()=>({ name:"Spectre errant", hp:16, maxHp:16, ac:14, hitMod:5, tier:3, dotChance:0.15, dotType:'bleed', resistPhysical:0.75, weakMagic:0.5, weakHoly:0.5 }),
  scorpion: ()=>({ name:"Scorpion du sable", hp:15, maxHp:15, ac:12, hitMod:4, tier:2, dotChance:0.5, dotType:'poison' }),
  bear: ()=>({ name:"Ours ancien", hp:20, maxHp:20, ac:12, hitMod:4, tier:3, dotChance:0.1, dotType:'bleed' }),
  assassin: ()=>({ name:"Assassin sinueux", hp:14, maxHp:14, ac:14, hitMod:6, tier:3, dotChance:0 }),
  banditChief: ()=>({ name:"Chef Bandit", hp:24, maxHp:24, ac:14, hitMod:5, tier:3, dotChance:0.3, dotType:'bleed' }),
};

// ---- Progression & état initial
function initialState(){
  return {
    name:"Eldarion", cls:"—",
    attrs:{STR:1,AGI:1,WIS:1},
    hp:20, hpMax:20, gold:10,
    level:1, xp:0, rep:0,
    day:1, time:"Aube",
    location:"Village de Mirval",  // HUB par défaut
    locationKey:"village",
    inventory:[{name:"Vieille épée", desc:"+1 attaque"},{name:"Petite armure", desc:"+1 armure"}],
    potions:1, status:[],
    flags:{
      metHerbalist:false,metSmith:false,peasantSaved:false,
      fragments:0,bossUnlocked:false,torch:false,oracleSeen:false,
      ruinsUnlocked:true,grottoUnlocked:false,rumors:0,charm:0,
      doorHint:false, bossDefeated:false, highlandsUnlocked:false
    },
    quests:{
      main:{title:'Traque du Chef Bandit',state:'Rassembler 3 fragments & trouver la porte ancienne'},
      side:[],
      artifacts:{title:'Fragments d’artefact (0/3)',state:'En cours'}
    },
    achievements:{},
    // anti-répétition
    lastLabels:[],
    cooldowns:{},          // id -> tours restants
    decks:{},              // zone -> deck (queue d’événements)
    inCombat:false, enemy:null,
    skill:{name:"", cooldown:0, cd:0, desc:"", use:()=>{}},
    story:{chapter:1, step:0}
  };
}
let state=initialState();

// ---- DECK SYSTEM (anti-répétition, conditions & progression)
function addToDeck(arr, item, copies){ for(let i=0;i<copies;i++) arr.push({...item}); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(rng.rand()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a; }

// Définition des “cartes” d’événements par zone
const ZONE_EVENTS = {
  village: [
    {id:'v_shop', label:'Aller au marché', act:eventVillageShop, w:2, cd:2},
    {id:'v_rumor', label:'Écouter les rumeurs', act:eventVillageRumor, w:1, cd:2},
    {id:'v_rest', label:'Se reposer à l’auberge', act:eventVillageRest, w:2, cd:1},
    {id:'go_clr', label:'→ Partir vers la Clairière', act:()=>gotoZone('clairiere'), w:2, cd:0},
    {id:'go_hl',  label:'→ Partir vers les Hautes Terres', act:()=> state.flags.highlandsUnlocked? gotoZone('hautesterres') : (write("Cette route est barrée par les gardes… pour l’instant.","info"), continueBtn()), w:1, cd:0},
  ],
  clairiere: [
    {id:'e_herb', label:'Croiser une herboriste', act:eventHerbalist, w:2, cd:2},
    {id:'e_bard', label:'Écouter un barde', act:eventBard, w:1, cd:2},
    {id:'m_boar', label:'Chasser un sanglier', act:()=>combat(mobTemplates.boar()), w:2, cd:2},
    {id:'e_sanct',label:'Autel moussu', act:eventSanctuary, w:1, cd:2},
    {id:'m_band', label:'Bandits embusqués', act:()=>combat(mobTemplates.bandit()), w:2, cd:2},
    {id:'nav_v',  label:'→ Revenir au Village', act:()=>gotoZone('village'), w:1, cd:0},
    {id:'nav_marais', label:'→ Marais', act:()=>gotoZone('marais'), w:1, cd:0},
    {id:'nav_hill', label:'→ Colline', act:()=>gotoZone('colline'), w:1, cd:0},
  ],
  marais: [
    {id:'e_wisp', label:'Suivre des feux-follets', act:eventSanctuary, w:1, cd:2},
    {id:'e_peasant', label:'Aider un captif', act:()=>{ if(!state.flags.peasantSaved) eventPeasant(); else { write('La berge est silencieuse.'); continueBtn(); } }, w:1, cd:3},
    {id:'m_ghoul', label:'Traquer une goule', act:()=>combat(mobTemplates.ghoul()), w:2, cd:2},
    {id:'m_wolf',  label:'Affronter un loup', act:()=>combat(mobTemplates.wolf()), w:1, cd:2},
    {id:'e_trap',  label:'Tomber sur un piège', act:()=>{ eventTrap(); continueBtn(); }, w:1, cd:2},
    {id:'nav_clr', label:'→ Clairière', act:()=>gotoZone('clairiere'), w:1, cd:0},
  ],
  colline: [
    {id:'e_hermit', label:'Rencontrer un ermite', act:eventHermit, w:1, cd:2},
    {id:'e_ruins',  label:'Explorer des ruines', act:eventRuins, w:2, cd:2},
    {id:'m_harpy',  label:'Affronter une harpie', act:()=>combat(mobTemplates.harpy()), w:2, cd:2},
    {id:'e_smith',  label:'Croiser un forgeron', act:eventSmith, w:1, cd:2},
    {id:'e_tree',   label:'Arbre ancien', act:eventAncientTree, w:1, cd:3},
    {id:'nav_clr',  label:'→ Clairière', act:()=>gotoZone('clairiere'), w:1, cd:0},
    {id:'nav_ruins',label:'→ Ruines', act:()=>gotoZone('ruines'), w:1, cd:0},
    {id:'nav_v',    label:'→ Village', act:()=>gotoZone('village'), w:1, cd:0},
  ],
  ruines: [
    {id:'e_ruins',  label:'Fouiller les décombres', act:eventRuins, w:2, cd:2},
    {id:'e_vault',  label:'Caveau scellé', act:eventSealedVault, w:1, cd:3},
    {id:'m_wraith', label:'Spectre errant', act:()=>combat(mobTemplates.wraith()), w:2, cd:2, minDay:2},
    {id:'m_assassin', label:'Assassin sinueux', act:()=>combat(mobTemplates.assassin()), w:1, cd:3},
    {id:'nav_hill', label:'→ Colline', act:()=>gotoZone('colline'), w:1, cd:0},
    {id:'nav_grotte',label:'→ Grotte', act:()=> state.flags.torch? gotoZone('grotte') : (write('Il fait trop sombre pour entrer.','warn'), continueBtn()), w:1, cd:0},
  ],
  grotte: [
    {id:'m_ghoul_a', label:'Goule ancienne', act:()=>combat({name:'Goule ancienne',hp:18,maxHp:18,ac:13,hitMod:5,tier:3,dotChance:0.35,dotType:'poison'}), w:2, cd:2},
    {id:'e_echo', label:'Échos inquiétants', act:()=>{ const r=d20().total; if(r<10) damage(3,'Stalactite'); else write('Rien ne se passe.'); continueBtn(); }, w:1, cd:2},
    {id:'m_scorp', label:'Scorpion du sable', act:()=>combat(mobTemplates.scorpion()), w:1, cd:2},
    {id:'nav_ruines',label:'→ Ruines', act:()=>gotoZone('ruines'), w:1, cd:0},
  ],
  hautesterres: [
    {id:'hl_bear', label:'Ours ancien', act:()=>combat(mobTemplates.bear()), w:2, cd:2},
    {id:'hl_runestone', label:'Pierre runique', act:eventRunestone, w:2, cd:2},
    {id:'hl_wraith', label:'Spectre des crêtes', act:()=>combat(mobTemplates.wraith()), w:1, cd:2, minDay:5},
    {id:'nav_v', label:'→ Village', act:()=>gotoZone('village'), w:1, cd:0},
  ],
};

// Génération du deck pour une zone
function buildDeck(zone){
  const raw = ZONE_EVENTS[zone]||[];
  const deck=[];
  raw.forEach(card=>{
    if(card.minDay && state.day<card.minDay) return;
    if(card.needFlag && !state.flags[card.needFlag]) return;
    const copies = Math.max(1, card.w||1);
    addToDeck(deck, card, copies);
  });
  return shuffle(deck);
}

// Pioche k cartes jouables (anti-répétition par cooldown et libellés récents)
function drawChoices(zone, k){
  if(!state.decks[zone] || state.decks[zone].length===0){ state.decks[zone]=buildDeck(zone); }
  const out=[];
  const seen=new Set();
  // diminuer tous les cooldowns
  Object.keys(state.cooldowns).forEach(id=>{ state.cooldowns[id]=Math.max(0, state.cooldowns[id]-1); });

  let safety=50;
  while(out.length<k && safety-->0){
    if(state.decks[zone].length===0) state.decks[zone]=buildDeck(zone);
    const card = state.decks[zone].shift();
    // filtres
    if(state.cooldowns[card.id]>0){ state.decks[zone].push(card); continue; }
    if(state.lastLabels.includes(card.label)){ state.decks[zone].push(card); continue; }
    if(seen.has(card.id)){ state.decks[zone].push(card); continue; }

    // OK, garder
    out.push(card);
    seen.add(card.id);

    // remettre en queue (deck cyclique)
    state.decks[zone].push(card);
  }

  // appliquer cooldown choisi
  out.forEach(c=>{ if((c.cd||0)>0) state.cooldowns[c.id]=(c.cd||0); });

  // mémoire de libellés (anti-immédiat)
  state.lastLabels = [...out.map(o=>o.label), ...state.lastLabels].slice(0,8);

  return out;
}

// ---- Temps & exploration
function setTime(){
  const slots=["Aube","Matin","Midi","Après-midi","Crépuscule","Nuit"];
  const idx=slots.indexOf(state.time); let n=(idx+1)%slots.length; if(n===0) state.day++;
  state.time=slots[n]; ui.day.textContent=`Jour ${state.day} — ${state.time}`;
}

function explore(initial=false){
  setStats(); ui.loc.textContent=state.location; ui.day.textContent=`Jour ${state.day} — ${state.time}`;
  clearChoices(); if(!initial) setTime(); tickStatus(); if(state.hp<=0) return;

  // Événement scénarisé (porte ancienne) si conditions remplies
  if(state.story.chapter===1 && state.flags.fragments>=3 && state.flags.torch && !state.flags.bossUnlocked){
    eventAncientDoor(); return;
  }

  // Oracle au J5
  if(state.day>=5 && !state.flags.oracleSeen){ eventOracle(); return; }

  // Actions de base (toujours)
  const base = [
    {label:"Fouiller", act:searchArea, primary:true},
    {label:"Se reposer", act:rest},
    {label:"Utiliser un objet", act:useItemMenu},
  ];

  // Tirage dans le deck
  const dyn = drawChoices(state.locationKey, 3 + (rng.rand()<0.4?1:0));

  // Composer & afficher
  const all = [
    ...base.map((b,i)=>({label:b.label, act:b.act, primary:i===0})),
    ...dyn.map((c)=>({label:c.label, act:c.act}))
  ].slice(0,5);

  all.forEach((c,i)=> addChoice(c.label, c.act, c.primary||false));
}

function continueBtn(){ addChoice("Continuer", ()=>explore(), true); }

function gotoZone(key){
  state.locationKey=key;
  state.location = key==='village'?"Village de Mirval":
                   key==='clairiere'?"Clairière des Lys":
                   key==='marais'?"Marais de Vire-Saule":
                   key==='colline'?"Colline de Rocfauve":
                   key==='ruines'?"Ruines Oubliées":
                   key==='grotte'?"Grotte Sépulcrale":
                   key==='hautesterres'?"Hautes Terres":"Lisière";
  write(`👉 Tu te diriges vers ${state.location}.`,"sys");
  explore(true);
}

// ---- Actions générales
function searchArea(){
  const bonus = state.attrs.WIS>=3?1:0; const {total}=d20(bonus);
  if(total>=18){ write("🔑 Recherche exceptionnelle : tu trouves un coffre scellé.","good"); chest(); }
  else if(total>=12){ write("✨ Quelques pièces sous une pierre.","good"); changeGold(rng.between(2,6)); }
  else if(total>=8){ write("Des traces fraîches… une rencontre approche."); if(rng.rand()<0.5) randomEncounter(); }
  else { write("Aïe ! Ronce traîtresse.","bad"); damage(rng.between(1,3),"Ronces"); }
  continueBtn();
}
function rest(){ if(rng.rand()<0.3){ write("Quelque chose approche pendant ton repos…","warn"); randomEncounter(); } else { heal(rng.between(4,8)); write("Tu dors un peu. Ça fait du bien.","good"); } continueBtn(); }
function useItemMenu(){
  clearChoices();
  addChoice(`Boire une potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Tu n'as pas de potion.","warn"); return continueBtn(); }
    state.potions--; heal(rng.between(8,12)); continueBtn();
  }, true);
  addChoice("Annuler", ()=>explore());
}
function chest(){
  const r=rng.between(1,100);
  if(r>95){ addItem("Anneau de vigueur","+2 PV max"); }
  else if(r>90){ addItem("Bouclier en fer","+2 armure"); }
  else if(r>70){ addItem("Potion de soin","Rest. 8-12 PV"); state.potions++; }
  else if(r>40){ changeGold(rng.between(7,15)); }
  else { write("💥 Piège !","bad"); damage(rng.between(3,6),"Piège"); }
}
function randomEncounter(){
  const zone=state.locationKey; const roll=rng.rand();
  if(roll<0.5){
    if(zone==='marais') combat(mobTemplates.ghoul());
    else if(zone==='clairiere') combat(mobTemplates.bandit());
    else if(zone==='hautesterres') combat(mobTemplates.bear());
    else combat(mobTemplates.harpy());
  }else{
    [eventSanctuary,eventHerbalist,eventSmith,eventHermit][rng.between(0,3)]();
  }
}

// ---- Village (HUB)
function eventVillageShop(){
  write('🛒 Le marché est animé : potions, cuir, rumeurs.');
  clearChoices();
  addChoice('Acheter une potion (4 or)', ()=>{ if(state.gold>=4){ changeGold(-4); state.potions++; write('Tu achètes une potion.','good'); } else write("Pas assez d'or.",'warn'); continueBtn(); }, true);
  addChoice('Acheter cuir renforcé (8 or)', ()=>{ if(hasItem('Cuir renforcé')){ write('Tu es déjà équipé.','info'); return continueBtn(); } if(state.gold>=8){ changeGold(-8); addItem('Cuir renforcé','+2 armure souple'); } else write("Pas assez d'or.",'warn'); continueBtn(); });
  addChoice('Discuter avec les marchands', ()=>{ gainXP(3); write('Tu apprends des routes plus sûres.','info'); continueBtn(); });
  addChoice('Quitter', continueBtn);
}
function eventVillageRumor(){
  write('🗣️ À la taverne, on parle de caches et de routes.');
  clearChoices();
  addChoice('Écouter attentivement', ()=>{
    state.flags.rumors++; write('Tu retiens de précieuses indications.','info');
    if(state.flags.rumors>=2 && !state.flags.doorHint){ state.flags.doorHint=true; write('On évoque une “porte ancienne” près des ruines.','info'); }
    continueBtn();
  }, true);
  addChoice('S’en aller', continueBtn);
}
function eventVillageRest(){
  write('🛏️ Tu te reposes à l’auberge (2 or).');
  clearChoices();
  addChoice('Payer et dormir', ()=>{
    if(state.gold>=2){ changeGold(-2); heal(rng.between(6,12)); }
    else write("Pas assez d'or.","warn");
    continueBtn();
  }, true);
  addChoice('Renoncer', continueBtn);
}

// ---- Événements existants & nouveaux
function eventHerbalist(){ write("🌿 Une herboriste te fait signe."); clearChoices();
  addChoice("S’approcher", ()=>{ if(state.rep<-20){ write("Elle se détourne : 'Je ne sers pas les cruels.'",'warn'); rep(-1); return continueBtn(); } const cost=(state.rep>20?2:3); if(state.gold>=cost){ changeGold(-cost); heal(rng.between(6,12)); state.flags.metHerbalist=true } else write("Tu n'as pas assez d'or.","warn"); continueBtn(); }, true);
  addChoice("Marchander", ()=>{ const {total}=d20(state.attrs.WIS>=3?2:0); if(total>=15){ heal(rng.between(4,8)); write('“À prix d’ami.”','good'); } else write('Elle refuse.','warn'); continueBtn(); });
  addChoice("Partir", continueBtn);
}
function eventSmith(){ write('⚒️ Un forgeron itinérant inspecte tes armes.'); clearChoices();
  addChoice('Améliorer (épée affûtée, 5 or)', ()=>{ if(state.gold>=5){ changeGold(-5); if(!hasItem('Épée affûtée')) addItem('Épée affûtée','+1 attaque'); else write('Déjà affûtée.','info'); } else write("Pas assez d'or.",'warn'); continueBtn(); }, true);
  addChoice('Bouclier en fer (6 or)', ()=>{ if(state.gold>=6){ changeGold(-6); if(!hasItem('Bouclier en fer')) addItem('Bouclier en fer','+2 armure'); else write('Déjà équipé.','info'); } else write("Pas assez d'or.",'warn'); continueBtn(); });
  addChoice('Discuter', ()=>{ gainXP(3); continueBtn(); });
}
function eventBard(){ write('🎻 Un barde propose une chanson.'); clearChoices();
  addChoice('Écouter', ()=>{ if(rng.rand()<0.7){ heal(rng.between(3,7)); } else { changeGold(-2); write('La bourse s’est allégée…','warn'); } continueBtn(); }, true);
  addChoice('L’ignorer', continueBtn);
}
function eventRuins(){ write('🏚️ Des ruines effondrées se dressent.'); clearChoices();
  addChoice('Fouiller', ()=>{ const {total}=d20(state.attrs.WIS>=3?1:0);
    if(total>=16){ if(!state.flags.torch){ state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte'); } else { state.flags.fragments++; write('Tu trouves un fragment d’artefact.','good'); updateFragmentsUI(); } }
    else if(total>=10){ chest(); } else { damage(rng.between(2,5),'Éboulement'); }
    continueBtn();
  }, true);
  addChoice('Partir', continueBtn);
}
function updateFragmentsUI(){ state.quests.artifacts.title=`Fragments d’artefact (${state.flags.fragments}/3)`; setStats(); }
function eventPeasant(){ write('🧑‍🌾 Un paysan enchaîné appelle à l’aide.'); clearChoices();
  addChoice('Le libérer', ()=>{ const {total}=d20(state.attrs.STR>=3?2:0); if(total>=14){ write('Les chaînes cèdent.','good'); rep(+5); state.flags.peasantSaved=true; state.quests.side.push({title:'Le paysan reconnaissant',state:'En attente'}); } else { damage(rng.between(1,4),'Effort'); } continueBtn(); }, true);
  addChoice('L’ignorer', ()=>{ rep(-3); continueBtn(); });
}
function eventSanctuary(){ write('⛪ Un ancien sanctuaire se dévoile.'); clearChoices();
  addChoice('Prier', ()=>{ const night=state.time==='Nuit'||state.time==='Crépuscule'; const {total}=d20(); const t=total+(night?1:0); if(t>=15){ heal(rng.between(6,12)); rep(+2); } else { damage(rng.between(2,6),'Présage'); rep(-1); } continueBtn(); }, true);
  addChoice('Désacraliser', ()=>{ const {total}=d20(-1); if(total>=16){ changeGold(rng.between(8,16)); rep(-3); } else { damage(rng.between(4,7),'Malédiction'); rep(-5); } continueBtn(); });
  addChoice('Partir', continueBtn);
}
function eventHermit(){ write('🧙 Un ermite t’observe en silence.'); clearChoices();
  addChoice('Accepter sa décoction', ()=>{ if(rng.rand()<0.6){ heal(rng.between(5,10)); gainXP(3); } else { damage(rng.between(2,5),'Nausée'); } continueBtn(); }, true);
  addChoice('Acheter une breloque (5 or)', ()=>{ if(state.gold>=5){ changeGold(-5); addItem("Breloque d'ermite","10% annule un mal ?"); state.flags.charm=1; } else write("Pas assez d'or.",'warn'); continueBtn(); });
  addChoice('Refuser', continueBtn);
}
function eventTrap(){ write('🪤 Une corde s’enroule à ta cheville !'); const {total}=d20(state.attrs.AGI>=3?2:0); if(total>=13) write('Tu t’en sors de justesse.','good'); else damage(rng.between(2,5),'Piège'); }
function eventSealedVault(){ write('⚰️ Un caveau scellé, pierre contre pierre.'); clearChoices();
  addChoice('Forcer (STR)', ()=>{ const {total}=d20(state.attrs.STR>=3?2:0); if(total>=15){ if(!hasItem('Bouclier en fer')) addItem('Bouclier en fer','+2 armure'); else addItem('Anneau de vigueur','PV max +2'); } else { damage(rng.between(2,5),'Porte lourde'); } continueBtn(); }, true);
  addChoice('Chercher un mécanisme (WIS)', ()=>{ const {total}=d20(state.attrs.WIS>=3?2:0); if(total>=14){ changeGold(rng.between(6,12)); write('Un compartiment secret s’ouvre.','good'); } else write('Rien d’évident…','info'); continueBtn(); });
  addChoice('Renoncer', continueBtn);
}
function eventRunestone(){ write('🪨 Une pierre runique bourdonne d’une énergie sourde.'); clearChoices();
  addChoice('Étudier (WIS)', ()=>{ const {total}=d20(state.attrs.WIS>=3?2:0); if(total>=15){ gainXP(6); write('Tu déchiffres un ancien avertissement.','info'); } else { damage(rng.between(1,3),'Résonance'); } continueBtn(); }, true);
  addChoice('Prier', ()=>{ if(rng.rand()<0.6){ heal(rng.between(4,8)); } else { rep(-1); write('Un silence désapprobateur t’enveloppe.','warn'); } continueBtn(); });
  addChoice('Briser la pierre', ()=>{ if(rng.rand()<0.5){ changeGold(rng.between(5,12)); rep(-3); } else { damage(rng.between(3,6),'Onde arcanique'); rep(-5); } continueBtn(); });
}
function eventAncientTree(){ write('🌳 Au sommet de la colline, un arbre ancien murmure.'); clearChoices();
  addChoice('Toucher l’écorce', ()=>{ if(rng.rand()<0.5){ heal(rng.between(5,9)); } else { damage(rng.between(2,4),'Épine'); } continueBtn(); }, true);
  addChoice('Offrir du sang', ()=>{ const hp=rng.between(3,6); const dead=damage(hp,'Offrande'); if(!dead){ if(rng.rand()<0.5){ state.flags.fragments++; write('La sève se cristallise en un fragment.','good'); updateFragmentsUI(); } else { addItem('Braise sylvestre','Une graine chaude.'); } continueBtn(); } });
  addChoice('Ignorer', continueBtn);
}
function eventOracle(){ write('🔮 Une voyante apparaît dans tes rêves.'); clearChoices(); addChoice('Écouter la prophétie', ()=>{ write('“Quand trois éclats seront réunis, la porte s’ouvrira.”','info'); state.flags.oracleSeen=true; continueBtn(); }, true); }

// ---- Porte ancienne → mini-donjon → Boss
function eventAncientDoor(){
  write('🚪 Dans les ruines, une <b>porte ancienne</b> pulse faiblement.');
  clearChoices();
  addChoice('Ouvrir la porte', ()=>{
    write('La torche ancienne révèle des glyphes. La porte s’entrouvre…','info');
    miniDungeon();
  }, true);
  addChoice('Revenir plus tard', continueBtn);
}
function miniDungeon(){
  write('🕯️ Un couloir étroit, des murmures lointains.');
  clearChoices();
  addChoice('Progression discrète (AGI)', ()=>{
    const {total}=d20(state.attrs.AGI>=3?2:0);
    if(total>=14){ write('Tu évites une patrouille.','good'); combatBossEntrance(); }
    else { write('Tu fais tomber des gravats !','warn'); combat(mobTemplates.bandit()); }
  }, true);
  addChoice('Forcer le passage (STR)', ()=>{
    const {total}=d20(state.attrs.STR>=3?2:0);
    if(total>=14){ gainXP(5); combatBossEntrance(); }
    else { damage(rng.between(2,5),'Éboulis'); combatBossEntrance(); }
  });
  addChoice('Faire demi-tour', continueBtn);
}
function combatBossEntrance(){ write('🥷 Une salle faiblement éclairée…'); combatBoss(); }
function combatBoss(){
  const boss = mobTemplates.banditChief();
  write('🥷 Tu t’infiltres dans la planque du Chef Bandit.','warn'); combat(boss);
  const _enemyAttack = enemyAttack;
  enemyAttack = function(){
    if(state.enemy && state.enemy.name==='Chef Bandit' && state.enemy.hp<=state.enemy.maxHp/2 && !state.enemy.enraged){
      state.enemy.enraged=true; state.enemy.hitMod+=1; write('🔥 Le Chef Bandit entre en rage !','warn');
    }
    _enemyAttack();
    if(state.enemy && state.enemy.hp<=0){ onBossDefeated(); }
  }
}
function onBossDefeated(){
  state.flags.bossUnlocked=false;
  state.flags.bossDefeated=true;
  state.story.chapter=2;
  state.flags.highlandsUnlocked=true;
  state.quests.main.state='Chapitre 2 : Explorer les Hautes Terres';
  write('🏅 <b>Victoire !</b> Le Chef Bandit est vaincu. Les gardes du col ouvrent la route des <i>Hautes Terres</i>.','good');
  continueBtn();
}

// ---- Fins
function ending(){
  clearChoices();
  if(state.rep>=30){ write('<b>Fin héroïque :</b> Mirval te salue comme un sauveur.','good'); state.achievements.hero=true; }
  else if(state.rep<=-30){ write('<b>Fin sombre :</b> ta légende glace le sang des voyageurs.','bad'); state.achievements.villain=true; }
  else { write('<b>Fin neutre :</b> tu quittes la forêt, plus sage qu’avant.','info'); }
  addChoice('Rejouer (New Game+)', ()=>{ const st=initialState(); st.attrs.STR++; st.attrs.AGI++; st.attrs.WIS++; state=st; ui.log.innerHTML=''; setup(true); }, true);
  addChoice('Quitter', ()=>write('Merci d’avoir joué !'));
}

// ---- Choix de classe (affiché au démarrage)
function chooseClass(){
  clearChoices(); write('Choisis ta classe :','info');
  const pick=(nom, key, val, skill)=>{ state.cls=nom; if(key) state.attrs[key]=val; state.skill=skill; setStats(); startAdventure(); };
  addChoice('🛡️ Guerrier', ()=>pick('Guerrier','STR',3,{name:'Frappe vaillante', cooldown:3, cd:0, desc:'2d6+lvl', use:(e)=>{ const base=rng.between(2,6)+rng.between(2,6)+state.level; const d=dealDamage(e,base,'physical'); write(`💥 Frappe vaillante : -${d} PV`,'good'); }}), true);
  addChoice('🗡️ Voleur', ()=>pick('Voleur','AGI',3,{name:'Coup de l’ombre', cooldown:3, cd:0, desc:'+vol', use:(e)=>{ const r=d20(4).total; if(r>=e.ac){ const steal=Math.min(3,state.gold); const base=rng.between(3,8)+steal; const d=dealDamage(e,base,'physical'); changeGold(steal); write(`🗡️ L’ombre frappe : -${d} PV`,'good'); } else write('Tu rates.','warn'); }}));
  addChoice('⚕️ Paladin', ()=>pick('Paladin','WIS',2,{name:'Lumière', cooldown:3, cd:0, desc:'soin/saint', use:(e)=>{ if(e && /Spectre|Goule|Bandit/.test(e.name)){ const base=rng.between(3,8)+state.level; const d=dealDamage(e,base,'holy'); write(`✨ Lumière sacrée : -${d} PV`,'good'); } else { heal(rng.between(3,8)+state.level); } }}));
  addChoice('🏹 Rôdeur', ()=>pick('Rôdeur','AGI',3,{name:'Tir précis', cooldown:2, cd:0, desc:'+6,1d8', use:(e)=>{ const r=d20(6).total; if(r>=e.ac){ const base=rng.between(3,8); const d=dealDamage(e,base,'physical'); write(`🏹 Tir précis : -${d} PV`,'good'); } else write('Tir manqué.','warn'); }}));
  addChoice('🔮 Mystique',()=>pick('Mystique','WIS',3,{name:'Onde arcanique', cooldown:3, cd:0, desc:'1d8 + vuln', use:(e)=>{ const base=rng.between(3,8); const d=dealDamage(e,base,'magic'); e.dotChance=Math.min(0.6,(e.dotChance||0)+0.15); write(`🔮 Onde arcanique : -${d} PV`,'good'); }}));
}

// ---- Démarrage
function setup(isNew=false){
  setStats(); ui.loc.textContent=state.location; ui.day.textContent=`Jour ${state.day} — ${state.time}`; clearChoices();
  const classes=['Guerrier','Voleur','Paladin','Rôdeur','Mystique']; const needsClass = !state.cls || state.cls==='—' || !classes.includes(state.cls);
  if(isNew || ui.log.childElementCount===0 || needsClass){
    write("v10 — Démarrage (progression & anti-répétition).","sys"); chooseClass(); return;
  }
  explore(true);
}
function startAdventure(){ ui.log.innerHTML=""; write("L'aventure commence !","info"); setStats(); explore(true); }
function gameOver(){ state.inCombat=false; write("<b>☠️ Tu t'effondres… La forêt de Mirval se referme sur ton destin.</b>","bad"); clearChoices(); addChoice("Recommencer", ()=>{ state=initialState(); ui.log.innerHTML=""; setup(true); }, true); }

// Cooldown de compétence à chaque exploration
const _explore = explore;
explore = function(...args){ if(state.skill && typeof state.skill.cd==='number'){ state.skill.cd=Math.max(0,state.skill.cd-1); } _explore(...args); };

// Service worker (facultatif)
if('serviceWorker' in navigator){ window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js').catch(()=>{})); }

// Boot
window.addEventListener('DOMContentLoaded', ()=>{ try{ setup(true); }catch(e){ const p=document.createElement('p'); p.className='bad'; p.textContent="Erreur JavaScript: "+e.message; ui.log.appendChild(p); alert("Erreur JavaScript: "+e.message); } }, {once:true});
