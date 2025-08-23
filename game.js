// === Aventurier de Mirval — game.js (v10 complet corrigé) ===
console.log("game.js v10 chargé");

// Garder l’écran éveillé (utile sur mobile)
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
document.getElementById('seedInfo').textContent = `seed ${rng.seed}`;

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
  aFOR: document.getElementById('a-for'),
  aAGI: document.getElementById('a-agi'),
  aESP: document.getElementById('a-esp'),
  aVIT: document.getElementById('a-vit'),
  rep: document.getElementById('rep'),
  repLabel: document.getElementById('rep-label'),
  quests: document.getElementById('quests'),
};

// Utilitaires UI
function write(text, cls=""){ const p=document.createElement('p'); if(cls) p.classList.add(cls); p.innerHTML=text; ui.log.appendChild(p); ui.log.scrollTop=ui.log.scrollHeight; }
function clearChoices(){ ui.choices.innerHTML=""; }
function addChoice(label, handler, primary=false){ const btn=document.createElement('button'); if(primary) btn.classList.add('btn-primary'); btn.textContent = label; btn.onclick = handler; ui.choices.appendChild(btn); }

// Stats & affichage
function repText(n){return n>=30?'Vertueux':n<=-30?'Sombre':'Neutre'}
function setStats(){
  ui.hp.textContent = state.hp; ui.hpmax.textContent=state.hpMax;
  ui.hpbar.style.width = Math.max(0,Math.min(100,Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent = state.gold; ui.lvl.textContent = state.level; ui.xp.textContent = state.xp;
  ui.status.textContent = state.status.length? state.status.map(s=>s.name).join(', ') : '—';
  ui.pclass.textContent = state.cls; ui.pname.textContent = state.name;
  ui.aFOR.textContent = state.attrs.FOR; ui.aAGI.textContent = state.attrs.AGI; ui.aESP.textContent = state.attrs.ESP; ui.aVIT.textContent = state.attrs.VIT;
  ui.rep.textContent = state.rep; ui.repLabel.textContent = repText(state.rep);
  ui.inv.innerHTML="";
  state.inventory.forEach(it=>{ const d=document.createElement('div'); d.className='stat'; d.innerHTML = `<b>${it.name}</b><span>${it.desc}</span>`; ui.inv.appendChild(d); });
  // Quêtes
  ui.quests.innerHTML='';
  const mq=document.createElement('div'); mq.className='stat'; mq.innerHTML=`<b>${state.quests.main.title}</b><span>${state.quests.main.state}</span>`; ui.quests.appendChild(mq);
  const aq=document.createElement('div'); aq.className='stat'; aq.innerHTML=`<b>${state.quests.artifacts.title.replace(/\\d\\/3/,state.flags.fragments+'/3')}</b><span>${state.quests.artifacts.state}</span>`; ui.quests.appendChild(aq);
  state.quests.side.forEach(q=>{ const x=document.createElement('div'); x.className='stat'; x.innerHTML=`<b>${q.title}</b><span>${q.state}</span>`; ui.quests.appendChild(x); });
}

// === Fonctions utilitaires (HP, XP, Or, Inventaire) ===
function d20(mod=0){ const roll=rng.between(1,20); const total=roll+mod; ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${roll} = ${total}`; return {roll,total}; }
function heal(n){ state.hp=Math.min(state.hpMax,state.hp+n); setStats(); write(`+${n} PV`, "good"); }
function damage(n,src=""){ state.hp=Math.max(0,state.hp-n); setStats(); write(`-${n} PV ${src?`(${src})`:''}`, "bad"); if(state.hp<=0){ gameOver(); return true; } return false; }
function changeGold(n){ state.gold=Math.max(0,state.gold+n); setStats(); write(`Or ${n>=0?'+':''}${n} (total: ${state.gold})`, n>=0?"good":"warn"); }
function gainXP(n){ state.xp+=n; write(`XP +${n} (total ${state.xp})`,"info"); const need=20+(state.level-1)*15; if(state.xp>=need){ state.level++; state.xp=0; state.hpMax+=5; state.hp=state.hpMax; write(`<b>Niveau ${state.level} !</b> PV max +5, PV restaurés.`,"good"); } setStats(); }
function addItem(name,desc,mods){ state.inventory.push({name,desc,mods}); setStats(); write(`Tu obtiens <b>${name}</b>.`,"good"); }
function hasItem(name){ return state.inventory.some(i=>i.name===name); }
function removeItem(name){ const i=state.inventory.findIndex(x=>x.name===name); if(i>=0) state.inventory.splice(i,1); setStats(); }
// === Statuts récurrents ===
function tickStatus(){
  state.status = state.status.filter(st=>{
    if(st.type==='poison'){ const dmg=rng.between(1,2); damage(dmg,"Poison"); st.dur--; }
    if(st.type==='bleed'){ const dmg=2; damage(dmg,"Saignement"); st.dur--; }
    if(st.type==='slow'){ st.dur--; if(st.dur===0) write('💨 Tu te sens plus léger.','info') }
    return st.dur>0 && state.hp>0;
  });
}
function rep(n){ state.rep += n; setStats(); }

// Modifs combat
function playerAtkMod(){ 
  let m = 0; 
  if(state.cls==='Guerrier') m += 2; 
  if(state.attrs.FOR>=3) m += 1; 
  if(hasItem('Épée affûtée')) m += 1; 
  return m; 
}
function playerDef(){ 
  return 10 
    + (state.cls==='Paladin'?1:0) 
    + (state.attrs.AGI>=3?1:0) 
    + (hasItem('Petite armure')?1:0) 
    + (hasItem('Cuir renforcé')?2:0) 
    + (hasItem('Bouclier en fer')?2:0); 
}
function terrainPenalty(){ return state.locationKey==='marais' ? -1 : 0 }

// === COMBAT ===
function combat(mon){ 
  clearChoices(); 
  state.inCombat=true; 
  state.enemy=JSON.parse(JSON.stringify(mon)); 
  write(`<b>${mon.name}</b> apparaît ! ❤️ ${mon.hp} — CA ${mon.ac}`,"warn"); 
  combatTurn(); 
}
function combatTurn(){
  if(!state.inCombat) return;
  if(state.hp<=0){ gameOver(); return; }
  if(state.enemy.hp<=0){ write(`<b>${state.enemy.name} est vaincu !</b>`,"good"); afterCombat(); return; }
  clearChoices();
  const e = state.enemy;

  addChoice(`⚔️ Attaquer`, ()=>{ aimMenu(); }, true);
  addChoice(`🛡️ Parer`, ()=>{
    const bonus = state.cls==='Rôdeur'?2:1;
    const m = d20(e.hitMod).total;
    const armor = playerDef() + bonus;
    if(m>=armor){ 
      const dmg=Math.max(0,rng.between(1,3+e.tier)-2-bonus); 
      write(`Parade partielle, -${dmg} PV.`,"warn"); 
      damage(dmg,e.name); 
    }
    else write("Tu pares complètement !","good");
    enemyAttack();
  });
  addChoice(`✨ Compétence`, ()=>{
    if(state.skill.cd){ write("Compétence en recharge.","warn"); return combatTurn(); }
    state.skill.use(e);
    state.skill.cd = state.skill.cooldown;
    if(e.hp>0) enemyAttack();
    combatTurn();
  });
  addChoice(`🧪 Potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Plus de potions.","warn"); return combatTurn(); }
    state.potions--; heal(rng.between(8,12));
    enemyAttack(); combatTurn();
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
    if(r>=e.ac+2){ const dmg=rng.between(6,10); e.hp-=dmg; write(`🎯 Coup à la tête : -${dmg} PV`,'good') } 
    else write('Tu manques la tête.','warn'); 
    enemyAttack(); combatTurn();
  }, true);
  addChoice('🗡️ Viser le torse', ()=>{
    const r=d20(playerAtkMod() + terrainPenalty()).total; 
    if(r>=e.ac){ const dmg=rng.between(3,7); e.hp-=dmg; write(`🗡️ Frappe au torse : -${dmg} PV`,'good') } 
    else write('Tu manques.','warn'); 
    enemyAttack(); combatTurn();
  });
  addChoice('🦵 Viser les jambes', ()=>{
    const r=d20(playerAtkMod()+1 + terrainPenalty()).total; 
    if(r>=e.ac-1){ const dmg=rng.between(2,5); e.hp-=dmg; state.status.push({type:'slow',name:'Ralentissement',dur:2}); write(`🦵 Frappe aux jambes : -${dmg} PV (ennemi ralenti)`,`good`) } 
    else write('Tu manques les jambes.','warn'); 
    enemyAttack(); combatTurn();
  });
  addChoice('↩️ Annuler', combatTurn);
}
function enemyAttack(){
  const e=state.enemy; const roll = d20(e.hitMod).total; const def = playerDef() + terrainPenalty();
  if(roll>=def){
    const dmg=rng.between(1,3+e.tier);
    if(e.name==='Bandit des fourrés' && rng.rand()<0.2){ changeGold(-1); write('🪙 Le bandit te détrousse !','warn') }
    damage(dmg,e.name);
    if(e.dotChance && rng.rand()<e.dotChance){
      if(e.dotType==='poison') state.status.push({type:'poison', name:'Poison', dur:rng.between(2,4)});
      if(e.dotType==='bleed')  state.status.push({type:'bleed',  name:'Saignement', dur:rng.between(2,4)});
      write(`⚠️ ${e.name} inflige ${e.dotType==='poison'?'un poison':'un saignement'} !`,"warn");
    }
  }else write(`${e.name} rate son attaque.`, "info");
  tickStatus();
}
function afterCombat(){
  const e=state.enemy; state.inCombat=false; state.enemy=null;
  const gold=rng.between(e.tier, e.tier*3); const xp=rng.between(e.tier*3, e.tier*6);
  changeGold(gold); gainXP(xp);
  const r=rng.rand();
  if(r<0.2 && !hasItem("Épée affûtée")) addItem("Épée affûtée","+1 attaque",{FOR:+1});
  else if(r<0.35 && !hasItem("Bouclier en bois")) addItem("Bouclier en bois","+1 défense",{VIT:+1});
  else if(r<0.45) { state.potions++; write("Tu trouves une potion.","good"); }
  else if(r<0.5 && !hasItem("Cuir renforcé")) addItem("Cuir renforcé","+2 armure souple",{VIT:+2});
  if(e.name.includes("Bandit")){
    state.flags.rumors = (state.flags.rumors||0)+1;
    if(state.flags.rumors>=3 && !state.flags.bossUnlocked){ state.flags.bossUnlocked=true; write("🗡️ Tu apprends la cache du Chef Bandit… (événement rare débloqué)","info"); }
  }
  explore();
}

// === Bestiaire ===
const mobTemplates = {
  wolf: ()=>({ name:"Loup affamé", hp:10, maxHp:10, ac:11, hitMod:2, tier:1, dotChance:0 }),
  bandit: ()=>({ name:"Bandit des fourrés", hp:12, maxHp:12, ac:12, hitMod:3, tier:2, dotChance:0.1, dotType:'bleed' }),
  boar: ()=>({ name:"Sanglier irascible", hp:11, maxHp:11, ac:11, hitMod:2, tier:1, dotChance:0.05, dotType:'bleed' }),
  harpy: ()=>({ name:"Harpie du vent", hp:14, maxHp:14, ac:13, hitMod:4, tier:2, dotChance:0.2, dotType:'bleed' }),
  ghoul: ()=>({ name:"Goule des roseaux", hp:13, maxHp:13, ac:12, hitMod:3, tier:2, dotChance:0.25, dotType:'poison' }),
  banditChief: ()=>({ name:"Chef Bandit", hp:24, maxHp:24, ac:14, hitMod:5, tier:3, dotChance:0.3, dotType:'bleed' }),
};

// === Exploration (choix dynamiques) ===
function setTime(){ const slots=["Aube","Matin","Midi","Après-midi","Crépuscule","Nuit"]; const idx=slots.indexOf(state.time); let n=(idx+1)%slots.length; if(n===0) state.day++; state.time=slots[n]; ui.day.textContent=`Jour ${state.day} — ${state.time}`; }
function continueBtn(){ clearChoices(); addChoice("Continuer", ()=>explore(), true); }
function gotoZone(key){
  state.locationKey=key;
  state.location = key==='marais'?"Marais de Vire-Saule": key==='clairiere'?"Clairière des Lys": key==='colline'?"Colline de Rocfauve": key==='ruines'?"Ruines Oubliées": key==='grotte'?"Grotte Sépulcrale":"Lisière";
  write(`👉 Tu te diriges vers ${state.location}.`,"sys"); explore(true);
}
// === Choix de classe & compétences ===
function chooseClass(){
  clearChoices(); 
  write('Choisis ta classe :','info');

  const pick = (nom, boostKey, boostVal, skill) => { 
    state.cls = nom; 
    if (boostKey) state.attrs[boostKey] = boostVal; 
    state.hasChosenClass = true; 
    state.skill = skill; 
    setStats(); 
    startAdventure(); 
  };

  addChoice('🛡️ Guerrier', ()=> pick('Guerrier','FOR',3,{
    name:'Frappe vaillante', cooldown:3, cd:0, desc:'Attaque puissante',
    use:(e)=>{ const dmg=rng.between(2,6)+rng.between(2,6)+state.level; e.hp-=dmg; write(`💥 Frappe vaillante : -${dmg} PV`,'good'); }
  }), true);

  addChoice('🗡️ Voleur', ()=> pick('Voleur','AGI',3,{
    name:'Coup de l’ombre', cooldown:3, cd:0, desc:'Jet +4, dégâts + vol',
    use:(e)=>{
      const r=d20(4).total; 
      if(r>=e.ac){ 
        const steal=Math.min(3, state.gold); 
        const dmg=rng.between(3,8)+steal; 
        e.hp-=dmg; changeGold(steal); 
        write(`🗡️ L’ombre frappe : -${dmg} PV`,'good'); 
      } else write('Tu rates.','warn');
    }
  }));

  addChoice('⚕️ Paladin', ()=> pick('Paladin','SAG',3,{
    name:'Lumière sacrée', cooldown:3, cd:0, desc:'Soigne',
    use:()=>{ heal(rng.between(3,8)+state.level); }
  }));

  addChoice('🏹 Rôdeur', ()=> pick('Rôdeur','AGI',3,{
    name:'Tir précis', cooldown:2, cd:0, desc:'Jet +6, 1d8 dégâts',
    use:(e)=>{
      const r=d20(6).total; 
      if(r>=e.ac){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🏹 Tir précis : -${dmg} PV`,'good') }
      else write('Tir manqué.','warn');
    }
  }));

  addChoice('🔮 Mystique', ()=> pick('Mystique','SAG',3,{
    name:'Onde arcanique', cooldown:3, cd:0, desc:'1d8 & vulnérabilité',
    use:(e)=>{
      const dmg=rng.between(3,8); 
      e.hp-=dmg; 
      e.dotChance=Math.min(0.6,(e.dotChance||0)+0.15); 
      write(`🔮 Onde arcanique : -${dmg} PV`,'good');
    }
  }));
}

// === État initial ===
function initialState(){
  return {
    name:"Eldarion", cls:"—",
    attrs:{FOR:1,AGI:1,SAG:1}, // FOR=Force, AGI=Agilité, SAG=Sagesse
    hp:22, hpMax:22, gold:12,
    level:1, xp:0, rep:0,
    day:1, time:"Aube",
    location:"Lisière de la forêt de Mirval",
    locationKey:"clairiere",
    inventory:[
      {name:"Vieille épée", desc:"+1 attaque", bonus:{FOR:+1}},
      {name:"Petite armure", desc:"+1 défense", bonus:{VIT:+1}}
    ],
    potions:1, status:[],
    flags:{
      metHerbalist:false,metSmith:false,peasantSaved:false,
      fragments:0,bossUnlocked:false,torch:false,oracleSeen:false,
      ruinsUnlocked:true,grottoUnlocked:false,rumors:0,charm:0
    },
    quests:{
      main:{title:'Le Chef Bandit',state:'En cours'},
      side:[],
      artifacts:{title:'Fragments d’artefact (0/3)',state:'En cours'}
    },
    achievements:{}, lastLabels:[],
    inCombat:false, enemy:null,
    skill:{name:"", cooldown:0, cd:0, desc:"", use:()=>{}}
  };
}
let state = initialState();

// === Setup / démarrage ===
function setup(isNew=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();
  const classesValides = ['Guerrier','Voleur','Paladin','Rôdeur','Mystique'];
  const needsClass = !state.cls || state.cls === '—' || !classesValides.includes(state.cls);
  if (isNew || ui.log.childElementCount===0 || needsClass){
    write("v10 — Démarrage d’une nouvelle partie.", "sys");
    chooseClass();
    return;
  }
  explore(true);
}

// Nouvelle aventure après choix
function startAdventure(){ 
  ui.log.innerHTML=""; 
  write("L'aventure commence !","info"); 
  setStats(); 
  explore(true); 
}

// Écran de mort
function gameOver(){
  state.inCombat=false;
  write("<b>☠️ Tu t'effondres… La forêt de Mirval se referme sur ton destin.</b>","bad");
  clearChoices();
  addChoice("♻️ Recommencer", ()=>{ state=initialState(); ui.log.innerHTML=""; setup(true); }, true);
}

// Réduction du cooldown de compétence à chaque exploration
const _explore = explore;
explore = function(...args){ 
  if(state.skill && typeof state.skill.cd==='number'){ 
    state.skill.cd = Math.max(0, state.skill.cd-1); 
  } 
  _explore(...args); 
};

// === Boot ===
(function boot(){
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=>setup(true), { once:true });
  } else {
    setup(true);
  }
})();
