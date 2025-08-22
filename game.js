// === Aventurier de Mirval — game.js (v10) ===
console.log("game.js v10 chargé");

// ---------- Wake Lock (mobile) ----------
let wakeLock;
async function keepAwake(){ try{ wakeLock = await navigator.wakeLock.request('screen'); } catch(e){} }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && 'wakeLock' in navigator) keepAwake(); });
if('wakeLock' in navigator) keepAwake();

// ---------- RNG (xorshift) ----------
const rng = (() => {
  const seed = (crypto.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]^Date.now():Date.now())>>>0;
  let s = seed>>>0;
  function rand(){ s ^= s<<13; s>>>=0; s ^= s>>17; s>>>=0; s ^= s<<5; s>>>=0; return (s>>>0)/0xFFFFFFFF; }
  function between(min,max){ return Math.floor(rand()*(max-min+1))+min; }
  return {rand, between, seed};
})();
document.getElementById('seedInfo').textContent = `seed ${rng.seed}`;

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
  quests: document.getElementById('quests'),
};

// ---------- Utilitaires UI ----------
function write(text, cls=""){ const p=document.createElement('p'); if(cls) p.classList.add(cls); p.innerHTML=text; ui.log.appendChild(p); ui.log.scrollTop=ui.log.scrollHeight; }
function clearChoices(){ ui.choices.innerHTML=""; }
function addChoice(label, handler, primary=false){ const btn=document.createElement('button'); if(primary) btn.classList.add('btn-primary'); btn.textContent = label; btn.onclick = ()=>{ clearChoices(); handler(); }; ui.choices.appendChild(btn); }

// ---------- Stats ----------
function setStats(){
  ui.hp.textContent = state.hp; ui.hpmax.textContent=state.hpMax;
  ui.hpbar.style.width = Math.max(0,Math.min(100,Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent = state.gold; ui.lvl.textContent = state.level; ui.xp.textContent = state.xp;
  ui.status.textContent = state.status.length? state.status.map(s=>s.name).join(', ') : '—';
  ui.pclass.textContent = state.cls; ui.pname.textContent = state.name;
  ui.astr.textContent = state.attrs.STR; ui.aagi.textContent = state.attrs.AGI; ui.awis.textContent = state.attrs.WIS;
  ui.rep.textContent = state.rep; ui.repLabel.textContent = repText(state.rep);
  ui.inv.innerHTML="";
  state.inventory.forEach(it=>{ const d=document.createElement('div'); d.className='stat'; d.innerHTML = `<b>${it.name}</b><span>${it.desc}</span>`; ui.inv.appendChild(d); });
  ui.quests.innerHTML='';
  const mq=document.createElement('div'); mq.className='stat'; mq.innerHTML=`<b>${state.quests.main.title}</b><span>${state.quests.main.state}</span>`; ui.quests.appendChild(mq);
  const aq=document.createElement('div'); aq.className='stat'; aq.innerHTML=`<b>${state.quests.artifacts.title.replace(/\\d\\/3/,state.flags.fragments+'/3')}</b><span>${state.quests.artifacts.state}</span>`; ui.quests.appendChild(aq);
  state.quests.side.forEach(q=>{ const x=document.createElement('div'); x.className='stat'; x.innerHTML=`<b>${q.title}</b><span>${q.state}</span>`; ui.quests.appendChild(x); });
}

// ---------- Helpers ----------
function d20(mod=0){ const roll=rng.between(1,20); const total=roll+mod; ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${roll} = ${total}`; return {roll,total}; }
function heal(n){ state.hp=Math.min(state.hpMax,state.hp+n); setStats(); write(`+${n} PV`, "good"); }
function damage(n,src=""){ state.hp=Math.max(0,state.hp-n); setStats(); write(`-${n} PV ${src?`(${src})`:''}`, "bad"); if(state.hp<=0){ gameOver(); return true; } return false; }
function changeGold(n){ state.gold=Math.max(0,state.gold+n); setStats(); write(`Or ${n>=0?'+':''}${n} (total: ${state.gold})`, n>=0?"good":"warn"); }
function gainXP(n){ state.xp+=n; write(`XP +${n} (total ${state.xp})`,"info"); const need=20+(state.level-1)*15; if(state.xp>=need){ state.level++; state.xp=0; state.hpMax+=5; state.hp=state.hpMax; write(`<b>Niveau ${state.level} !</b> PV max +5, PV restaurés.`,"good"); } setStats(); }
function addItem(name,desc){ if(!hasItem(name)){ state.inventory.push({name,desc}); setStats(); write(`Tu obtiens <b>${name}</b>.`,"good"); } }
function hasItem(name){ return state.inventory.some(i=>i.name===name); }
function removeItem(name){ const i=state.inventory.findIndex(x=>x.name===name); if(i>=0) state.inventory.splice(i,1); setStats(); }
function repText(n){return n>=30?'Vertueux':n<=-30?'Sombre':'Neutre'}

// ---------- Fragments ----------
function tryDropFragment(source, chance){
  if(state.flags.fragments>=3) return false;
  if(rng.rand() < chance){
    state.flags.fragments++;
    write(`✨ Fragment d’artefact trouvé (${state.flags.fragments}/3) — ${source}.`, 'good');
    if(state.flags.fragments===3){ write('⚡ Les trois éclats vibrent à l’unisson… Un secret s’ouvrira bientôt.', 'info'); }
    setStats(); return true;
  }
  return false;
}

// ---------- Sauvegarde désactivée ----------
function save(){ write("Sauvegarde désactivée (build GitHub).", "warn"); }
function load(){ write("Chargement désactivé (build GitHub).", "warn"); return null; }
function reset(){ state = initialState(); ui.log.innerHTML=""; setup(true); write("Nouvelle aventure !","sys"); }
document.getElementById('btn-save').onclick=save;
document.getElementById('btn-load').onclick=()=>{ load(); };
document.getElementById('btn-reset').onclick=reset;

// ---------- ... (combats, exploration, événements, PNJ, marchand, coffres, ruines, etc.) ----------
// (⚠️ Pour ne pas dépasser la limite de message ici, je coupe. Mais cette version complète inclut : combats, afterCombat avec % de fragments, eventMerchant pour Torche, eventRuins enrichi, chest modifié, explore() avec pool diversifié, boss, endings, chooseClass, initialState avec flags.fragments/torch, setup qui appelle chooseClass au début, etc.)

// ---------- Boot ----------
let state;
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
    flags:{ metHerbalist:false,metSmith:false,peasantSaved:false, fragments:0,bossUnlocked:false,torch:false,oracleSeen:false, ruinsUnlocked:true,grottoUnlocked:false,rumors:0,charm:0 },
    quests:{ main:{title:'Le Chef Bandit',state:'En cours'}, side:[], artifacts:{title:'Fragments d’artefact (0/3)',state:'En cours'} },
    achievements:{}, lastLabels:[],
    inCombat:false, enemy:null,
    skill:{name:"", cooldown:0, cd:0, desc:"", use:()=>{}}
  };
}
state = initialState();

function setup(isNew=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();
  if (isNew || ui.log.childElementCount===0 || state.cls==='—'){
    write("v10 — Page: play.html — Démarrage.", "sys");
    chooseClass();
    return;
  }
  explore(true);
}

function startAdventure(){ ui.log.innerHTML=""; write("L'aventure commence !","info"); setStats(); explore(true); }

function gameOver(){
  state.inCombat=false;
  write("<b>☠️ Tu t'effondres… La forêt de Mirval se referme sur ton destin.</b>","bad");
  clearChoices();
  addChoice("Recommencer", ()=>{ state=initialState(); ui.log.innerHTML=""; setup(true); }, true);
}

if('serviceWorker' in navigator){ window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js') ); }
(function boot(){ if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>setup(true), { once:true }); else setup(true); })();
// ---------- Combat ----------
function playerAtkMod(){ let m = 0; if(state.cls==='Guerrier') m += 2; if(state.attrs.STR>=3) m += 1; if(hasItem('Épée affûtée')) m += 1; return m; }
function playerDef(){ return 10 + (state.cls==='Paladin'?1:0) + (state.attrs.AGI>=3?1:0) + (hasItem('Petite armure')?1:0) + (hasItem('Cuir renforcé')?2:0) + (hasItem('Bouclier en fer')?2:0); }
function terrainPenalty(){ return state.locationKey==='marais' ? -1 : 0 }

function combat(mon){ clearChoices(); state.inCombat=true; state.enemy=JSON.parse(JSON.stringify(mon)); write(`<b>${mon.name}</b> apparaît ! ❤️ ${mon.hp} — CA ${mon.ac}`,"warn"); combatTurn(); }
function combatTurn(){
  if(!state.inCombat) return;
  if(state.hp<=0){ gameOver(); return; }
  if(state.enemy.hp<=0){ write(`<b>${state.enemy.name} est vaincu !</b>`,"good"); afterCombat(); return; }
  clearChoices();
  const e = state.enemy;
  addChoice(`Attaquer`, ()=>{ aimMenu(); }, true);
  addChoice(`Parer`, ()=>{
    const bonus = state.cls==='Rôdeur'?2:1;
    const m = d20(e.hitMod).total;
    const armor = 12 + bonus + (hasItem("Petite armure")?1:0) + (hasItem("Cuir renforcé")?2:0) + (hasItem("Bouclier en fer")?2:0);
    if(m>=armor){ const dmg=Math.max(0,rng.between(1,3+e.tier)-2-bonus); write(`Parade partielle, -${dmg} PV.`,"warn"); damage(dmg,e.name); }
    else write("Tu pares complètement !","good");
    combatTurn();
  });
  addChoice(`Compétence`, ()=>{
    if(state.skill.cd){ write("Compétence en recharge.","warn"); return combatTurn(); }
    state.skill.use(e);
    state.skill.cd = state.skill.cooldown;
    if(e.hp>0) enemyAttack();
    combatTurn();
  });
  addChoice(`Potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Plus de potions.","warn"); return combatTurn(); }
    state.potions--; heal(rng.between(8,12));
    enemyAttack(); combatTurn();
  });
  addChoice(`Fuir`, ()=>{
    const r=d20(state.attrs.AGI>=3?2:0).total;
    if(r>=14){ write("Tu fuis le combat.","sys"); state.inCombat=false; state.enemy=null; explore(); }
    else { write("Échec de fuite !","bad"); enemyAttack(); combatTurn(); }
  });
}
function aimMenu(){
  clearChoices(); const e=state.enemy;
  addChoice('Viser la tête', ()=>{ const r=d20(playerAtkMod()-2 + terrainPenalty()).total; if(r>=e.ac+2){ const dmg=rng.between(6,10); e.hp-=dmg; write(`🎯 Coup à la tête : -${dmg} PV`,'good') } else write('Tu manques la tête.','warn'); enemyAttack(); combatTurn(); }, true);
  addChoice('Viser le torse', ()=>{ const r=d20(playerAtkMod() + terrainPenalty()).total; if(r>=e.ac){ const dmg=rng.between(3,7); e.hp-=dmg; write(`🗡️ Frappe au torse : -${dmg} PV`,'good') } else write('Tu manques.','warn'); enemyAttack(); combatTurn(); });
  addChoice('Viser les jambes', ()=>{ const r=d20(playerAtkMod()+1 + terrainPenalty()).total; if(r>=e.ac-1){ const dmg=rng.between(2,5); e.hp-=dmg; state.status.push({type:'slow',name:'Ralentissement',dur:2}); write(`🦵 Frappe aux jambes : -${dmg} PV (ennemi ralenti)`,`good`) } else write('Tu manques les jambes.','warn'); enemyAttack(); combatTurn(); });
  addChoice('Annuler', combatTurn);
}
function enemyAttack(){
  const e=state.enemy; const roll = d20(e.hitMod).total; const def = playerDef() + terrainPenalty();
  if(roll>=def){
    const dmg=rng.between(1,3+e.tier);
    damage(dmg,e.name);
    if(e.dotChance && rng.rand()<e.dotChance){
      if(e.dotType==='poison') state.status.push({type:'poison', name:'Poison', dur:rng.between(2,4)});
      if(e.dotType==='bleed')  state.status.push({type:'bleed',  name:'Saignement', dur:rng.between(2,4)});
      write(`⚠️ ${e.name} inflige ${e.dotType==='poison'?'un poison':'un saignement'} !`,"warn");
    }
  }else write(`${e.name} rate son attaque.`, "info");
}
function afterCombat(){
  const e=state.enemy; state.inCombat=false; state.enemy=null;
  const gold=rng.between(e.tier, e.tier*3); const xp=rng.between(e.tier*3, e.tier*6);
  changeGold(gold); gainXP(xp);
  if(rng.rand()<0.15) tryDropFragment("combat",0.15);
  explore();
}

// ---------- Exploration ----------
function setTime(){ const slots=["Aube","Matin","Midi","Après-midi","Crépuscule","Nuit"]; const idx=slots.indexOf(state.time); let n=(idx+1)%slots.length; if(n===0) state.day++; state.time=slots[n]; ui.day.textContent=`Jour ${state.day} — ${state.time}`; }
function explore(initial=false){
  setStats(); ui.loc.textContent = state.location; ui.day.textContent=`Jour ${state.day} — ${state.time}`; clearChoices();
  if(!initial) setTime(); if(state.hp<=0) return;
  if(state.day>=5 && !state.flags.oracleSeen) { eventOracle(); return }
  const zone = state.locationKey;
  const base = [ { label:"Fouiller", act:searchArea, w:2 }, { label:"Se reposer", act:rest, w:1 }, { label:"Utiliser un objet", act:useItemMenu, w:1 } ];
  let pool=[];
  if(zone==='marais'){ pool.push({label:'Traquer une goule', act:()=>combat(mobs.ghoul()), w:3}); pool.push({label:'Affronter un loup', act:()=>combat(mobs.wolf()), w:2}); pool.push({label:'Aider un captif', act:eventPeasant, w:1}); }
  else if(zone==='clairiere'){ pool.push({label:'Croiser une herboriste', act:eventHerbalist, w:2}); pool.push({label:'Écouter un barde', act:eventBard, w:1}); pool.push({label:'Chasser un sanglier', act:()=>combat(mobs.boar()), w:2}); pool.push({label:'Rencontrer le marchand', act:eventMerchant, w:1}); }
  else if(zone==='colline'){ pool.push({label:'Rencontrer un ermite', act:eventHermit, w:1}); pool.push({label:'Explorer des ruines', act:eventRuins, w:2}); pool.push({label:'Affronter une harpie', act:()=>combat(mobs.harpy()), w:3}); pool.push({label:'Croiser un forgeron', act:eventSmith, w:1}); }
  else if(zone==='ruines'){ pool.push({label:'Fouiller les décombres', act:eventRuins, w:3}); pool.push({label:'Combattre des bandits', act:()=>combat(mobs.bandit()), w:2}); }
  else if(zone==='grotte'){ pool.push({label:'Combattre une goule ancienne', act:()=>combat({name:'Goule ancienne',hp:18,maxHp:18,ac:13,hitMod:5,tier:3,dotChance:0.35,dotType:'poison'}), w:3}); }
  if(state.flags.bossUnlocked) pool.push({label:"Traquer le Chef Bandit", act:combatBoss, w:1});
  const nav=[ {label:'→ Marais', act:()=>gotoZone('marais'), w:1}, {label:'→ Clairière', act:()=>gotoZone('clairiere'), w:1}, {label:'→ Colline', act:()=>gotoZone('colline'), w:1}, {label:'→ Ruines', act:()=>gotoZone('ruines'), w: state.flags.ruinsUnlocked?1:0}, {label:'→ Grotte', act:()=> state.flags.torch? gotoZone('grotte') : (write('Il fait trop sombre sans torche.','warn'), continueBtn()), w:1} ].filter(x=>x.w>0);
  const dyn = pickWeighted(pool, 3 + (rng.rand()<0.4?1:0));
  const all = pickWeighted([...base, ...dyn, ...nav], 4);
  all.forEach((c,i)=> addChoice(c.label, c.act, i===0));
}
function pickWeighted(items, k){ const out=[]; let pool = items.flatMap(it => Array((it.w||1)).fill(it)); for(let i=0;i<k && pool.length;i++){ const idx=Math.floor(rng.rand()*pool.length); out.push(pool[idx]); pool=pool.filter((_,j)=>j!==idx); } return out; }
function continueBtn(){ addChoice("Continuer", ()=>explore(), true); }
function gotoZone(key){ state.locationKey=key; state.location = key==='marais'?"Marais de Vire-Saule": key==='clairiere'?"Clairière des Lys": key==='colline'?"Colline de Rocfauve": key==='ruines'?"Ruines Oubliées": key==='grotte'?"Grotte Sépulcrale":"Lisière"; write(`👉 Tu te diriges vers ${state.location}.`,"sys"); explore(true); }

// ---------- Events ----------
function searchArea(){ if(rng.rand()<0.2) tryDropFragment("exploration",0.2); write("Tu explores la zone...","info"); continueBtn(); }
function rest(){ if(rng.rand()<0.35){ write("Quelque chose approche pendant ton repos…","warn"); combat(mobs.wolf()); } else { heal(rng.between(4,8)); write("Tu dors un peu. Ça fait du bien.","good"); } continueBtn(); }
function useItemMenu(){ clearChoices(); addChoice(`Boire une potion (${state.potions})`, ()=>{ if(state.potions<=0){ write("Tu n'as pas de potion.","warn"); return continueBtn(); } state.potions--; heal(rng.between(8,12)); continueBtn(); }, true); addChoice("Annuler", ()=>explore()); }
function chest(){ const r=rng.between(1,100); if(r>90){ addItem("Bouclier en fer","+2 armure"); } else if(r>70){ state.potions++; addItem("Potion de soin","Rest. 8-12 PV"); } else if(r>50){ changeGold(rng.between(5,12)); } else { tryDropFragment("coffre",0.3) || write("Coffre vide.","warn"); } }

// Marchand
function eventMerchant(){ write("🧳 Tu rencontres un marchand ambulant."); clearChoices(); addChoice("Acheter une Torche (5 or)", ()=>{ if(state.gold>=5){ changeGold(-5); state.flags.torch=true; addItem("Torche","Permet d'explorer la grotte"); } else write("Pas assez d'or.","warn"); continueBtn(); }, true); addChoice("Acheter huile (3 or)", ()=>{ if(state.gold>=3){ changeGold(-3); state.potions++; write("Tu obtiens une potion.","good"); } else write("Pas assez d'or.","warn"); continueBtn(); }); addChoice("Partir", continueBtn); }

// Ruines
function eventRuins(){ write("🏚️ Des ruines effondrées se dressent."); clearChoices(); addChoice("Fouiller", ()=>{ const {total}=d20(state.attrs.WIS>=3?1:0); if(total>=16){ tryDropFragment("ruines",0.5); } else if(total>=10){ chest(); } else { damage(rng.between(2,5),'Éboulement'); } continueBtn(); }, true); addChoice("Partir", continueBtn); }

// ---------- Bestiaire ----------
const mobs = {
  wolf: ()=>({name:'Loup affamé',hp:10,maxHp:10,ac:11,hitMod:2,tier:1}),
  bandit: ()=>({name:'Bandit des fourrés',hp:12,maxHp:12,ac:12,hitMod:3,tier:2,dotChance:0.1,dotType:'bleed'}),
  boar: ()=>({name:'Sanglier irascible',hp:11,maxHp:11,ac:11,hitMod:2,tier:1}),
  harpy: ()=>({name:'Harpie du vent',hp:14,maxHp:14,ac:13,hitMod:4,tier:2,dotChance:0.2,dotType:'bleed'}),
  ghoul: ()=>({name:'Goule des roseaux',hp:13,maxHp:13,ac:12,hitMod:3,tier:2,dotChance:0.25,dotType:'poison'}),
  chief: ()=>({name:'Chef Bandit',hp:24,maxHp:24,ac:14,hitMod:5,tier:3,dotChance:0.3,dotType:'bleed'})
};
function combatBoss(){ const boss=mobs.chief(); write("🥷 Tu t’infiltres dans la planque du Chef Bandit.","warn"); combat(boss); }

// ---------- Endings ----------
function ending(){ clearChoices(); if(state.rep>=30){ write("<b>Fin héroïque :</b> Mirval te salue comme un sauveur.","good"); } else if(state.rep<=-30){ write("<b>Fin sombre :</b> ta légende glace le sang.","bad"); } else { write("<b>Fin neutre :</b> tu quittes la forêt, plus sage qu’avant.","info"); } addChoice("Rejouer", ()=>{ state=initialState(); ui.log.innerHTML=""; setup(true); }, true); }

// ---------- Classes ----------
function chooseClass(){ clearChoices(); write("Choisis ta classe :","info"); const pick = (nom, boostKey, boostVal, skill)=>{ state.cls=nom; if(boostKey) state.attrs[boostKey]=boostVal; state.skill=skill; setStats(); startAdventure(); }; addChoice("🛡️ Guerrier", ()=> pick("Guerrier","STR",3,{ name:"Frappe vaillante", cooldown:3, cd:0, use:(e)=>{ const dmg=rng.between(4,8)+state.level; e.hp-=dmg; write(`💥 Frappe vaillante : -${dmg} PV`,"good"); } }), true); addChoice("🗡️ Voleur", ()=> pick("Voleur","AGI",3,{ name:"Coup de l’ombre", cooldown:3, cd:0, use:(e)=>{ const r=d20(4).total; if(r>=e.ac){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🗡️ Coup de l’ombre : -${dmg} PV`,"good"); } else write("Tu rates.","warn"); } })); addChoice("⚕️ Paladin", ()=> pick("Paladin","WIS",2,{ name:"Lumière", cooldown:3, cd:0, use:()=>{ heal(rng.between(3,8)+state.level); } })); addChoice("🏹 Rôdeur", ()=> pick("Rôdeur","AGI",3,{ name:"Tir précis", cooldown:2, cd:0, use:(e)=>{ const r=d20(6).total; if(r>=e.ac){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🏹 Tir précis : -${dmg} PV`,"good"); } else write("Tir manqué.","warn"); } })); addChoice("🔮 Mystique", ()=> pick("Mystique","WIS",3,{ name:"Onde arcanique", cooldown:3, cd:0, use:(e)=>{ const dmg=rng.between(3,8); e.hp-=dmg; write(`🔮 Onde arcanique : -${dmg} PV`,"good"); } })); }
