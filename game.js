// === Aventurier de Mirval — game.js (v10 complet, combats/PNJ réparés) ===
console.log("game.js v10 chargé");

// ---------- Garder l’écran éveillé ----------
let wakeLock;
async function keepAwake(){ try{ wakeLock = await navigator.wakeLock.request('screen'); } catch(e){} }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && 'wakeLock' in navigator) keepAwake(); });
if('wakeLock' in navigator) keepAwake();

// ---------- RNG ----------
const rng = (() => {
  const seed = (crypto.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]^Date.now():Date.now())>>>0;
  let s = seed>>>0;
  function rand(){ s^=s<<13; s>>>=0; s^=s>>17; s>>>=0; s^=s<<5; s>>>=0; return (s>>>0)/0xFFFFFFFF; }
  function between(min,max){ return Math.floor(rand()*(max-min+1))+min; }
  return {rand, between, seed};
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
  aFOR: document.getElementById('a-str'),
  aAGI: document.getElementById('a-agi'),
  aSAG: document.getElementById('a-wis'),
  rep: document.getElementById('rep'),
  repLabel: document.getElementById('rep-label'),
  quests: document.getElementById('quests'),
};

// ---------- UI helpers ----------
function write(text, cls=""){ const p=document.createElement('p'); if(cls) p.classList.add(cls); p.innerHTML=text; ui.log.appendChild(p); ui.log.scrollTop=ui.log.scrollHeight; }
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

// ---------- Équipement & stats effectives ----------
function totalMod(key){ return (state.inventory||[]).reduce((a,it)=>a+(it.mods&&it.mods[key]||0),0); }
function effFOR(){ return state.attrs.FOR + totalMod('FOR'); }
function effAGI(){ return state.attrs.AGI + totalMod('AGI'); }
function effSAG(){ return state.attrs.SAG + totalMod('SAG'); }
function effDEF(){ return totalMod('DEF') + (hasItem('Bouclier en fer')?2:0) + (hasItem('Bouclier en bois')?1:0); }

// ---------- Affichage ----------
function setStats(){
  ui.hp.textContent = state.hp; ui.hpmax.textContent = state.hpMax;
  ui.hpbar.style.width = Math.max(0,Math.min(100,Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent = state.gold; ui.lvl.textContent = state.level; ui.xp.textContent = state.xp;
  ui.status.textContent = state.status.length? state.status.map(s=>s.name).join(', ') : '—';
  ui.pclass.textContent = state.cls; ui.pname.textContent = state.name;
  ui.aFOR.textContent = effFOR(); ui.aAGI.textContent = effAGI(); ui.aSAG.textContent = effSAG();
  ui.rep.textContent = state.rep; ui.repLabel.textContent = repText(state.rep);

  ui.inv.innerHTML="";
  state.inventory.forEach(it=>{
    const d=document.createElement('div'); d.className='stat';
    const mods = it.mods ? Object.entries(it.mods).map(([k,v])=>`${v>0?'+':''}${v} ${k}`).join(', ') : '';
    d.innerHTML = `<b>${it.name}</b><span>${it.desc}${mods?` — ${mods}`:''}</span>`;
    ui.inv.appendChild(d);
  });

  ui.quests.innerHTML='';
  const mq=document.createElement('div'); mq.className='stat'; mq.innerHTML=`<b>${state.quests.main.title}</b><span>${state.quests.main.state}</span>`; ui.quests.appendChild(mq);
  const aq=document.createElement('div'); aq.className='stat'; aq.innerHTML=`<b>Fragments d’artefact (${state.flags.fragments}/3)</b><span>${state.quests.artifacts.state}</span>`; ui.quests.appendChild(aq);
  state.quests.side.forEach(q=>{ const x=document.createElement('div'); x.className='stat'; x.innerHTML=`<b>${q.title}</b><span>${q.state}</span>`; ui.quests.appendChild(x); });
}

// ---------- Core helpers ----------
function d20(mod=0){ const r=rng.between(1,20); const t=r+mod; ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${r} = ${t}`; return {roll:r,total:t}; }
function heal(n){ state.hp=Math.min(state.hpMax,state.hp+n); setStats(); write(`+${n} PV`,'good'); }
function damage(n,src=""){ state.hp=Math.max(0,state.hp-n); setStats(); write(`-${n} PV ${src?`(${src})`:''}`,'bad'); if(state.hp<=0){ gameOver(); return true; } return false; }
function changeGold(n){ state.gold=Math.max(0,state.gold+n); setStats(); write(`Or ${n>=0?'+':''}${n}`,(n>=0)?'good':'warn'); }
function gainXP(n){ state.xp+=n; const need=20+(state.level-1)*15; write(`XP +${n} (total ${state.xp}/${need})`,'info'); if(state.xp>=need){ state.level++; state.xp=0; state.hpMax+=5; state.hp=state.hpMax; write(`<b>Niveau ${state.level} !</b> PV max +5, PV restaurés.`,'good'); } setStats(); }
function addItem(name,desc,mods={},value=4){ state.inventory.push({name,desc,mods,value}); setStats(); write(`Tu obtiens <b>${name}</b>.`,'good'); }
function hasItem(name){ return state.inventory.some(i=>i.name===name); }
function removeItem(name){ const i=state.inventory.findIndex(x=>x.name===name); if(i>=0) state.inventory.splice(i,1); setStats(); }
function rep(n){ state.rep+=n; setStats(); }

// ---------- Statuts récurrents ----------
function tickStatus(){
  state.status = state.status.filter(st=>{
    if(st.type==='poison'){ const d=rng.between(1,2); damage(d,'Poison'); st.dur--; }
    if(st.type==='bleed'){ const d=2; damage(d,'Saignement'); st.dur--; }
    if(st.type==='slow'){ st.dur--; if(st.dur===0) write('💨 Tu te sens plus léger.','info'); }
    return st.dur>0 && state.hp>0;
  });
}

// ---------- Combat ----------
function playerAtkMod(){ let m=0; if(state.cls==='Guerrier') m+=2; if(effFOR()>=3) m+=1; if(hasItem('Épée affûtée')) m+=1; return m; }
function playerDef(){ return 10 + (state.cls==='Paladin'?1:0) + (effAGI()>=3?1:0) + effDEF(); }
function terrainPenalty(){ return state.locationKey==='marais' ? -1 : 0; }

function combat(mon){
  clearChoices();
  state.inCombat=true;
  state.enemy=JSON.parse(JSON.stringify(mon));
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
    enemyAttack(); 
    combatTurn(); // ✅ important
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
  if(r<0.18 && !hasItem('Épée affûtée')) addItem('Épée affûtée','Lame affûtée',{FOR:+1},6);
  else if(r<0.30 && !hasItem('Bouclier en bois')) addItem('Bouclier en bois','Planche solide',{DEF:+1},5);
  else if(r<0.42) { state.potions++; write('Tu trouves une potion.','good'); }
  else if(r<0.50 && !hasItem('Cuir renforcé')) addItem('Cuir renforcé','Cuir robuste',{DEF:+2},8);

  const pFrag = state.locationKey==='ruines' ? 0.18 : 0.08;
  if(state.flags.fragments<3 && rng.rand()<pFrag){
    state.flags.fragments++;
    write(`✨ Fragment d’artefact trouvé (${state.flags.fragments}/3) !`,'good');
    if(state.flags.fragments===3){ state.flags.grottoUnlocked=true; write('Tu pressens un écho dans la grotte…','info'); }
  }

  if(e.name.includes('Bandit')){
    state.flags.rumors = (state.flags.rumors||0)+1;
    if(state.flags.rumors>=3 && !state.flags.bossBanditUnlocked){ state.flags.bossBanditUnlocked = true; write('🗡️ Tu apprends la cache du Chef Bandit.','info'); }
  }
  state.noEncounterStreak = 0;
  explore();
}

// ---------- Bestiaire ----------
const mobs = {
  wolf: ()=>({ name:'Loup affamé', hp:10, maxHp:10, ac:11, hitMod:2, tier:1 }),
  bandit: ()=>({ name:'Bandit des fourrés', hp:12, maxHp:12, ac:12, hitMod:3, tier:2, dotChance:0.1, dotType:'bleed' }),
  boar:  ()=>({ name:'Sanglier irascible', hp:11, maxHp:11, ac:11, hitMod:2, tier:1, dotChance:0.05, dotType:'bleed' }),
  harpy: ()=>({ name:'Harpie du vent', hp:14, maxHp:14, ac:13, hitMod:4, tier:2, dotChance:0.2, dotType:'bleed' }),
  ghoul: ()=>({ name:'Goule des roseaux', hp:13, maxHp:13, ac:12, hitMod:3, tier:2, dotChance:0.25, dotType:'poison' }),
  ancientGhoul: ()=>({ name:'Goule ancienne', hp:18, maxHp:18, ac:13, hitMod:5, tier:3, dotChance:0.35, dotType:'poison' }),
  chief: ()=>({ name:'Chef Bandit', hp:26, maxHp:26, ac:14, hitMod:5, tier:3, dotChance:0.3, dotType:'bleed' }),
  marshWitch: ()=>({ name:'Sorcière du Marais', hp:22, maxHp:22, ac:13, hitMod:5, tier:3, dotChance:0.35, dotType:'poison' }),
  forestSpirit: ()=>({ name:'Esprit de la Forêt', hp:24, maxHp:24, ac:14, hitMod:5, tier:3 }),
  ruinLord: ()=>({ name:'Seigneur des Ruines', hp:28, maxHp:28, ac:15, hitMod:6, tier:4 })
};

// ---------- Boss ----------
function combatBossBandit(){ write('🥷 Tu t’infiltres dans la planque du Chef Bandit.','warn'); combat(mobs.chief()); }
function combatMarshWitch(){ write('🧹 Les eaux noires bouillonnent… La Sorcière surgit !','warn'); combat(mobs.marshWitch()); }
function combatForestSpirit(){ write('🌲 Le vent murmure ; l’Esprit se manifeste.','warn'); combat(mobs.forestSpirit()); }
function combatRuinLord(){ write('🗿 Les pierres vibrent… le Seigneur des Ruines s’éveille.','warn'); combat(mobs.ruinLord()); }

// ---------- Exploration ----------
function setTime(){
  const slots=['Aube','Matin','Midi','Après-midi','Crépuscule','Nuit'];
  const i=slots.indexOf(state.time); let n=(i+1)%slots.length; if(n===0) state.day++;
  state.time=slots[n]; ui.day.textContent=`Jour ${state.day} — ${state.time}`;
}
function continueBtn(){ clearChoices(); addChoice('Continuer', ()=>explore(), true); }
function gotoZone(key){
  state.locationKey=key;
  state.location = key==='marais'?"Marais de Vire-Saule": key==='clairiere'?"Clairière des Lys": key==='colline'?"Colline de Rocfauve": key==='ruines'?"Ruines Oubliées": key==='grotte'?"Grotte Sépulcrale":"Lisière";
  write(`👉 Tu te diriges vers ${state.location}.`,'sys'); explore(true);
}
function pickWeighted(items, k){
  const recent = new Set(state.lastLabels);
  let pool = items.flatMap(it=>Array((it.w||1)).fill(it)).filter(it=>!recent.has(it.label));
  if(pool.length<k) pool = items.flatMap(it=>Array((it.w||1)).fill(it));
  const out=[]; for(let i=0;i<k && pool.length;i++){ const idx=Math.floor(rng.rand()*pool.length); out.push(pool[idx]); pool.splice(idx,1); }
  state.lastLabels = [...out.map(o=>o.label), ...state.lastLabels].slice(0,8);
  return out;
}

// Actions génériques + rencontres
function searchArea(){
  const bonus = effSAG()>=3?1:0;
  const {total}=d20(bonus);
  if(total>=18){ write('🔑 Coffre scellé repéré.','good'); chest(); state.noEncounterStreak=0; }
  else if(total>=12){ write('✨ Quelques pièces sous une pierre.','good'); changeGold(rng.between(2,6)); state.noEncounterStreak++; }
  else if(total>=8){ write('Des traces fraîches… une rencontre approche.'); randomEncounter(); }
  else { write('Aïe ! Ronce traîtresse.','bad'); damage(rng.between(1,3),'Ronces'); state.noEncounterStreak++; }
  continueBtn();
}
function rest(){
  if(rng.rand()<0.35){ write('Quelque chose approche pendant ton repos…','warn'); randomEncounter(); }
  else { heal(rng.between(4,8)); write('Tu dors un peu. Ça fait du bien.','good'); state.noEncounterStreak++; }
  continueBtn();
}
function useItemMenu(){
  clearChoices();
  addChoice(`Boire une potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Tu n'as pas de potion.",'warn'); return continueBtn(); }
    state.potions--; heal(rng.between(8,12)); state.noEncounterStreak++; continueBtn();
  }, true);
  addChoice('Annuler', ()=>{ state.noEncounterStreak++; explore(); });
}
function chest(){
  const r=rng.between(1,100);
  if(r>90){ addItem('Bouclier en fer','Bouclier solide',{DEF:+2},9); }
  else if(r>70){ state.potions++; write('Tu trouves une potion.','good'); }
  else if(r>40){ changeGold(rng.between(7,15)); }
  else { write('💥 Piège !','bad'); damage(rng.between(3,6),'Piège'); }
}
function randomEncounter(){
  // 50% combat vs 50% PNJ/événements
  if(rng.rand()<0.5){
    const zone=state.locationKey;
    if(zone==='marais') combat(mobs.ghoul());
    else if(zone==='clairiere') combat(mobs.bandit());
    else if(zone==='ruines') combat(mobs.bandit());
    else combat(mobs.harpy());
  }else{
    [eventSanctuary,eventHerbalist,eventSmith,eventHermit,eventTrader,eventOldMap][rng.between(0,5)]();
  }
  state.noEncounterStreak=0;
}

// PNJ & Événements
function eventHerbalist(){
  write('🌿 Une herboriste te fait signe. Parfum de menthe.');
  clearChoices();
  addChoice('S’approcher', ()=>{
    if(state.rep<-20){ write("Elle se détourne : 'Je ne sers pas les cruels.'",'warn'); rep(-1); return continueBtn(); }
    const cost=(state.rep>20?2:3);
    if(state.gold>=cost){ changeGold(-cost); heal(rng.between(6,12)); state.flags.metHerbalist=true; write('La tisane t’apaise.','good'); }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  }, true);
  addChoice('Potion (4 or)', ()=>{
    if(state.gold>=4){ changeGold(-4); state.potions++; write("Tu obtiens une potion.",'good'); }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  });
  addChoice('Partir', continueBtn);
}
function eventSmith(){
  write('⚒️ Un forgeron itinérant tape sur une enclume portative.');
  clearChoices();
  addChoice('Améliorer ton arme (6 or)', ()=>{
    if(state.gold>=6){ changeGold(-6); addItem('Épée affûtée','Lame affûtée',{FOR:+1},6); }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  }, true);
  addChoice('Bouclier en fer (8 or)', ()=>{
    if(state.gold>=8){ changeGold(-8); addItem('Bouclier en fer','Acier cabossé',{DEF:+2},8); }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  });
  addChoice('Discuter (Réputation +1)', ()=>{ rep(+1); write("Il t’indique des sentiers sûrs.",'info'); continueBtn(); });
}
function eventTrader(){
  write('🧳 Un colporteur déroule son tapis. "Tout a un prix."');
  clearChoices();
  addChoice('Torche (5 or)', ()=>{
    if(state.gold>=5){ changeGold(-5); state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte',{},2); write('Tu obtiens une torche.','good'); }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  }, true);
  addChoice('Vendre un objet', ()=> sellMenu());
  addChoice('Partir', continueBtn);
}
function sellMenu(){
  clearChoices();
  const vendables = state.inventory.filter(it=>!['Torche ancienne','Fragment d’artefact'].includes(it.name));
  if(vendables.length===0){ write("Tu n’as rien à vendre.",'info'); return continueBtn(); }
  vendables.forEach(it=>{
    const price = Math.max(1, Math.floor((it.value||4)/2));
    addChoice(`Vendre ${it.name} (${price} or)`, ()=>{ removeItem(it.name); changeGold(price); write(`Tu vends ${it.name}.`,'good'); sellMenu(); });
  });
  addChoice('Terminer', continueBtn, true);
}
function eventBard(){
  write('🎻 Un barde sourit : "Une chanson contre deux pièces ?"');
  clearChoices();
  addChoice('Écouter (2 or)', ()=>{
    if(state.gold>=2){ changeGold(-2); if(rng.rand()<0.7){ heal(rng.between(3,7)); write('La mélodie t’apaise.','good'); } else write('Belle chanson… mais chère.','info'); }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  }, true);
  addChoice('L’ignorer', continueBtn);
}
function eventRuins(){
  write('🏚️ Des ruines englouties de lierre se dressent.');
  clearChoices();
  addChoice('Fouiller', ()=>{
    const {total}=d20(effSAG()>=3?1:0);
    if(total>=16){
      if(!state.flags.torch){ state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte',{},2); write('Tu trouves une torche.','good'); }
      else if(state.flags.fragments<3){ state.flags.fragments++; write(`Tu trouves un fragment d’artefact (${state.flags.fragments}/3).`,'good'); if(state.flags.fragments===3) state.flags.grottoUnlocked=true; }
      else changeGold(rng.between(4,9));
    } else if(total>=10){ chest(); }
    else { damage(rng.between(2,5),'Éboulement'); }
    continueBtn();
  }, true);
  addChoice('Partir', continueBtn);
}
function eventPeasant(){
  write('🧑‍🌾 Un paysan enchaîné appelle à l’aide.');
  clearChoices();
  addChoice('Le libérer', ()=>{
    const {total}=d20(effFOR()>=3?2:0);
    if(total>=14){ write('Les chaînes cèdent.','good'); rep(+5); state.flags.peasantSaved=true; state.quests.side.push({title:'Le paysan reconnaissant',state:'En attente'}); }
    else damage(rng.between(1,4),'Effort');
    continueBtn();
  }, true);
  addChoice('L’ignorer', ()=>{ rep(-3); continueBtn(); });
}
function eventSanctuary(){
  write('⛪ Un ancien sanctuaire, couvert de mousse.');
  clearChoices();
  addChoice('Prier', ()=>{
    const night=(state.time==='Nuit'||state.time==='Crépuscule');
    const {total}=d20(); const t=total+(night?1:0);
    if(t>=15){ heal(rng.between(6,12)); rep(+2); state.flags.sanctuaryFavor=true; }
    else { damage(rng.between(2,6),'Présage'); rep(-1); }
    continueBtn();
  }, true);
  addChoice('Désacraliser', ()=>{
    const {total}=d20(-1);
    if(total>=16){ changeGold(rng.between(8,16)); rep(-3); }
    else { damage(rng.between(4,7),'Malédiction'); rep(-5); }
    continueBtn();
  });
  addChoice('Partir', continueBtn);
}
function eventHermit(){
  write('🧙 Un ermite t’observe au détour d’un sentier.');
  clearChoices();
  addChoice('Accepter sa décoction', ()=>{
    if(rng.rand()<0.6){ heal(rng.between(5,10)); gainXP(3); }
    else damage(rng.between(2,5),'Nausée');
    continueBtn();
  }, true);
  addChoice('Breloque (5 or)', ()=>{
    if(state.gold>=5){ changeGold(-5); addItem("Breloque d'ermite","10% chance d’annuler un mal",{},5); state.flags.charm=1; }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  });
  addChoice('Refuser', continueBtn);
}
function eventOldMap(){
  if(state.flags.mapFound){ write('Une vieille souche… rien.'); return continueBtn(); }
  write('🗺️ Sous une pierre, une vieille carte griffonnée !','info');
  clearChoices();
  addChoice('Étudier la carte', ()=>{ state.flags.mapFound=true; state.flags.ruinsUnlocked=true; write('Les Ruines Oubliées sont indiquées…','good'); continueBtn(); }, true);
  addChoice('Laisser', continueBtn);
}
function eventTrap(){ write('🪤 Une corde s’enroule à ta cheville !'); const {total}=d20(effAGI()>=3?2:0); if(total>=13) write('Tu t’en sors de justesse.','good'); else damage(rng.between(2,5),'Piège'); }

// ---------- Exploration principale ----------
function explore(initial=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();
  if(!initial) setTime();
  tickStatus(); if(state.hp<=0) return;

  if(state.day>=5 && !state.flags.oracleSeen){ eventOracle(); return; }

  const zone = state.locationKey;

  const base = [
    { label:"Fouiller", act:searchArea, w:2 },
    { label:"Se reposer", act:rest, w:1 },
    { label:"Utiliser un objet", act:useItemMenu, w:1 },
    { label:"Rencontre immédiate", act:randomEncounter, w:2 }
  ];

  let pool=[];
  if(zone==='marais'){
    pool.push({label:'Suivre des feux-follets', act:eventSanctuary, w:2});
    pool.push({label:'Aider un captif', act:()=>{ if(!state.flags.peasantSaved) eventPeasant(); else { write('La berge est silencieuse.'); continueBtn(); } }, w:1});
    pool.push({label:'Traquer une goule', act:()=>combat(mobs.ghoul()), w:4});
    pool.push({label:'Affronter un loup', act:()=>combat(mobs.wolf()), w:3});
    pool.push({label:'Tomber sur un piège', act:()=>{ eventTrap(); continueBtn(); }, w:1});
    if(state.flags.fragments===3 && (state.time==='Crépuscule'||state.time==='Nuit')) pool.push({label:'Affronter la Sorcière du Marais', act:combatMarshWitch, w:2});
  }
  else if(zone==='clairiere'){
    pool.push({label:'Croiser une herboriste', act:eventHerbalist, w:3});
    pool.push({label:'Écouter un barde', act:eventBard, w:2});
    pool.push({label:'Chasser un sanglier', act:()=>combat(mobs.boar()), w:3});
    pool.push({label:'Autel moussu', act:eventSanctuary, w:2});
    pool.push({label:'Bandits embusqués', act:()=>combat(mobs.bandit()), w:4});
    pool.push({label:'Forgeron itinérant', act:eventSmith, w:2});
    pool.push({label:'Marchand ambulant', act:eventTrader, w:2});
    if(state.rep>=10 && state.flags.sanctuaryFavor) pool.push({label:'Sentier sacré (Esprit de la Forêt)', act:combatForestSpirit, w:1});
  }
  else if(zone==='colline'){
    pool.push({label:'Rencontrer un ermite', act:eventHermit, w:2});
    pool.push({label:'Explorer des ruines', act:eventRuins, w:3});
    pool.push({label:'Affronter une harpie', act:()=>combat(mobs.harpy()), w:4});
    pool.push({label:'Ancienne carte', act:eventOldMap, w:1});
    pool.push({label:'Croiser un forgeron', act:eventSmith, w:1});
  }
  else if(zone==='ruines'){
    pool.push({label:'Fouiller les décombres', act:eventRuins, w:4});
    pool.push({label:'Esquiver un éboulement', act:()=>{ damage(rng.between(1,4),'Éboulement'); continueBtn(); }, w:1});
    pool.push({label:'Combattre des bandits', act:()=>combat(mobs.bandit()), w:4});
    if(state.day>=6 && state.flags.torch) pool.push({label:'Salle scellée (Seigneur des Ruines)', act:combatRuinLord, w:2});
  }
  else if(zone==='grotte'){
    pool.push({label:'Combattre une goule ancienne', act:()=>combat(mobs.ancientGhoul()), w:4});
    pool.push({label:'Échos inquiétants', act:()=>{ const r=d20().total; if(r<10) damage(3,'Stalactite'); else write('Rien ne se passe.'); continueBtn(); }, w:1});
  }

  if(state.flags.bossBanditUnlocked) pool.push({label:'Traquer le Chef Bandit', act:combatBossBandit, w:2});

  const nav=[
    {label:'→ Marais', act:()=>gotoZone('marais'), w:1},
    {label:'→ Clairière', act:()=>gotoZone('clairiere'), w:1},
    {label:'→ Colline', act:()=>gotoZone('colline'), w:1},
    {label:'→ Ruines', act:()=>gotoZone('ruines'), w: state.flags.ruinsUnlocked?1:0},
    {label:'→ Grotte', act:()=> state.flags.torch? gotoZone('grotte') : (write('Il fait trop sombre pour entrer.','warn'), continueBtn()), w:1}
  ].filter(x=>x.w>0);

  // Tirage
  const dyn = pickWeighted(pool, Math.min(3,pool.length));
  const candidates = [...base, ...dyn, ...nav];
  const shown = pickWeighted(candidates, Math.min(5, candidates.length));

  // Assurer AU MOINS une rencontre dynamique visible
  const dynLabels = new Set(dyn.map(d=>d.label));
  if(!shown.some(s=>dynLabels.has(s.label)) && dyn.length>0) shown[0] = dyn[0];

  shown.forEach((c,i)=> addChoice(c.label, c.act, i===0));

  state.noEncounterStreak++;
}

// ---------- Oracle & fins ----------
function eventOracle(){
  write('🔮 Une voyante apparaît dans tes rêves.'); 
  clearChoices();
  addChoice('Écouter la prophétie', ()=>{ write('“Quand trois éclats seront réunis, la porte s’ouvrira. Là où l’eau chante, le noir recule.”','info'); state.flags.oracleSeen=true; continueBtn(); }, true);
}
function ending(){
  clearChoices();
  if(state.rep>=30){ write('<b>Fin héroïque :</b> Mirval te salue comme un sauveur.','good'); }
  else if(state.rep<=-30){ write('<b>Fin sombre :</b> ta légende glace le sang des voyageurs.','bad'); }
  else write('<b>Fin neutre :</b> tu quittes la forêt, plus sage qu’avant.','info');
  addChoice('Rejouer (New Game+)', ()=>{ const st=initialState(); st.attrs.FOR++; st.attrs.AGI++; st.attrs.SAG++; state=st; ui.log.innerHTML=''; setup(true); }, true);
}

// ---------- Choix de classe ----------
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

// ---------- État initial ----------
function initialState(){
  return {
    name:'Eldarion', cls:'—',
    attrs:{FOR:1,AGI:1,SAG:1},
    hp:22, hpMax:22, gold:12,
    level:1, xp:0, rep:0,
    day:1, time:'Aube',
    location:'Lisière de la forêt de Mirval',
    locationKey:'clairiere',
    inventory:[
      {name:'Vieille épée', desc:'+1 attaque', mods:{FOR:+1}, value:4},
      {name:'Veste matelassée', desc:'+1 défense', mods:{DEF:+1}, value:4}
    ],
    potions:1, status:[],
    flags:{
      metHerbalist:false,metSmith:false,peasantSaved:false,
      fragments:0,bossBanditUnlocked:false,torch:false,oracleSeen:false,
      ruinsUnlocked:true,grottoUnlocked:false,rumors:0,charm:0,sanctuaryFavor:false,
      mapFound:false
    },
    quests:{ main:{title:'Le Chef Bandit',state:'En cours'}, side:[], artifacts:{title:'Fragments d’artefact (0/3)',state:'En cours'} },
    achievements:{}, lastLabels:[],
    inCombat:false, enemy:null, skill:{name:'',cooldown:0,cd:0,desc:'',use:()=>{}},
    noEncounterStreak: 0
  };
}
let state = initialState();

// ---------- Setup ----------
function setup(isNew=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();

  if (isNew){
    write('v10 — Nouvelle partie : choisis ta classe.','sys');
    chooseClass(); return;
  }
  const classes=['Guerrier','Voleur','Paladin','Rôdeur','Mystique'];
  if(!state.cls || state.cls==='—' || !classes.includes(state.cls)){
    write('v10 — Choisis ta classe pour commencer.','sys'); chooseClass(); return;
  }
  explore(true);
}
function startAdventure(){ ui.log.innerHTML=''; write("L'aventure commence !",'info'); setStats(); explore(true); }
function gameOver(){ state.inCombat=false; write('<b>☠️ Tu t’effondres… La forêt de Mirval se referme sur ton destin.</b>','bad'); clearChoices(); addChoice('♻️ Recommencer',()=>{ state=initialState(); ui.log.innerHTML=''; setup(true); }, true); }

// ---------- Cooldown compétence à chaque exploration ----------
const __explore = explore;
explore = function(...args){ if(state.skill && typeof state.skill.cd==='number'){ state.skill.cd = Math.max(0, state.skill.cd-1); } __explore(...args); };

// ---------- Recommencer ----------
const resetBtn=document.getElementById('btn-reset');
if(resetBtn) resetBtn.addEventListener('click', ()=>{ state=initialState(); ui.log.innerHTML=''; setup(true); });

// ---------- Boot ----------
(function boot(){ if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',()=>setup(true),{once:true}); } else setup(true); })();
