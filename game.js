/* ============================================================
 * Aventurier de Mirval — v10 ULTIMATE (open-world, no-save)
 * Bloc 1/4 : Boot, État, UI, Utilitaires, Stats
 * ============================================================ */

window.__MIRVAL_JS_OK = true; // Indicateur boot OK pour le play.html de diagnostic

// ----------------- Garder l’écran éveillé (non bloquant) -----------------
let wakeLock;
async function keepAwake(){ try{ if('wakeLock' in navigator){ wakeLock = await navigator.wakeLock.request('screen'); } }catch{} }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') keepAwake(); });
keepAwake();

// ----------------- RNG avec graine (xorshift-like) -----------------
const rng = (() => {
  const seed = (crypto.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]^Date.now():Date.now())>>>0;
  let s = seed>>>0;
  function rand(){ s^=s<<13; s>>>=0; s^=s>>17; s>>>=0; s^=s<<5; s>>>=0; return (s>>>0)/0xFFFFFFFF; }
  function between(min,max){ return Math.floor(rand()*(max-min+1))+min; }
  return {rand, between, seed};
})();

// ----------------- État initial & constantes gameplay -----------------
const CLASSES = ['Guerrier','Voleur','Paladin','Rôdeur','Mystique'];
const EQUIP_SLOTS = ['arme','armure','bouclier','talisman'];

function initialState(){
  return {
    // Identité / Classe / Attributs "lisibles"
    name: "Eldarion",
    cls: "—",
    attrs: { // valeurs de base
      PUISSANCE: 1, // ex STR
      AGILITE : 1,  // ex AGI
      ESPRIT  : 1   // ex WIS
    },
    // PV & progression
    hp: 22, hpMax: 22,
    level: 1, xp: 0,
    // Économie / Réputation
    gold: 12,
    rep: 0, // -inf..+inf (étiquettes via repText)
    // Temps & Monde
    day: 1, time: "Aube",
    location: "Lisière de la forêt de Mirval",
    locationKey: "clairiere", // marais, clairiere, colline, ruines, grotte
    // Inventaire & équipement
    inventory: [
      { id:"vieille-epee", name:"Vieille épée", slot:"arme", mods:{atk:+1}, desc:"+1 attaque", sell:2, buy:4 },
      { id:"petite-armure", name:"Petite armure", slot:"armure", mods:{def:+1}, desc:"+1 armure", sell:2, buy:5 }
    ],
    equipment: { // slots équipés (id d’objet depuis inventory), null sinon
      arme: null, armure: null, bouclier: null, talisman: null
    },
    // Consommables / Statuts / Flags
    potions: 1,
    status: [], // ex {type:'poison',name:'Poison',dur:3}
    flags:{
      // PNJ/story
      metHerbalist:false, metSmith:false, metTrader:false, metMage:false,
      peasantSaved:false, oracleSeen:false,
      // Monde / clés
      torch:false, ruinsUnlocked:true, grottoUnlocked:false,
      // Rumeurs / boss
      rumors:0, bossUnlocked:false,
      // Artefacts
      fragments:0, // 0..3
      // Systèmes
      lockedAction:false // anti multi-click
    },
    // Quêtes & Succès
    quests:{
      main:{ title:"Le Chef Bandit", state:"En cours", objective:"Localiser et vaincre le Chef Bandit" },
      artifacts:{ title:"Fragments d’artefact (0/3)", state:"En cours", objective:"Réunir 3 fragments pour ouvrir la porte des ruines" },
      side:[ /* {title, state, objective?} */ ]
    },
    achievements:{},
    // Combat
    inCombat:false,
    enemy:null, // {name,hp,maxHp,ac,hitMod,tier,dotChance?,dotType?}
    // Compétence de classe
    skill:{ name:"", cooldown:0, cd:0, desc:"", use:()=>{} },
    // Historique d’options pour limiter la redondance
    lastLabels: []
  };
}

let state = initialState();

// ----------------- Références UI (bind après DOM ready) -----------------
const ui = {};
function bindUI(){
  ui.seedInfo = document.getElementById('seedInfo');
  ui.log = document.getElementById('log');
  ui.choices = document.getElementById('choices');
  ui.hp = document.getElementById('hp');
  ui.hpmax = document.getElementById('hpmax');
  ui.hpbar = document.getElementById('hpbar');
  ui.gold = document.getElementById('gold');
  ui.lvl = document.getElementById('lvl');
  ui.xp = document.getElementById('xp');
  ui.inv = document.getElementById('inventory');
  ui.loc = document.getElementById('location');
  ui.day = document.getElementById('day');
  ui.lastRoll = document.getElementById('lastRoll');
  ui.status = document.getElementById('status');
  ui.pclass = document.getElementById('p-class');
  ui.pname = document.getElementById('p-name');
  ui.astr = document.getElementById('a-str');
  ui.aagi = document.getElementById('a-agi');
  ui.awis = document.getElementById('a-wis');
  ui.rep = document.getElementById('rep');
  ui.repLabel = document.getElementById('rep-label');
  ui.quests = document.getElementById('quests');
  if(ui.seedInfo) ui.seedInfo.textContent = `seed ${rng.seed}`;
}

// ----------------- Utilitaires d’UI -----------------
function write(text, cls=""){ 
  const p=document.createElement('p'); 
  if(cls) p.classList.add(cls); 
  p.innerHTML=text; 
  ui.log.appendChild(p); 
  ui.log.scrollTop=ui.log.scrollHeight; 
}
function clearChoices(){ ui.choices.innerHTML=""; state.flags.lockedAction=false; }
function addChoice(label, handler, primary=false){
  const btn=document.createElement('button');
  if(primary) btn.classList.add('btn-primary');
  btn.textContent = label;
  btn.onclick = ()=>{
    if(state.flags.lockedAction) return; // anti multi click
    state.flags.lockedAction = true;
    try{ handler(); }catch(e){ console.error(e); write("❗ Une erreur est survenue.","bad"); }
    // petit délai pour éviter double déclenchement si handler réaffiche des boutons
    setTimeout(()=>{ state.flags.lockedAction=false; }, 10);
  };
  ui.choices.appendChild(btn);
}
function continueBtn(next){ 
  clearChoices(); 
  addChoice("Continuer", ()=>{ if(typeof next==='function') next(); else explore(); }, true); 
}

// ----------------- Calcul des stats affichées -----------------
function repText(n){ return n>=30?'Vertueux':n<=-30?'Sombre':'Neutre'; }

// Additionne les mods des équipements portés (arme/armure/bouclier/talisman)
function equipmentMods(){
  const sum={atk:0,def:0,PUISSANCE:0,AGILITE:0,ESPRIT:0};
  for(const slot of EQUIP_SLOTS){
    const id = state.equipment[slot];
    if(!id) continue;
    const it = state.inventory.find(o=>o.id===id);
    if(it && it.mods){
      for(const k of Object.keys(it.mods)){ sum[k]=(sum[k]||0)+it.mods[k]; }
    }
  }
  return sum;
}

function setStats(){
  const mods = equipmentMods();
  const eff = {
    PUISSANCE: state.attrs.PUISSANCE + (mods.PUISSANCE||0),
    AGILITE : state.attrs.AGILITE + (mods.AGILITE||0),
    ESPRIT  : state.attrs.ESPRIT  + (mods.ESPRIT||0)
  };
  ui.hp.textContent = state.hp; ui.hpmax.textContent=state.hpMax;
  ui.hpbar.style.width = Math.max(0,Math.min(100,Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent = state.gold; ui.lvl.textContent = state.level; ui.xp.textContent = state.xp;
  ui.status.textContent = state.status.length? state.status.map(s=>s.name).join(', ') : '—';
  ui.pclass.textContent = state.cls; ui.pname.textContent = state.name;
  ui.astr.textContent = eff.PUISSANCE; ui.aagi.textContent = eff.AGILITE; ui.awis.textContent = eff.ESPRIT;
  ui.rep.textContent = state.rep; ui.repLabel.textContent = repText(state.rep);

  // Inventaire + équipement (marquage)
  ui.inv.innerHTML="";
  if(!state.inventory.length){
    const d=document.createElement('div'); d.className='stat'; d.innerHTML="<b>(inventaire vide)</b><span>—</span>"; ui.inv.appendChild(d);
  }else{
    state.inventory.forEach(it=>{
      const equipped = Object.values(state.equipment).includes(it.id);
      const d=document.createElement('div'); d.className='stat';
      const tag = equipped? ` <span class="chip">Équipé</span>` : '';
      d.innerHTML = `<b>${it.name}</b><span>${it.desc||''}${tag}</span>`;
      ui.inv.appendChild(d);
    });
  }

  // Quêtes
  ui.quests.innerHTML="";
  const mq=document.createElement('div'); mq.className='stat'; 
  mq.innerHTML=`<b>${state.quests.main.title}</b><span>${state.quests.main.state}</span>`;
  ui.quests.appendChild(mq);

  const aq=document.createElement('div'); aq.className='stat'; 
  aq.innerHTML=`<b>${state.quests.artifacts.title.replace(/\\d\\/3/, state.flags.fragments + '/3')}</b><span>${state.quests.artifacts.state}</span>`;
  ui.quests.appendChild(aq);

  state.quests.side.forEach(q=>{
    const x=document.createElement('div'); x.className='stat';
    x.innerHTML = `<b>${q.title}</b><span>${q.state}${q.objective?(' — '+q.objective):''}</span>`;
    ui.quests.appendChild(x);
  });
}

// ----------------- Aides gameplay génériques -----------------
function d20(mod=0){ const roll=rng.between(1,20); const total=roll+mod; ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${roll} = ${total}`; return {roll,total}; }
function heal(n){ state.hp=Math.min(state.hpMax, state.hp+n); setStats(); write(`+${n} PV`,"good"); }
function damage(n,src=""){ state.hp=Math.max(0,state.hp-n); setStats(); write(`-${n} PV ${src?`(${src})`:''}`,"bad"); if(state.hp<=0){ gameOver(); return true; } return false; }
function changeGold(n){ state.gold=Math.max(0,state.gold+n); setStats(); write(`Or ${n>=0?'+':''}${n} (total: ${state.gold})`, n>=0?"good":"warn"); }
function gainXP(n){ 
  state.xp+=n; 
  write(`XP +${n} (total ${state.xp})`,"info"); 
  const need=20+(state.level-1)*15; 
  if(state.xp>=need){ 
    state.level++; 
    state.xp=0; 
    state.hpMax+=5; 
    state.hp=state.hpMax; 
    write(`<b>Niveau ${state.level} !</b> PV max +5, PV restaurés.`,"good"); 
    // Déblocages de compétences par niveau
    maybeUnlockLevelSkill();
  } 
  setStats(); 
}
function addItem(obj){ // accepte {id,name,slot?,mods?,desc?,sell?,buy?}
  if(!obj || !obj.id){ console.warn("addItem sans id"); return; }
  // si l'objet existe déjà en inventaire en exemplaire unique : on duplique (pile)
  state.inventory.push({...obj});
  setStats();
  write(`Tu obtiens <b>${obj.name}</b>.`,"good");
}
function hasItemId(id){ return state.inventory.some(i=>i.id===id); }
function removeItemById(id){ const i=state.inventory.findIndex(x=>x.id===id); if(i>=0){ const [rm]=state.inventory.splice(i,1); setStats(); return rm; } return null; }
function rep(delta){ state.rep += delta; setStats(); if(delta>0) write(`Réputation +${delta}`,"good"); else if(delta<0) write(`Réputation ${delta}`,"bad"); }

// Équipement / Déséquipement
function equipItem(id){
  const it = state.inventory.find(o=>o.id===id);
  if(!it || !it.slot || !EQUIP_SLOTS.includes(it.slot)){ write("Impossible d’équiper cet objet.","warn"); return; }
  const cur = state.equipment[it.slot];
  if(cur===id){ write(`${it.name} est déjà équipé.`,"info"); return; }
  state.equipment[it.slot]=id;
  write(`Équipé : <b>${it.name}</b> (${it.slot}).`,"info");
  setStats();
}
function unequipSlot(slot){
  if(!EQUIP_SLOTS.includes(slot)) return;
  const cur = state.equipment[slot];
  if(!cur){ write("Aucun objet à retirer.","info"); return; }
  const it = state.inventory.find(o=>o.id===cur);
  state.equipment[slot]=null;
  write(`Retiré : <b>${it?it.name:slot}</b>.`,"info");
  setStats();
}

// Statuts récurrents
function tickStatus(){
  state.status = state.status.filter(st=>{
    if(st.type==='poison'){ const dmg=rng.between(1,2); damage(dmg,"Poison"); st.dur--; }
    if(st.type==='bleed'){ const dmg=2; damage(dmg,"Saignement"); st.dur--; }
    if(st.type==='slow'){ st.dur--; if(st.dur===0) write('💨 Tu te sens plus léger.','info'); }
    return st.dur>0 && state.hp>0;
  });
}

// Calculs combat
function playerAtkMod(){
  const mods = equipmentMods();
  let m = 0;
  if(state.cls==='Guerrier') m+=2;
  if(state.attrs.PUISSANCE + (mods.PUISSANCE||0) >=3) m+=1;
  if(mods.atk) m+=mods.atk;
  // bonus de talisman spécifique
  // (ex : talisman précision +1 atk si présent)
  return m;
}
function playerDef(){
  const mods = equipmentMods();
  return 10
    + (state.cls==='Paladin'?1:0)
    + (state.attrs.AGILITE + (mods.AGILITE||0) >=3 ? 1:0)
    + (mods.def||0);
}
function terrainPenalty(){ return state.locationKey==='marais' ? -1 : 0; }

// Visuels SVG (intégrés, sans fichiers externes)
function svgEnemy(name){
  // quelques silhouettes simples selon le type
  if(/Bandit/i.test(name)) return `<svg width="64" height="32" viewBox="0 0 64 32"><rect x="2" y="18" width="28" height="6" fill="#333"/><circle cx="42" cy="16" r="8" fill="#884"/><rect x="48" y="14" width="10" height="4" fill="#222"/></svg>`;
  if(/Goule|Sépulcr/i.test(name)) return `<svg width="64" height="32" viewBox="0 0 64 32"><circle cx="16" cy="16" r="8" fill="#4a6"/><rect x="24" y="14" width="24" height="4" fill="#2a4"/></svg>`;
  if(/Harpie/i.test(name)) return `<svg width="64" height="32" viewBox="0 0 64 32"><path d="M8 24 L24 8 L40 24 Z" fill="#668"/><circle cx="24" cy="12" r="3" fill="#ccd"/></svg>`;
  if(/Sanglier|Boar/i.test(name)) return `<svg width="64" height="32" viewBox="0 0 64 32"><rect x="6" y="16" width="30" height="10" fill="#744"/><circle cx="40" cy="20" r="6" fill="#633"/></svg>`;
  if(/Loup/i.test(name)) return `<svg width="64" height="32" viewBox="0 0 64 32"><path d="M4 24 L20 10 L36 24 Z" fill="#566"/><rect x="36" y="20" width="12" height="4" fill="#455"/></svg>`;
  if(/Chef Bandit|Seigneur|Nécromancien|Bête/i.test(name)) return `<svg width="64" height="32" viewBox="0 0 64 32"><rect x="2" y="18" width="60" height="6" fill="#222"/><circle cx="14" cy="14" r="6" fill="#a22"/><circle cx="50" cy="14" r="6" fill="#a22"/></svg>`;
  return `<svg width="64" height="32" viewBox="0 0 64 32"><rect x="8" y="12" width="48" height="8" fill="#555"/></svg>`;
}

function svgPNJ(type){
  if(type==='herboriste') return `<svg width="64" height="32" viewBox="0 0 64 32"><circle cx="16" cy="16" r="8" fill="#6a6"/><rect x="28" y="14" width="24" height="4" fill="#484"/></svg>`;
  if(type==='forgeron') return `<svg width="64" height="32" viewBox="0 0 64 32"><rect x="8" y="18" width="20" height="6" fill="#555"/><rect x="32" y="16" width="20" height="8" fill="#777"/></svg>`;
  if(type==='barde') return `<svg width="64" height="32" viewBox="0 0 64 32"><circle cx="24" cy="16" r="6" fill="#aa6"/><path d="M32 10 L48 22" stroke="#aa6" stroke-width="3"/></svg>`;
  if(type==='ermite') return `<svg width="64" height="32" viewBox="0 0 64 32"><rect x="10" y="12" width="12" height="8" fill="#765"/><circle cx="40" cy="16" r="6" fill="#654"/></svg>`;
  if(type==='marchand') return `<svg width="64" height="32" viewBox="0 0 64 32"><rect x="6" y="14" width="24" height="10" fill="#a84"/><rect x="34" y="14" width="24" height="10" fill="#c96"/></svg>`;
  if(type==='mage') return `<svg width="64" height="32" viewBox="0 0 64 32"><path d="M12 24 L22 6 L32 24 Z" fill="#66a"/><circle cx="22" cy="9" r="3" fill="#ccd"/></svg>`;
  return `<svg width="64" height="32" viewBox="0 0 64 32"><rect x="14" y="14" width="36" height="8" fill="#777"/></svg>`;
}
/* ============================================================
 * Fin Bloc 1/4
 * ============================================================ */
/* ============================================================
 * Aventurier de Mirval — v10 ULTIMATE
 * Bloc 2/4 : Combat, Bestiaire, Loot, Items, Commerce, Compétences
 * ============================================================ */

// ----------------- Bestiaire & boss -----------------
const mobs = {
  wolf: ()=>({ name:"Loup affamé", hp:10, maxHp:10, ac:11, hitMod:2, tier:1 }),
  bandit: ()=>({ name:"Bandit des fourrés", hp:12, maxHp:12, ac:12, hitMod:3, tier:2, dotChance:0.1, dotType:'bleed' }),
  boar:  ()=>({ name:"Sanglier irascible", hp:11, maxHp:11, ac:11, hitMod:2, tier:1, dotChance:0.05, dotType:'bleed' }),
  harpy: ()=>({ name:"Harpie du vent", hp:14, maxHp:14, ac:13, hitMod:4, tier:2, dotChance:0.2, dotType:'bleed' }),
  ghoul: ()=>({ name:"Goule des roseaux", hp:13, maxHp:13, ac:12, hitMod:3, tier:2, dotChance:0.25, dotType:'poison' }),
  ruinLord: ()=>({ name:'Seigneur des Ruines', hp:24, maxHp:24, ac:14, hitMod:5, tier:3 })
};
function bossBandit(){
  return { name:'Chef Bandit', hp:26, maxHp:26, ac:14, hitMod:5, tier:3, dotChance:0.25, dotType:'bleed' };
}
function bossHarpyQueen(){
  return { name:'Reine Harpie', hp:22, maxHp:22, ac:15, hitMod:6, tier:3, dotChance:0.2, dotType:'bleed' };
}
function bossSwampBeast(){
  return { name:'Bête du Marais', hp:28, maxHp:28, ac:13, hitMod:5, tier:3, dotChance:0.3, dotType:'poison' };
}
function bossNecromancer(){
  return { name:'Nécromancien des Profondeurs', hp:20, maxHp:20, ac:12, hitMod:6, tier:3, dotChance:0.25, dotType:'bleed' };
}

// ----------------- Combat : flux complet -----------------
function combat(mon){
  clearChoices();
  state.inCombat=true;
  state.enemy = JSON.parse(JSON.stringify(mon));
  write(`${svgEnemy(mon.name)} <b>${mon.name}</b> apparaît ! ❤️ ${mon.hp} — CA ${mon.ac||12}`,"warn");
  combatTurn();
}

function enemyAttack(){
  const e=state.enemy;
  const roll=d20(e.hitMod||3).total;
  const def = playerDef() + terrainPenalty();
  if(roll>=def){
    const dmg=rng.between(1,(e.tier||2)+3);
    if(e.name && /Bandit/.test(e.name) && rng.rand()<0.2){ changeGold(-1); write('🪙 Le bandit te détrousse !','warn'); }
    damage(dmg, e.name||"Ennemi");
    if(e.dotChance && rng.rand()<e.dotChance){
      if(e.dotType==='poison') state.status.push({type:'poison', name:'Poison', dur:rng.between(2,4)});
      if(e.dotType==='bleed')  state.status.push({type:'bleed',  name:'Saignement', dur:rng.between(2,4)});
      write('⚠️ Un effet néfaste te touche.','warn');
    }
  } else write(`${e.name||'L’ennemi'} rate son attaque.`,"info");
  tickStatus();
}

function aimMenu(){
  clearChoices(); const e=state.enemy;
  addChoice('🎯 Viser la tête', ()=>{
    const r=d20(playerAtkMod()-2 + terrainPenalty()).total;
    if(r>=(e.ac||12)+2){ const dmg=rng.between(6,10); e.hp-=dmg; write(`🎯 Coup à la tête : -${dmg} PV`,'good'); }
    else write('Tu manques la tête.','warn');
    if(e.hp>0) enemyAttack();
    combatTurn();
  }, true);
  addChoice('🗡️ Viser le torse', ()=>{
    const r=d20(playerAtkMod() + terrainPenalty()).total;
    if(r>=(e.ac||12)){ const dmg=rng.between(3,7); e.hp-=dmg; write(`🗡️ Frappe au torse : -${dmg} PV`,'good'); }
    else write('Tu manques.','warn');
    if(e.hp>0) enemyAttack();
    combatTurn();
  });
  addChoice('🦵 Viser les jambes', ()=>{
    const r=d20(playerAtkMod()+1 + terrainPenalty()).total;
    if(r>=(e.ac||12)-1){ const dmg=rng.between(2,5); e.hp-=dmg; state.status.push({type:'slow',name:'Ralentissement',dur:2}); write(`🦵 Frappe aux jambes : -${dmg} PV (ennemi ralenti)`,'good'); }
    else write('Tu manques les jambes.','warn');
    if(e.hp>0) enemyAttack();
    combatTurn();
  });
  addChoice('↩️ Annuler', combatTurn);
}

function combatTurn(){
  if(!state.inCombat) return;
  if(state.hp<=0){ gameOver(); return; }
  if(state.enemy.hp<=0){ write(`${svgEnemy(state.enemy.name)} <b>${state.enemy.name} est vaincu !</b>`,'good'); afterCombat(); return; }

  clearChoices();
  const e=state.enemy;

  addChoice('⚔️ Attaquer', ()=>aimMenu(), true);
  addChoice('🛡️ Parer', ()=>{
    const bonus = state.cls==='Rôdeur'?2:1;
    const m = d20(e.hitMod||3).total;
    const armor = playerDef() + bonus;
    if(m>=armor){ const dmg=Math.max(0,rng.between(1,3+(e.tier||2))-2-bonus); write(`Parade partielle, -${dmg} PV.`,'warn'); damage(dmg,e.name); }
    else write("Tu pares complètement !",'good');
    if(e.hp>0) enemyAttack();
    combatTurn();
  });
  addChoice('✨ Compétence', ()=>{
    if(!state.skill || !state.skill.use){ write("Pas de compétence disponible.","info"); return combatTurn(); }
    if(state.skill.cd>0){ write("Compétence en recharge.","warn"); return combatTurn(); }
    state.skill.use(e);
    state.skill.cd = state.skill.cooldown||3;
    if(e.hp>0) enemyAttack();
    combatTurn();
  });
  addChoice(`🧪 Potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Plus de potions.","warn"); return combatTurn(); }
    state.potions--; heal(rng.between(8,12)); 
    if(e.hp>0) enemyAttack(); 
    combatTurn();
  });
  addChoice('🏃 Fuir', ()=>{
    const r=d20((state.attrs.AGILITE>=3?2:0)).total;
    if(r>=14){ write("Tu fuis le combat.","sys"); state.inCombat=false; state.enemy=null; explore(); }
    else { write("Échec de fuite !",'bad'); enemyAttack(); combatTurn(); }
  });
}

function afterCombat(){
  const e=state.enemy; state.inCombat=false; state.enemy=null;
  const gold=rng.between((e.tier||1),(e.tier||2)*3);
  const xp=rng.between((e.tier||1)*3,(e.tier||2)*6);
  changeGold(gold); gainXP(xp);

  // Loot spécial
  const r=rng.rand();
  if(r<0.15 && !hasItemId("epee-affutee")) addItem({id:"epee-affutee",name:"Épée affûtée",slot:"arme",mods:{atk:+1},desc:"+1 attaque",sell:3,buy:6});
  else if(r<0.28 && !hasItemId("bouclier-bois")) addItem({id:"bouclier-bois",name:"Bouclier en bois",slot:"bouclier",mods:{def:+1},desc:"+1 armure légère",sell:2,buy:5});
  else if(r<0.38) { state.potions++; write("Tu trouves une potion.","good"); }
  else if(r<0.45 && !hasItemId("cuir-renforce")) addItem({id:"cuir-renforce",name:"Cuir renforcé",slot:"armure",mods:{def:+2},desc:"+2 armure souple",sell:4,buy:8});
  // Fragment rare sur certains ennemis
  if(/Harpie|Goule|Seigneur|Chef|Nécromancien|Bête/.test(e.name||"")){
    if(rng.rand()<0.2 && state.flags.fragments<3){ 
      state.flags.fragments++; 
      write("✨ Un fragment d’artefact tombe de l’ennemi !","good");
    }
  }

  if(e.name && /Bandit/.test(e.name)){
    state.flags.rumors=(state.flags.rumors||0)+1;
    if(state.flags.rumors>=3 && !state.flags.bossUnlocked){ 
      state.flags.bossUnlocked=true; 
      write("🗡️ Tu apprends la cache du Chef Bandit… (événement rare débloqué)","info"); 
    }
  }
  continueBtn(explore);
}

// Boss : comportements spéciaux
function combatBossBandit(){
  const boss=bossBandit();
  write('🥷 Tu t’infiltres dans la planque du Chef Bandit.','warn');
  combat(boss);
  const _enemyAttack = enemyAttack;
  enemyAttack = function(){
    if(state.enemy && state.enemy.name==='Chef Bandit' && state.enemy.hp<=state.enemy.maxHp/2 && !state.enemy.enraged){
      state.enemy.enraged=true; state.enemy.hitMod+=1; write('🔥 Le Chef Bandit entre en rage !','warn');
    }
    _enemyAttack();
  };
}
function combatBossHarpy(){ combat(bossHarpyQueen()); }
function combatBossSwamp(){ combat(bossSwampBeast()); }
function combatBossNecro(){ combat(bossNecromancer()); }

// ----------------- Coffres & trouvailles -----------------
function chest(){
  const r=rng.between(1,100);
  if(r>94) addItem({id:"bouclier-fer",name:"Bouclier en fer",slot:"bouclier",mods:{def:+2},desc:"+2 armure",sell:5,buy:10});
  else if(r>78){ addItem({id:"potion",name:"Potion de soin",slot:null,desc:"Restaure 8-12 PV",sell:2,buy:4}); state.potions++; }
  else if(r>55) changeGold(rng.between(7,15));
  else if(r>35){
    if(!state.flags.torch){ state.flags.torch=true; addItem({id:"torche-ancienne",name:"Torche ancienne",slot:null,desc:"Permet d’explorer la grotte",sell:1,buy:4}); }
    else if(state.flags.fragments<3 && rng.rand()<0.35){ state.flags.fragments++; write("Tu trouves un fragment d’artefact.","good"); }
    else write("Tu ne trouves que des gravats.","info");
  }
  else { write("💥 Piège !","bad"); damage(rng.between(3,6),"Piège"); }
}

// ----------------- Économie : boutiques & ventes -----------------
const SHOP_STOCKS = {
  herborist: [
    {id:"potion", name:"Potion de soin", slot:null, desc:"Restaure 8-12 PV", sell:2, buy:4},
    {id:"torche-ancienne",name:"Torche ancienne", slot:null, desc:"Permet d’explorer la grotte", sell:1, buy:4}
  ],
  smith: [
    {id:"epee-affutee", name:"Épée affûtée", slot:"arme", mods:{atk:+1}, desc:"+1 attaque", sell:3, buy:6},
    {id:"bouclier-fer", name:"Bouclier en fer", slot:"bouclier", mods:{def:+2}, desc:"+2 armure", sell:5, buy:10},
    {id:"cuir-renforce", name:"Cuir renforcé", slot:"armure", mods:{def:+2}, desc:"+2 armure souple", sell:4, buy:8}
  ],
  trader: [
    {id:"talisman-precision", name:"Talisman de précision", slot:"talisman", mods:{atk:+1,AGILITE:+1}, desc:"+1 atk, +1 Agilité", sell:6, buy:12},
    {id:"talisman-foi", name:"Talisman de foi", slot:"talisman", mods:{ESPRIT:+1}, desc:"+1 Esprit", sell:5, buy:10}
  ],
  mage: [
    {id:"talisman-arcane", name:"Talisman arcanique", slot:"talisman", mods:{ESPRIT:+1,atk:+1}, desc:"+1 Esprit, +1 atk", sell:7, buy:14}
  ]
};

function buyMenu(stockKey, title){
  clearChoices();
  write(`${svgPNJ(stockKey==='herborist'?'herboriste':stockKey)} <b>${title}</b> — Que veux-tu acheter ?`,"info");
  const list = SHOP_STOCKS[stockKey]||[];
  list.forEach(it=>{
    addChoice(`${it.name} (${it.buy} or)`, ()=>{
      if(state.gold>=it.buy){ changeGold(-it.buy); addItem(it); }
      else write("Pas assez d'or.","warn");
      buyMenu(stockKey, title);
    });
  });
  addChoice("↩️ Vendre des objets", ()=>sellMenu(stockKey, title));
  addChoice("Terminer", ()=>continueBtn(explore), true);
}

function sellMenu(stockKey, title){
  clearChoices();
  write(`<b>Vendre</b> — Les marchands rachètent selon l’objet.`, "info");
  // À la demande : proposer la vente des objets non-consommables
  const sellable = state.inventory.filter(it=> it.sell );
  if(!sellable.length){ addChoice("Rien à vendre (↩️)", ()=>buyMenu(stockKey,title), true); return; }
  sellable.slice(0,8).forEach(it=>{
    addChoice(`Vendre ${it.name} (${it.sell} or)`, ()=>{
      const rem = removeItemById(it.id);
      if(rem) changeGold(it.sell||1);
      sellMenu(stockKey,title);
    });
  });
  addChoice("↩️ Revenir à l’achat", ()=>buyMenu(stockKey,title), true);
}

// ----------------- Compétences : classe + déblocages -----------------
function setClassSkill(className){
  if(className==='Guerrier'){
    state.skill = {
      name:"Frappe vaillante", cooldown:3, cd:0, desc:"Attaque puissante",
      use:(e)=>{ const dmg=rng.between(4,10)+state.level; e.hp-=dmg; write(`💥 Frappe vaillante : -${dmg} PV`,"good"); }
    };
  } else if(className==='Voleur'){
    state.skill = {
      name:"Coup de l’ombre", cooldown:3, cd:0, desc:"Jet +4, dégâts + vol",
      use:(e)=>{ const r=d20(4).total; if(r>=(e.ac||12)){ const steal=Math.min(3,state.gold); const dmg=rng.between(3,8)+steal; e.hp-=dmg; changeGold(steal); write(`🗡️ L’ombre frappe : -${dmg} PV`,"good"); } else write("Tu rates.","warn"); }
    };
  } else if(className==='Paladin'){
    state.skill = {
      name:"Lumière", cooldown:3, cd:0, desc:"Soigne puissamment",
      use:()=>{ heal(rng.between(6,12)+state.level); }
    };
  } else if(className==='Rôdeur'){
    state.skill = {
      name:"Tir précis", cooldown:2, cd:0, desc:"Jet +6, 1d8 dégâts",
      use:(e)=>{ const r=d20(6).total; if(r>=(e.ac||12)){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🏹 Tir précis : -${dmg} PV`,"good"); } else write("Tir manqué.","warn"); }
    };
  } else if(className==='Mystique'){
    state.skill = {
      name:"Onde arcanique", cooldown:3, cd:0, desc:"1d8 & vulnérabilité",
      use:(e)=>{ const dmg=rng.between(3,8); e.hp-=dmg; e.dotChance=Math.min(0.6,(e.dotChance||0)+0.15); write(`🔮 Onde arcanique : -${dmg} PV`,"good"); }
    };
  } else {
    state.skill = {name:"", cooldown:0, cd:0, desc:"", use:()=>{}};
  }
}

function maybeUnlockLevelSkill(){
  // Exemple : au niveau 3, possibilité d’apprendre une 2e compétence via le mage
  if(state.level>=3 && !state.flags.learnOfferShown){
    state.flags.learnOfferShown=true;
    write(`${svgPNJ('mage')} Un mage t’observe depuis l’ombre… “Reviens me voir quand tu auras un peu d’or.”`,"info");
  }
}

// Apprentissage chez le mage
function learnSkillMenu(){
  clearChoices();
  write(`${svgPNJ('mage')} <b>Mage</b> — “Je peux t’enseigner une technique.” (8 or)`, "info");
  addChoice("Apprendre 'Sursaut héroïque' (auto-soin +1 atk ce tour) — 8 or", ()=>{
    if(state.gold>=8){
      changeGold(-8);
      state.skill2 = {
        name:"Sursaut héroïque", cooldown:4, cd:0, desc:"Soigne 4-6 et +1 atk ce tour",
        use:(e)=>{
          heal(rng.between(4,6));
          // petit buff ponctuel : on force un coup direct
          const r=d20(playerAtkMod()+1).total;
          if(e && r>=(e.ac||12)){ const dmg=rng.between(2,5); e.hp-=dmg; write(`⚡ Contre-attaque éclair : -${dmg} PV`,"good"); }
        }
      };
      write("Tu apprends <b>Sursaut héroïque</b> ! Utilisable comme 2e compétence.","good");
    } else write("Pas assez d'or.","warn");
    continueBtn(explore);
  }, true);
  addChoice("Plus tard", ()=>continueBtn(explore));
}

/* ============================================================
 * Fin Bloc 2/4
 * ============================================================ */
/* ============================================================
 * Aventurier de Mirval — v10 ULTIMATE
 * Bloc 3/4 : Événements, PNJ, Exploration, Navigation, Quêtes
 * ============================================================ */

// ----------------- Actions générales & rencontres -----------------
function randomEncounter(){
  const roll=rng.rand(); const zone=state.locationKey;
  if(roll<0.5){
    if(zone==='marais') combat(mobs.ghoul());
    else if(zone==='clairiere') combat(mobs.bandit());
    else if(zone==='colline') combat(mobs.harpy());
    else if(zone==='ruines') combat(mobs.wolf());
    else combat(mobs.boar());
  }else{
    // un PNJ approche → interaction ou combat selon réputation
    if(state.rep<=-25 && rng.rand()<0.35){ combat(mobs.bandit()); return; }
    const pool=[eventHerbalist,eventSmith,eventTrader,eventMage,eventBard,eventHermit];
    pool[rng.between(0,pool.length-1)]();
  }
}

function searchArea(){
  const wis = (state.attrs.ESPRIT + (equipmentMods().ESPRIT||0));
  const {total}=d20(wis>=3?1:0);
  if(total>=18){ write("🔑 Recherche exceptionnelle : coffre scellé.","good"); chest(); }
  else if(total>=12){ write("✨ Quelques pièces sous une pierre.","good"); changeGold(rng.between(2,6)); }
  else if(total>=8){ write("Des traces fraîches… une rencontre approche."); if(rng.rand()<0.5) randomEncounter(); }
  else { write("Aïe ! Ronce traîtresse.","bad"); damage(rng.between(1,3),"Ronces"); }
  continueBtn(explore);
}

function rest(){
  if(rng.rand()<0.35){ write("Quelque chose approche pendant ton repos…","warn"); randomEncounter(); }
  else { heal(rng.between(4,8)); write("Tu dors un peu. Ça fait du bien.","good"); }
  continueBtn(explore);
}

function useItemMenu(){
  clearChoices();
  addChoice(`Boire une potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Tu n'as pas de potion.","warn"); return continueBtn(explore); }
    state.potions--; heal(rng.between(8,12)); continueBtn(explore);
  }, true);

  // Équiper / retirer (simple)
  EQUIP_SLOTS.forEach(slot=>{
    addChoice(`Retirer ${slot}`, ()=>{ unequipSlot(slot); useItemMenu(); });
  });
  // Proposer d’équiper les objets disponibles
  state.inventory.filter(it=>it.slot && EQUIP_SLOTS.includes(it.slot)).slice(0,8).forEach(it=>{
    addChoice(`Équiper ${it.name} → ${it.slot}`, ()=>{ equipItem(it.id); useItemMenu(); });
  });

  addChoice("Annuler", ()=>continueBtn(explore));
}

// ----------------- PNJ & événements -----------------
function eventHerbalist(){
  write(`${svgPNJ('herboriste')} <b>Herboriste</b> — Elle te fait signe.`, "info");
  clearChoices();
  addChoice("S’approcher (3 or)", ()=>{
    if(state.rep<-20){ write("Elle se détourne : 'Je ne sers pas les cruels.'","warn"); rep(-1); return continueBtn(explore); }
    const cost=(state.rep>20?2:3);
    if(state.gold>=cost){ changeGold(-cost); heal(rng.between(6,12)); state.flags.metHerbalist=true; }
    else write("Tu n'as pas assez d'or.","warn");
    continueBtn(explore);
  }, true);
  addChoice("Marchander", ()=>{
    const {total}=d20((state.attrs.ESPRIT>=3?2:0));
    if(total>=15){ heal(rng.between(4,8)); write('Elle sourit : "À prix d’ami."','good'); }
    else write("Elle refuse.","warn");
    continueBtn(explore);
  });
  addChoice("Acheter / Vendre", ()=>buyMenu('herborist', 'Herboriste'));
  addChoice("Partir", ()=>continueBtn(explore));
}

function eventSmith(){
  write(`${svgPNJ('forgeron')} <b>Forgeron itinérant</b> — “Besoin de métal ?”`, "info");
  clearChoices();
  addChoice("Améliorer épée (5 or)", ()=>{
    if(state.gold>=5){ changeGold(-5); 
      if(!hasItemId("epee-affutee")) addItem({id:"epee-affutee", name:"Épée affûtée", slot:"arme", mods:{atk:+1}, desc:"+1 attaque", sell:3, buy:6});
      else write("Ton épée est déjà affûtée.","info");
    }
    else write("Pas assez d'or.","warn");
    continueBtn(explore);
  }, true);
  addChoice("Acheter / Vendre", ()=>buyMenu('smith','Forgeron'));
  // Vendre rapidement quelques objets (anti-bug : recalcule à chaque clic)
  const candidates = state.inventory.filter(it=>it.sell).slice(0,5);
  candidates.forEach(it=>{
    addChoice(`Vendre ${it.name} (${it.sell} or)`, ()=>{
      const rem = removeItemById(it.id);
      if(rem) changeGold(it.sell);
      eventSmith(); // ré-ouvre le menu du forgeron pour éviter boutons fantômes
    });
  });
  addChoice("Discuter (un peu d’XP)", ()=>{ gainXP(3); continueBtn(explore); });
}

function eventTrader(){
  write(`${svgPNJ('marchand')} <b>Marchand ambulant</b> — “J’ai de tout, si tu as de l’or.”`,"info");
  clearChoices();
  addChoice("Acheter / Vendre", ()=>buyMenu('trader','Marchand ambulant'), true);
  addChoice("Négocier la réputation", ()=>{
    const {total}=d20();
    if(total>=15){ rep(+2); write("Un petit mot aux bonnes personnes…","good"); }
    else rep(-1);
    continueBtn(explore);
  });
  addChoice("Partir", ()=>continueBtn(explore));
}

function eventMage(){
  write(`${svgPNJ('mage')} <b>Mage</b> — “Je sens un potentiel…”`,"info");
  clearChoices();
  addChoice("Demander un enseignement", ()=>learnSkillMenu(), true);
  addChoice("Bavarder (lore +1 XP)", ()=>{ gainXP(1); continueBtn(explore); });
  addChoice("Partir", ()=>continueBtn(explore));
}

function eventBard(){
  write(`${svgPNJ('barde')} <b>Barde</b> — “Une chanson pour la route ?”`,"info");
  clearChoices();
  addChoice("Écouter", ()=>{
    if(rng.rand()<0.7){ heal(rng.between(3,7)); } 
    else { changeGold(-2); write("La bourse s’est allégée…","warn"); }
    continueBtn(explore);
  }, true);
  addChoice("L’ignorer", ()=>continueBtn(explore));
}

function eventHermit(){
  write(`${svgPNJ('ermite')} <b>Ermite</b> — Il te jauge en silence.`, "info");
  clearChoices();
  addChoice("Accepter sa décoction", ()=>{
    if(rng.rand()<0.6){ heal(rng.between(5,10)); gainXP(3); }
    else { damage(rng.between(2,5),"Nausée"); }
    continueBtn(explore);
  }, true);
  addChoice("Refuser poliment", ()=>continueBtn(explore));
}

function eventRuins(){
  write(`🏚️ <b>Ruines effondrées</b> — des pierres anciennes chuchotent.`,"info");
  clearChoices();
  addChoice("Fouiller", ()=>{
    const wis=(state.attrs.ESPRIT+(equipmentMods().ESPRIT||0)); 
    const {total}=d20(wis>=3?1:0);
    if(total>=16){
      if(!state.flags.torch){ state.flags.torch=true; addItem({id:"torche-ancienne", name:"Torche ancienne", desc:"Permet d’explorer la grotte", sell:1, buy:4}); }
      else { 
        if(state.flags.fragments<3 && rng.rand()<0.5){ state.flags.fragments++; write("Tu trouves un fragment d’artefact.","good"); }
        else chest();
      }
    } else if(total>=10){ chest(); }
    else { damage(rng.between(2,5),"Éboulement"); }
    continueBtn(explore);
  }, true);
  addChoice("Défier le gardien", ()=>combat(mobs.ruinLord()));
  addChoice("Partir", ()=>continueBtn(explore));
}

function eventPeasant(){
  write("🧑‍🌾 <b>Paysan captif</b> — Il t’appelle à l’aide.","info");
  clearChoices();
  addChoice("Le libérer", ()=>{
    const str=(state.attrs.PUISSANCE+(equipmentMods().PUISSANCE||0));
    const {total}=d20(str>=3?2:0);
    if(total>=14){ 
      write("Les chaînes cèdent.","good"); 
      rep(+5); state.flags.peasantSaved=true; 
      state.quests.side.push({title:"Le paysan reconnaissant",state:"En attente", objective:"Revoir le paysan au hameau"});
    } else { damage(rng.between(1,4),"Effort"); }
    continueBtn(explore);
  }, true);
  addChoice("L’ignorer", ()=>{ rep(-3); continueBtn(explore); });
}

function eventSanctuary(){
  write("⛪ <b>Ancien sanctuaire</b> — Une aura hésitante flotte.","info");
  clearChoices();
  addChoice("Prier", ()=>{
    const night = state.time==='Nuit' || state.time==='Crépuscule';
    const {total}=d20(); const t=total+(night?1:0);
    if(t>=15){ heal(rng.between(6,12)); rep(+2); }
    else { damage(rng.between(2,6),"Présage"); rep(-1); }
    continueBtn(explore);
  }, true);
  addChoice("Désacraliser", ()=>{
    const {total}=d20(-1);
    if(total>=16){ changeGold(rng.between(8,16)); rep(-3); }
    else { damage(rng.between(4,7),"Malédiction"); rep(-5); }
    continueBtn(explore);
  });
  addChoice("Partir", ()=>continueBtn(explore));
}

function eventTrap(){
  write("🪤 <b>Piège</b> — Une corde s’enroule à ta cheville !","warn");
  const agi=(state.attrs.AGILITE+(equipmentMods().AGILITE||0));
  const {total}=d20(agi>=3?2:0);
  if(total>=13) write("Tu t’en sors de justesse.","good");
  else damage(rng.between(2,5),"Piège");
  continueBtn(explore);
}

function eventOracle(){
  write("🔮 <b>Voyante</b> — Elle apparaît dans tes rêves.","info");
  clearChoices();
  addChoice("Écouter la prophétie", ()=>{
    write("“Quand trois éclats seront réunis, la porte s’ouvrira.”","info");
    state.flags.oracleSeen=true;
    continueBtn(explore);
  }, true);
}

// ----------------- Temps & navigation & exploration -----------------
function setTime(){
  const slots=["Aube","Matin","Midi","Après-midi","Crépuscule","Nuit"];
  const idx=slots.indexOf(state.time);
  const n=(idx+1)%slots.length;
  if(n===0) state.day++;
  state.time=slots[n];
  ui.day.textContent=`Jour ${state.day} — ${state.time}`;
}

function gotoZone(key){
  state.locationKey=key;
  state.location = key==='marais'?"Marais de Vire-Saule":
                   key==='clairiere'?"Clairière des Lys":
                   key==='colline'?"Colline de Rocfauve":
                   key==='ruines'?"Ruines Oubliées":
                   key==='grotte'?"Grotte Sépulcrale":"Lisière";
  write(`👉 Tu te diriges vers <b>${state.location}</b>.`,"sys");
  explore(true);
}

// Limitation de la redondance des choix
function pickWeighted(items, k){
  const recent = new Set(state.lastLabels);
  let pool = items.flatMap(it=>Array((it.w||1)).fill(it)).filter(it=>!recent.has(it.label));
  if(pool.length<k) pool = items.flatMap(it=>Array((it.w||1)).fill(it));
  const out=[];
  for(let i=0;i<k && pool.length;i++){
    const idx=Math.floor(rng.rand()*pool.length);
    out.push(pool[idx]);
    pool=pool.filter((_,j)=>j!==idx);
  }
  state.lastLabels=[...out.map(o=>o.label), ...state.lastLabels].slice(0,10);
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

  // Événement temporel unique
  if(state.day>=5 && !state.flags.oracleSeen){ eventOracle(); return; }

  const base = [
    {label:"Fouiller", act:searchArea, w:2},
    {label:"Se reposer", act:rest, w:1},
    {label:"Utiliser un objet", act:useItemMenu, w:1},
  ];

  let pool=[];
  const zone=state.locationKey;
  if(zone==='marais'){
    pool.push({label:'Suivre des feux-follets', act:eventSanctuary, w:2});
    pool.push({label:'Aider un captif', act:()=>{ if(!state.flags.peasantSaved) eventPeasant(); else { write('La berge est silencieuse.'); continueBtn(explore); } }, w:1});
    pool.push({label:'Traquer une goule', act:()=>combat(mobs.ghoul()), w:3});
    pool.push({label:'Affronter un loup', act:()=>combat(mobs.wolf()), w:2});
    pool.push({label:'Tomber sur un piège', act:eventTrap, w:1});
    pool.push({label:'Rugissement dans les roseaux', act:()=>combatBossSwamp(), w: state.rep<-15?1: (rng.rand()<0.06?1:0)});
  } else if(zone==='clairiere'){
    pool.push({label:'Croiser une herboriste', act:eventHerbalist, w:2});
    pool.push({label:'Écouter un barde', act:eventBard, w:1});
    pool.push({label:'Chasser un sanglier', act:()=>combat(mobs.boar()), w:2});
    pool.push({label:'Autel moussu', act:eventSanctuary, w:2});
    pool.push({label:'Bandits embusqués', act:()=>combat(mobs.bandit()), w:2});
  } else if(zone==='colline'){
    pool.push({label:'Rencontrer un ermite', act:eventHermit, w:2});
    pool.push({label:'Explorer des ruines', act:eventRuins, w:2});
    pool.push({label:'Affronter une harpie', act:()=>combat(mobs.harpy()), w:3});
    pool.push({label:'Croiser un forgeron', act:eventSmith, w:2});
    pool.push({label:'Cris dans le vent', act:()=>combatBossHarpy(), w: rng.rand()<0.05?1:0});
  } else if(zone==='ruines'){
    pool.push({label:'Fouiller les décombres', act:eventRuins, w:3});
    pool.push({label:'Esquiver un éboulement', act:()=>{ damage(rng.between(1,4),'Éboulement'); continueBtn(explore); }, w:1});
    pool.push({label:'Combattre des bandits', act:()=>combat(mobs.bandit()), w:2});
    pool.push({label:"Défier le Seigneur des Ruines", act:()=>combat(mobs.ruinLord()), w:1});
    pool.push({label:"Ombres nécromantiques", act:()=>combatBossNecro(), w: rng.rand()<0.05?1:0});
  } else if(zone==='grotte'){
    if(!state.flags.torch){
      pool.push({label:'Entrée sombre (il faut une torche)', act:()=>{ write("Il fait trop sombre pour entrer.","warn"); continueBtn(explore); }, w:3});
    }else{
      pool.push({label:'Combattre une goule ancienne', act:()=>combat({name:'Goule ancienne',hp:18,maxHp:18,ac:13,hitMod:5,tier:3,dotChance:0.35,dotType:'poison'}), w:3});
      pool.push({label:'Échos inquiétants', act:()=>{ const r=d20().total; if(r<10) damage(3,'Stalactite'); else write('Rien ne se passe.'); continueBtn(explore); }, w:1});
    }
  }

  if(state.flags.bossUnlocked) pool.push({label:"Traquer le Chef Bandit", act:combatBossBandit, w:1});

  const nav = [
    {label:'→ Marais', act:()=>gotoZone('marais'), w:1},
    {label:'→ Clairière', act:()=>gotoZone('clairiere'), w:1},
    {label:'→ Colline', act:()=>gotoZone('colline'), w:1},
    {label:'→ Ruines', act:()=>gotoZone('ruines'), w:1},
    {label:'→ Grotte', act:()=> state.flags.torch? gotoZone('grotte') : (write('Il fait trop sombre pour entrer.','warn'), continueBtn(explore)), w:1},
  ];

  const dyn = pickWeighted(pool, Math.min(4, pool.length));
  const all = pickWeighted([...base, ...dyn, ...nav], Math.min(6, base.length + dyn.length + nav.length));
  all.forEach((c,i)=> addChoice(c.label, c.act, i===0));
}

// ----------------- Fins -----------------
function ending(){
  clearChoices();
  if(state.rep>=30){ write("<b>Fin héroïque :</b> Mirval te salue comme un sauveur.","good"); state.achievements.hero=true; }
  else if(state.rep<=-30){ write("<b>Fin sombre :</b> ta légende glace le sang des voyageurs.","bad"); state.achievements.villain=true; }
  else write("<b>Fin neutre :</b> tu quittes la forêt, plus sage qu’avant.","info");
  addChoice("Rejouer (New Game+)", ()=>{ const st=initialState(); st.attrs.PUISSANCE++; st.attrs.AGILITE++; st.attrs.ESPRIT++; state=st; ui.log.innerHTML=""; setup(true); }, true);
  addChoice("Quitter", ()=>write("Merci d’avoir joué !","sys"));
}

/* ============================================================
 * Fin Bloc 3/4
 * ============================================================ */
// === Fins possibles ===
function ending() {
  clearChoices();
  if (state.rep >= 30) {
    write("<b>Fin héroïque :</b> Mirval te salue comme un sauveur.", "good");
    state.achievements.hero = true;
  } else if (state.rep <= -30) {
    write("<b>Fin sombre :</b> ta légende glace le sang des voyageurs.", "bad");
    state.achievements.villain = true;
  } else {
    write("<b>Fin neutre :</b> tu quittes la forêt, plus sage qu’avant.", "info");
  }

  addChoice("Rejouer (New Game+)", () => {
    const st = initialState();
    st.attrs.FOR += 1;
    st.attrs.DEX += 1;
    st.attrs.ESPRIT += 1;
    state = st;
    ui.log.innerHTML = "";
    setup(true);
  }, true);

  addChoice("Quitter", () => write("Merci d’avoir joué !"));
}

// === Mort du joueur ===
function gameOver() {
  state.inCombat = false;
  write("<b>☠️ Tu t'effondres… La forêt de Mirval se referme sur ton destin.</b>", "bad");
  clearChoices();
  addChoice("Recommencer", () => {
    state = initialState();
    ui.log.innerHTML = "";
    setup(true);
  }, true);
}

// === Cooldown des compétences réduit à chaque exploration ===
const _explore = explore;
explore = function (...args) {
  if (state.skill && typeof state.skill.cd === "number") {
    state.skill.cd = Math.max(0, state.skill.cd - 1);
  }
  _explore(...args);
};

// === Service worker (PWA) ===
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js")
  );
}

// === Boot du jeu ===
(function boot() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setup(true), { once: true });
  } else {
    setup(true);
  }
})();

console.log("✅ Aventurier de Mirval v10 chargé avec succès !");
