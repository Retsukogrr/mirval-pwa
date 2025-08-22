// === Aventurier de Mirval — game.js ===
// Version v9, séparée pour plus de clarté

// Garder l’écran éveillé (utile sur mobile)
let wakeLock; 
async function keepAwake(){ 
  try{ wakeLock = await navigator.wakeLock.request('screen'); } catch(e){} 
}
document.addEventListener('visibilitychange',()=>{ 
  if(document.visibilityState==='visible' && 'wakeLock' in navigator) keepAwake(); 
});
if('wakeLock' in navigator) keepAwake();

// RNG avec graine
const rng = (() => {
  const seed = (crypto.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]^Date.now():Date.now())>>>0;
  let s = seed>>>0;
  function rand(){ 
    s ^= s<<13; s>>>=0; 
    s ^= s>>17; s>>>=0; 
    s ^= s<<5; s>>>=0; 
    return (s>>>0)/0xFFFFFFFF; 
  }
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
  astr: document.getElementById('a-str'),
  aagi: document.getElementById('a-agi'),
  awis: document.getElementById('a-wis'),
  rep: document.getElementById('rep'),
  repLabel: document.getElementById('rep-label'),
  quests: document.getElementById('quests'),
};

// Fonctions utilitaires
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

// Mise à jour stats à l’écran
function setStats(){
  ui.hp.textContent = state.hp; ui.hpmax.textContent=state.hpMax;
  ui.hpbar.style.width = Math.max(0,Math.min(100,Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent = state.gold; ui.lvl.textContent = state.level; ui.xp.textContent = state.xp;
  ui.status.textContent = state.status.length? state.status.map(s=>s.name).join(', ') : '—';
  ui.pclass.textContent = state.cls; ui.pname.textContent = state.name;
  ui.astr.textContent = state.attrs.STR; ui.aagi.textContent = state.attrs.AGI; ui.awis.textContent = state.attrs.WIS;
  ui.rep.textContent = state.rep; ui.repLabel.textContent = repText(state.rep);
  ui.inv.innerHTML="";
  state.inventory.forEach(it=>{
    const d=document.createElement('div'); d.className='stat';
    d.innerHTML = `<b>${it.name}</b><span>${it.desc}</span>`;
    ui.inv.appendChild(d);
  });
  // Quêtes
  ui.quests.innerHTML='';
  const mq=document.createElement('div'); mq.className='stat'; mq.innerHTML=`<b>${state.quests.main.title}</b><span>${state.quests.main.state}</span>`; ui.quests.appendChild(mq);
  const aq=document.createElement('div'); aq.className='stat'; aq.innerHTML=`<b>${state.quests.artifacts.title.replace(/\\d\\/3/,state.flags.fragments+'/3')}</b><span>${state.quests.artifacts.state}</span>`; ui.quests.appendChild(aq);
  state.quests.side.forEach(q=>{
    const x=document.createElement('div'); x.className='stat'; 
    x.innerHTML=`<b>${q.title}</b><span>${q.state}</span>`; 
    ui.quests.appendChild(x)
  });
}

// Dés et modificateurs
function d20(mod=0){ 
  const roll=rng.between(1,20); 
  const total=roll+mod; 
  ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${roll} = ${total}`; 
  return {roll,total}; 
}
function heal(n){ state.hp=Math.min(state.hpMax,state.hp+n); setStats(); write(`+${n} PV`, "good"); }
function damage(n,src=""){ 
  state.hp=Math.max(0,state.hp-n); 
  setStats(); 
  write(`-${n} PV ${src?`(${src})`:''}`, "bad"); 
  if(state.hp<=0){ gameOver(); return true; } 
  return false; 
}
function changeGold(n){ 
  state.gold=Math.max(0,state.gold+n); 
  setStats(); 
  write(`Or ${n>=0?'+':''}${n} (total: ${state.gold})`, n>=0?"good":"warn"); 
}
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
  } 
  setStats(); 
}
function addItem(name,desc){ state.inventory.push({name,desc}); setStats(); write(`Tu obtiens <b>${name}</b>.`,"good"); }
function hasItem(name){ return state.inventory.some(i=>i.name===name); }
function removeItem(name){ const i=state.inventory.findIndex(x=>x.name===name); if(i>=0) state.inventory.splice(i,1); setStats(); }
function repText(n){return n>=30?'Vertueux':n<=-30?'Sombre':'Neutre'}

// Sauvegarde
function save(){ localStorage.setItem('mirval.save', JSON.stringify(state)); write("Sauvegarde effectuée.","sys"); }
function load(){
  try{ const raw=localStorage.getItem('mirval.save'); if(!raw) return null; const obj=JSON.parse(raw); return obj&&typeof obj==='object'?obj:null; }
  catch(e){ return null; }
}
function reset(){ state = initialState(); ui.log.innerHTML=""; setup(true); write("Nouvelle aventure !","sys"); }
document.getElementById('btn-save').onclick=save;
document.getElementById('btn-load').onclick=()=>{ const s=load(); if(s){ state=s; ui.log.innerHTML=""; setup(); write("Sauvegarde chargée.","sys"); } else write("Aucune sauvegarde.","warn"); };
document.getElementById('btn-reset').onclick=reset;
// === Statuts récurrents (poison, saignement, ralentissement) ===
function tickStatus(){
  state.status = state.status.filter(st=>{
    if(st.type==='poison'){ const dmg=rng.between(1,2); damage(dmg,"Poison"); st.dur--; }
    if(st.type==='bleed'){ const dmg=2; damage(dmg,"Saignement"); st.dur--; }
    if(st.type==='slow'){ st.dur--; if(st.dur===0) write('💨 Tu te sens plus léger.','info') }
    return st.dur>0 && state.hp>0;
  });
}

// Ajuste la réputation (et rafraîchit l’UI)
function rep(n){ state.rep += n; setStats(); }

// Modifs d’attaque/défense et pénalité de terrain
function playerAtkMod(){ 
  let m = 0;
  if(state.cls==='Guerrier') m += 2;
  if(state.attrs.STR>=3) m += 1;
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

// === ⚔️ COMBAT ===
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

  addChoice(`Attaquer`, ()=>{ aimMenu(); }, true);

  addChoice(`Parer`, ()=>{
    const bonus = state.cls==='Rôdeur'?2:1;
    const m = d20(e.hitMod).total;
    const armor = 12 + bonus + (hasItem("Petite armure")?1:0) + (hasItem("Cuir renforcé")?2:0) + (hasItem("Bouclier en fer")?2:0);
    if(m>=armor){ 
      const dmg=Math.max(0,rng.between(1,3+e.tier)-2-bonus); 
      write(`Parade partielle, -${dmg} PV.`,"warn"); 
      damage(dmg,e.name); 
    }
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
  addChoice('Viser la tête', ()=>{
    const r=d20(playerAtkMod()-2 + terrainPenalty()).total; 
    if(r>=e.ac+2){ const dmg=rng.between(6,10); e.hp-=dmg; write(`🎯 Coup à la tête : -${dmg} PV`,'good') } 
    else write('Tu manques la tête.','warn'); 
    enemyAttack(); combatTurn();
  }, true);

  addChoice('Viser le torse', ()=>{
    const r=d20(playerAtkMod() + terrainPenalty()).total; 
    if(r>=e.ac){ const dmg=rng.between(3,7); e.hp-=dmg; write(`🗡️ Frappe au torse : -${dmg} PV`,'good') } 
    else write('Tu manques.','warn'); 
    enemyAttack(); combatTurn();
  });

  addChoice('Viser les jambes', ()=>{
    const r=d20(playerAtkMod()+1 + terrainPenalty()).total; 
    if(r>=e.ac-1){ const dmg=rng.between(2,5); e.hp-=dmg; state.status.push({type:'slow',name:'Ralentissement',dur:2}); write(`🦵 Frappe aux jambes : -${dmg} PV (ennemi ralenti)`,`good`) } 
    else write('Tu manques les jambes.','warn'); 
    enemyAttack(); combatTurn();
  });

  addChoice('Annuler', combatTurn);
}

function enemyAttack(){
  const e=state.enemy;
  const roll = d20(e.hitMod).total;
  const def = playerDef() + terrainPenalty();
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
// === Temps & exploration ===
function setTime(){
  const slots=["Aube","Matin","Midi","Après-midi","Crépuscule","Nuit"];
  const idx=slots.indexOf(state.time); 
  let n=(idx+1)%slots.length; 
  if(n===0) state.day++;
  state.time=slots[n]; 
  ui.day.textContent=`Jour ${state.day} — ${state.time}`;
}

function explore(initial=false){
  setStats(); 
  ui.loc.textContent = state.location; 
  ui.day.textContent=`Jour ${state.day} — ${state.time}`; 
  clearChoices();
  if(!initial) setTime();
  tickStatus(); 
  if(state.hp<=0) return;

  // Événement temporel unique
  if(state.day>=5 && !state.flags.oracleSeen) { eventOracle(); return }

  const zone = state.locationKey;
  const base = [
    { label:"Fouiller", act:searchArea, w:2 },
    { label:"Se reposer", act:rest, w:1 },
    { label:"Utiliser un objet", act:useItemMenu, w:1 }
  ];

  let pool=[];
  if(zone==='marais'){
    pool.push({label:'Suivre des feux-follets', act:eventSanctuary, w:2});
    pool.push({label:'Aider un captif', act:()=>{ if(!state.flags.peasantSaved) eventPeasant(); else { write('La berge est silencieuse.'); continueBtn(); } }, w:1});
    pool.push({label:'Traquer une goule', act:()=>combat(mobTemplates.ghoul()), w:3});
    pool.push({label:'Affronter un loup', act:()=>combat(mobTemplates.wolf()), w:2});
    pool.push({label:'Tomber sur un piège', act:()=>{ eventTrap(); continueBtn(); }, w:1});
  } 
  else if(zone==='clairiere'){
    pool.push({label:'Croiser une herboriste', act:eventHerbalist, w:2});
    pool.push({label:'Écouter un barde', act:eventBard, w:1});
    pool.push({label:'Chasser un sanglier', act:()=>combat(mobTemplates.boar()), w:2});
    pool.push({label:'Autel moussu', act:eventSanctuary, w:2});
    pool.push({label:'Bandits embusqués', act:()=>combat(mobTemplates.bandit()), w:2});
  } 
  else if(zone==='colline'){
    pool.push({label:'Rencontrer un ermite', act:eventHermit, w:1});
    pool.push({label:'Explorer des ruines', act:eventRuins, w:2});
    pool.push({label:'Affronter une harpie', act:()=>combat(mobTemplates.harpy()), w:3});
    pool.push({label:'Croiser un forgeron', act:eventSmith, w:1});
  } 
  else if(zone==='ruines'){
    pool.push({label:'Fouiller les décombres', act:eventRuins, w:3});
    pool.push({label:'Esquiver un éboulement', act:()=>{ damage(rng.between(1,4),'Éboulement'); continueBtn(); }, w:1});
    pool.push({label:'Combattre des bandits', act:()=>combat(mobTemplates.bandit()), w:2});
  } 
  else if(zone==='grotte'){
    pool.push({label:'Combattre une goule ancienne', act:()=>combat({name:'Goule ancienne',hp:18,maxHp:18,ac:13,hitMod:5,tier:3,dotChance:0.35,dotType:'poison'}), w:3});
    pool.push({label:'Échos inquiétants', act:()=>{ const r=d20().total; if(r<10) damage(3,'Stalactite'); else write('Rien ne se passe.'); continueBtn(); }, w:1});
  }

  if(state.flags.bossUnlocked) pool.push({label:"Traquer le Chef Bandit", act:()=>combatBoss(), w:1});

  const nav=[
    {label:'→ Marais', act:()=>gotoZone('marais'), w:1},
    {label:'→ Clairière', act:()=>gotoZone('clairiere'), w:1},
    {label:'→ Colline', act:()=>gotoZone('colline'), w:1},
    {label:'→ Ruines', act:()=>gotoZone('ruines'), w: state.flags.ruinsUnlocked?1:0},
    {label:'→ Grotte', act:()=> state.flags.torch? gotoZone('grotte') : (write('Il fait trop sombre pour entrer.','warn'), continueBtn()), w:1}
  ].filter(x=>x.w>0);

  const dyn = pickWeighted(pool, 3 + (rng.rand()<0.4?1:0));
  const all = pickWeighted([...base, ...dyn, ...nav], 4);
  all.forEach((c,i)=> addChoice(c.label, c.act, i===0));
}

function pickWeighted(items, k){
  const recent = new Set(state.lastLabels);
  let pool = items.flatMap(it => Array((it.w||1)).fill(it)).filter(it=> !recent.has(it.label));
  if(pool.length<k) pool = items.flatMap(it => Array((it.w||1)).fill(it));
  const out=[];
  for(let i=0;i<k && pool.length;i++){
    const idx=Math.floor(rng.rand()*pool.length);
    out.push(pool[idx]);
    pool=pool.filter((_,j)=>j!==idx);
  }
  state.lastLabels = [...out.map(o=>o.label), ...state.lastLabels].slice(0,8);
  return out;
}

function continueBtn(){ addChoice("Continuer", ()=>explore(), true); }

function gotoZone(key){
  state.locationKey=key;
  state.location = key==='marais'?"Marais de Vire-Saule": 
                   key==='clairiere'?"Clairière des Lys":
                   key==='colline'?"Colline de Rocfauve":
                   key==='ruines'?"Ruines Oubliées":
                   key==='grotte'?"Grotte Sépulcrale":"Lisière";
  write(`👉 Tu te diriges vers ${state.location}.`,"sys");
  explore(true);
}

// === Actions générales ===
function searchArea(){
  const bonus = state.attrs.WIS>=3?1:0;
  const {total} = d20(bonus);
  if(total>=18){ write("🔑 Recherche exceptionnelle : tu trouves un coffre scellé.","good"); chest(); }
  else if(total>=12){ write("✨ Quelques pièces sous une pierre.","good"); changeGold(rng.between(2,6)); }
  else if(total>=8){ write("Des traces fraîches… une rencontre approche."); if(rng.rand()<0.5) randomEncounter(); }
  else { write("Aïe ! Ronce traîtresse.","bad"); damage(rng.between(1,3),"Ronces"); }
  continueBtn();
}

function rest(){
  if(rng.rand()<0.35){ write("Quelque chose approche pendant ton repos…","warn"); randomEncounter(); }
  else { heal(rng.between(4,8)); write("Tu dors un peu. Ça fait du bien.","good"); }
  continueBtn();
}

function useItemMenu(){
  clearChoices();
  addChoice(`Boire une potion (${state.potions})`, ()=>{
    if(state.potions<=0) { write("Tu n'as pas de potion.","warn"); return continueBtn(); }
    state.potions--; heal(rng.between(8,12)); continueBtn();
  }, true);
  addChoice("Annuler", ()=>explore());
}

function chest(){
  const r=rng.between(1,100);
  if(r>90){ addItem("Bouclier en fer","+2 armure"); }
  else if(r>70){ addItem("Potion de soin","Rest. 8-12 PV"); state.potions++; }
  else if(r>40){ changeGold(rng.between(7,15)); }
  else { write("💥 Piège !","bad"); damage(rng.between(3,6),"Piège"); }
}

function randomEncounter(){
  const roll=rng.rand();
  const zone=state.locationKey;
  if(roll<0.5) {
    if(zone==='marais') combat(mobTemplates.ghoul());
    else if(zone==='clairiere') combat(mobTemplates.bandit());
    else combat(mobTemplates.harpy());
  }else{
    [eventSanctuary,eventHerbalist,eventSmith,eventHermit][rng.between(0,3)]();
  }
}

// === Événements & PNJ ===
function eventHerbalist(){
  write("🌿 Une herboriste te fait signe.");
  clearChoices();
  addChoice("S’approcher", ()=>{
    if(state.rep<-20){ write("Elle se détourne : 'Je ne sers pas les cruels.'",'warn'); rep(-1); return continueBtn(); }
    write("Elle prépare une mixture fumante…");
    const cost=(state.rep>20?2:3);
    if(state.gold>=cost){ changeGold(-cost); heal(rng.between(6,12)); state.flags.metHerbalist=true }
    else write("Tu n'as pas assez d'or.","warn");
    continueBtn();
  }, true);
  addChoice("Marchander", ()=>{
    const {total}=d20(state.attrs.WIS>=3?2:0);
    if(total>=15){ heal(rng.between(4,8)); write('Elle sourit : "À prix d’ami."','good'); }
    else write('Elle refuse.','warn');
    continueBtn();
  });
  addChoice("Partir", continueBtn);
}

function eventSmith(){
  write('⚒️ Un forgeron itinérant inspecte tes armes.');
  clearChoices();
  addChoice('Demander une amélioration', ()=>{
    if(state.gold>=5){ changeGold(-5); addItem('Épée affûtée','+1 attaque') } 
    else write("Pas assez d'or.",'warn'); 
    continueBtn();
  }, true);
  addChoice('Commander un bouclier', ()=>{
    if(state.gold>=6){ changeGold(-6); addItem('Bouclier en fer','+2 armure') } 
    else write("Pas assez d'or.",'warn'); 
    continueBtn();
  });
  addChoice('Discuter', ()=>{ gainXP(3); continueBtn(); });
}

function eventBard(){
  write('🎻 Un barde propose une chanson.');
  clearChoices();
  addChoice('Écouter', ()=>{
    if(rng.rand()<0.7){ heal(rng.between(3,7)); } 
    else { changeGold(-2); write('La bourse s’est allégée…','warn') } 
    continueBtn();
  }, true);
  addChoice('L’ignorer', continueBtn);
}

function eventRuins(){
  write('🏚️ Des ruines effondrées se dressent.');
  clearChoices();
  addChoice('Fouiller', ()=>{
    const {total}=d20(state.attrs.WIS>=3?1:0); 
    if(total>=16){ 
      if(!state.flags.torch){ state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte') } 
      else { state.flags.fragments++; write('Tu trouves un fragment d’artefact.','good') } 
    } else if(total>=10){ chest() } 
    else { damage(rng.between(2,5),'Éboulement') } 
    continueBtn();
  }, true);
  addChoice('Partir', continueBtn);
}

function eventPeasant(){
  write('🧑‍🌾 Un paysan enchaîné appelle à l’aide.');
  clearChoices();
  addChoice('Le libérer', ()=>{
    const {total}=d20(state.attrs.STR>=3?2:0); 
    if(total>=14){ 
      write('Les chaînes cèdent.','good'); 
      rep(+5); 
      state.flags.peasantSaved=true; 
      state.quests.side.push({title:'Le paysan reconnaissant',state:'En attente'}); 
    } else { damage(rng.between(1,4),'Effort') } 
    continueBtn();
  }, true);
  addChoice('L’ignorer', ()=>{ rep(-3); continueBtn(); });
}

function eventSanctuary(){
  write('⛪ Un ancien sanctuaire se dévoile.');
  clearChoices();
  addChoice('Prier', ()=>{
    const night = state.time==='Nuit' || state.time==='Crépuscule'; 
    const {total}=d20(); 
    const t=total+(night?1:0); 
    if(t>=15){ heal(rng.between(6,12)); rep(+2) } 
    else { damage(rng.between(2,6),'Présage'); rep(-1) } 
    continueBtn();
  }, true);
  addChoice('Désacraliser', ()=>{
    const {total}=d20(-1); 
    if(total>=16){ changeGold(rng.between(8,16)); rep(-3) } 
    else { damage(rng.between(4,7),'Malédiction'); rep(-5) } 
    continueBtn();
  });
  addChoice('Partir', continueBtn);
}

function eventHermit(){
  write('🧙 Un ermite t’observe en silence.');
  clearChoices();
  addChoice('Accepter sa décoction', ()=>{
    if(rng.rand()<0.6){ heal(rng.between(5,10)); gainXP(3) } 
    else { damage(rng.between(2,5),'Nausée') } 
    continueBtn();
  }, true);
  addChoice('Acheter une breloque', ()=>{
    if(state.gold>=5){ changeGold(-5); addItem("Breloque d'ermite","10% annule un mal"); state.flags.charm=1 } 
    else write("Pas assez d'or.",'warn'); 
    continueBtn();
  });
  addChoice('Refuser', continueBtn);
}

function eventTrap(){ 
  write('🪤 Une corde s’enroule à ta cheville !'); 
  const {total}=d20(state.attrs.AGI>=3?2:0); 
  if(total>=13) write('Tu t’en sors de justesse.','good'); 
  else damage(rng.between(2,5),'Piège') 
}

function eventOracle(){
  write('🔮 Une voyante apparaît dans tes rêves.'); 
  clearChoices();
  addChoice('Écouter la prophétie', ()=>{
    write('“Quand trois éclats seront réunis, la porte s’ouvrira.”','info'); 
    state.flags.oracleSeen=true; 
    continueBtn(); 
  }, true);
}

// === Bestiaire ===
const mobTemplates = {
  wolf: ()=>({ name:"Loup affamé", hp:10, maxHp:10, ac:11, hitMod:2, tier:1, dotChance:0, dotType:null }),
  bandit: ()=>({ name:"Bandit des fourrés", hp:12, maxHp:12, ac:12, hitMod:3, tier:2, dotChance:0.1, dotType:'bleed' }),
  boar: ()=>({ name:"Sanglier irascible", hp:11, maxHp:11, ac:11, hitMod:2, tier:1, dotChance:0.05, dotType:'bleed' }),
  harpy: ()=>({ name:"Harpie du vent", hp:14, maxHp:14, ac:13, hitMod:4, tier:2, dotChance:0.2, dotType:'bleed' }),
  ghoul: ()=>({ name:"Goule des roseaux", hp:13, maxHp:13, ac:12, hitMod:3, tier:2, dotChance:0.25, dotType:'poison' }),
  banditChief: ()=>({ name:"Chef Bandit", hp:24, maxHp:24, ac:14, hitMod:5, tier:3, dotChance:0.3, dotType:'bleed' }),
};

// Variante simple accessible ailleurs dans le code
const mobs = {
  wolf: ()=>({name:'Loup affamé',hp:10,maxHp:10,ac:11,hitMod:2,tier:1, dotChance:0}),
  bandit: ()=>({name:'Bandit des fourrés',hp:12,maxHp:12,ac:12,hitMod:3,tier:2, dotChance:0.1, dotType:'bleed'}),
  boar: ()=>({name:'Sanglier irascible',hp:11,maxHp:11,ac:11,hitMod:2,tier:1, dotChance:0.05, dotType:'bleed'}),
  harpy: ()=>({name:'Harpie du vent',hp:14,maxHp:14,ac:13,hitMod:4,tier:2, dotChance:0.2, dotType:'bleed'}),
  ghoul: ()=>({name:'Goule des roseaux',hp:13,maxHp:13,ac:12,hitMod:3,tier:2, dotChance:0.25, dotType:'poison'}),
  chief: ()=>({name:'Chef Bandit',hp:24,maxHp:24,ac:14,hitMod:5,tier:3, dotChance:0.3, dotType:'bleed'})
};

// === Boss & comportement spécial ===
function combatBoss(){
  const boss=mobs.chief();
  write('🥷 Tu t’infiltres dans la planque du Chef Bandit.','warn');
  combat(boss);
  // Rage à mi-vie
  const _enemyAttack = enemyAttack;
  enemyAttack = function(){
    if(state.enemy && state.enemy.name==='Chef Bandit' && state.enemy.hp<=state.enemy.maxHp/2 && !state.enemy.enraged){
      state.enemy.enraged=true; state.enemy.hitMod+=1; write('🔥 Le Chef Bandit entre en rage !','warn');
    }
    _enemyAttack();
  }
}

// === Fins (selon réputation) ===
function ending(){
  clearChoices();
  if(state.rep>=30){ write('<b>Fin héroïque :</b> Mirval te salue comme un sauveur.','good'); state.achievements.hero=true }
  else if(state.rep<=-30){ write('<b>Fin sombre :</b> ta légende glace le sang des voyageurs.','bad'); state.achievements.villain=true }
  else { write('<b>Fin neutre :</b> tu quittes la forêt, plus sage qu’avant.','info') }
  addChoice('Rejouer (New Game+)', ()=>{
    localStorage.removeItem('mirval.save'); 
    const st=initialState(); 
    st.attrs.STR++; st.attrs.AGI++; st.attrs.WIS++; 
    state=st; ui.log.innerHTML=''; setup(true); 
  }, true);
  addChoice('Quitter', ()=>write('Merci d’avoir joué !'));
}
// === Choix de classe & compétences ===
function chooseClass(){
  clearChoices();
  write('Choisis ta classe :','info');

  // Chaque choix initialise la classe + une compétence (cooldown géré ailleurs)
  addChoice('🛡️ Guerrier', ()=>{
    state.cls='Guerrier'; 
    state.attrs.STR=3;
    state.skill={
      name:'Frappe vaillante', cooldown:3, cd:0, desc:'Attaque puissante',
      use:(e)=>{ 
        const dmg=rng.between(2,6)+rng.between(2,6)+state.level; 
        e.hp-=dmg; 
        write(`💥 Frappe vaillante : -${dmg} PV`,'good');
      }
    };
    startAdventure();
  }, true);

  addChoice('🗡️ Voleur', ()=>{
    state.cls='Voleur'; 
    state.attrs.AGI=3;
    state.skill={
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
    };
    startAdventure();
  });

  addChoice('⚕️ Paladin', ()=>{
    state.cls='Paladin'; 
    state.attrs.WIS=2;
    state.skill={
      name:'Lumière', cooldown:3, cd:0, desc:'Soigne',
      use:()=>{ heal(rng.between(3,8)+state.level); }
    };
    startAdventure();
  });

  addChoice('🏹 Rôdeur', ()=>{
    state.cls='Rôdeur'; 
    state.attrs.AGI=3;
    state.skill={
      name:'Tir précis', cooldown:2, cd:0, desc:'Jet +6, 1d8 dégâts',
      use:(e)=>{
        const r=d20(6).total; 
        if(r>=e.ac){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🏹 Tir précis : -${dmg} PV`,'good') }
        else write('Tir manqué.','warn');
      }
    };
    startAdventure();
  });

  addChoice('🔮 Mystique', ()=>{
    state.cls='Mystique'; 
    state.attrs.WIS=3;
    state.skill={
      name:'Onde arcanique', cooldown:3, cd:0, desc:'1d8 & vulnérabilité',
      use:(e)=>{
        const dmg=rng.between(3,8); 
        e.hp-=dmg; 
        e.dotChance=Math.min(0.6,(e.dotChance||0)+0.15); 
        write(`🔮 Onde arcanique : -${dmg} PV`,'good');
      }
    };
    startAdventure();
  });
}

// === État initial de la partie ===
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
      {name:"Vieille épée", desc:"+1 attaque"},
      {name:"Petite armure", desc:"+1 armure"}
    ],
    potions:1,
    status:[],
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
    achievements:{},
    lastLabels:[],
    inCombat:false,
    enemy:null,
    skill:{name:"", cooldown:0, cd:0, desc:"", use:()=>{}}
  };
}

// === Démarrage / reprise ===
let state = (load()||initialState());

function setup(isNew=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();

  if(isNew || ui.log.childElementCount===0){
    write("v9 — Page: play.html — Tu es à la lisière de la forêt de Mirval. Les légendes parlent d'un Chef Bandit et d'antiques fragments.", "sys");
    chooseClass();
    return;
  }
  // Si on a un log existant (partie chargée), on reprend l’exploration
  explore(true);
}

function startAdventure(){
  ui.log.innerHTML="";
  write("L'aventure commence !", "info");
  setStats();
  explore(true);
}

// Quand le héros meurt
function gameOver(){
  state.inCombat=false;
  write("<b>☠️ Tu t'effondres… La forêt de Mirval se referme sur ton destin.</b>","bad");
  localStorage.removeItem('mirval.save');
  clearChoices();
  addChoice("Recommencer", ()=>{ state=initialState(); ui.log.innerHTML=""; setup(true); }, true);
}

// Petite qualité de vie : décale le cooldown de compétence à chaque exploration
const _explore = explore;
explore = function(...args){
  if(state.skill && typeof state.skill.cd==='number'){
    state.skill.cd = Math.max(0, state.skill.cd-1);
  }
  _explore(...args);
};

// === PWA : enregistrement du service worker ===
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js') );
}

// === Lancer le jeu ===
setup(true);
