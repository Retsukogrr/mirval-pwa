// === Aventurier de Mirval — game.js (v10 complet, sans sauvegarde/chargement) ===
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
  quests: document.getElementById('quests'),
};

// ---------- Utilitaires UI ----------
function write(text, cls=""){
  const p=document.createElement('p');
  if(cls) p.classList.add(cls);
  p.innerHTML=text;
  ui.log.appendChild(p);
  ui.log.scrollTop=ui.log.scrollHeight;
}
function clearChoices(){ ui.choices.innerHTML=""; }

function disableAllChoices(){ ui.choices.querySelectorAll('button').forEach(b=>b.disabled=true); }
function normalizeChoices(){
  const seen=new Set();
  [...ui.choices.querySelectorAll('button')].forEach(b=>{
    const key=b.textContent.trim();
    if(key==='Continuer'){
      if(seen.has('Continuer')) b.remove(); else seen.add('Continuer');
      return;
    }
    if(seen.has(key)) b.remove(); else seen.add(key);
  });
}
let _actionSerial=0;
function addChoice(label, handler, primary=false){
  const btn=document.createElement('button');
  if(primary) btn.classList.add('btn-primary');
  btn.textContent = label;
  const id=++_actionSerial;
  btn.addEventListener('click', ()=>{
    if(btn.disabled) return;
    disableAllChoices();             // anti double-tap
    try{ handler(); }
    catch(e){ console.error(e); write("Erreur : "+e.message,"bad"); continueBtn(); }
  }, { once:true });                  // une seule exécution
  ui.choices.appendChild(btn);
  normalizeChoices();
}
function continueBtn(next=()=>explore()){
  // Supprime tous les “Continuer” existants puis ajoute un seul
  [...ui.choices.querySelectorAll('button')]
    .filter(b=>b.textContent.trim()==='Continuer').forEach(b=>b.remove());
  addChoice("Continuer", next, true);
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
    const d=document.createElement('div'); d.className='stat';
    d.innerHTML = `<b>${it.name}</b><span>${it.desc}</span>`;
    ui.inv.appendChild(d);
  });

  // Quêtes
  ui.quests.innerHTML='';
  const mq=document.createElement('div'); mq.className='stat';
  mq.innerHTML=`<b>${state.quests.main.title}</b><span>${state.quests.main.state}</span>`;
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
function d20(mod=0){ const roll=rng.between(1,20); const total=roll+mod; if(ui.lastRoll) ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${roll} = ${total}`; return {roll,total}; }
function heal(n){ state.hp=Math.min(state.hpMax,state.hp+n); setStats(); write(`+${n} PV`, "good"); }
function damage(n,src=""){ state.hp=Math.max(0,state.hp-n); setStats(); write(`-${n} PV ${src?`(${src})`:''}`, "bad"); if(state.hp<=0){ gameOver(); return true; } return false; }
function changeGold(n){ state.gold=Math.max(0,state.gold+n); setStats(); write(`Or ${n>=0?'+':''}${n} (total: ${state.gold})`, n>=0?"good":"warn"); }
function gainXP(n){
  state.xp+=n; write(`XP +${n} (total ${state.xp})`,"info");
  const need=20+(state.level-1)*15;
  if(state.xp>=need){ state.level++; state.xp=0; state.hpMax+=5; state.hp=state.hpMax; write(`<b>Niveau ${state.level} !</b> PV max +5, PV restaurés.`,"good"); }
  setStats();
}
function addItem(name,desc){ if(!hasItem(name)){ state.inventory.push({name,desc}); setStats(); write(`Tu obtiens <b>${name}</b>.`,"good"); } }
function hasItem(name){ return state.inventory.some(i=>i.name===name); }
function removeItem(name){ const i=state.inventory.findIndex(x=>x.name===name); if(i>=0) state.inventory.splice(i,1); setStats(); }
function repText(n){return n>=30?'Vertueux':n<=-30?'Sombre':'Neutre'}
function rep(n){ state.rep += n; setStats(); }

// ---------- Cooldowns & quotas jour ----------
function setCooldown(key, days){ state.cooldowns[key] = state.day + days; }
function available(key){ return !state.cooldowns[key] || state.day >= state.cooldowns[key]; }
function dailyDone(key){ return state.daily[key]||0; }
function incDaily(key){ state.daily[key]=(state.daily[key]||0)+1; }
function underDailyCap(key,cap){ return dailyDone(key) < cap; }

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

// ---------- Statuts récurrents ----------
function tickStatus(){
  state.status = state.status.filter(st=>{
    if(st.type==='poison'){ const dmg=rng.between(1,2); damage(dmg,"Poison"); st.dur--; }
    if(st.type==='bleed'){ const dmg=2; damage(dmg,"Saignement"); st.dur--; }
    if(st.type==='slow'){ st.dur--; if(st.dur===0) write('💨 Tu te sens plus léger.','info'); }
    return st.dur>0 && state.hp>0;
  });
}

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
      // Breloque d’ermite : 10% d’annuler poison/saignement
      let apply = true;
      if(state.flags.charm && rng.rand()<0.10){
        apply = false;
        write('✨ Ta breloque scintille et dissipe le mal.','info');
      }
      if(apply){
        if(e.dotType==='poison') state.status.push({type:'poison', name:'Poison', dur:rng.between(2,4)});
        if(e.dotType==='bleed')  state.status.push({type:'bleed',  name:'Saignement', dur:rng.between(2,4)});
        write(`⚠️ ${e.name} inflige ${e.dotType==='poison'?'un poison':'un saignement'} !`,"warn");
      }
    }
  }else write(`${e.name} rate son attaque.`, "info");
  tickStatus();
}
function afterCombat(){
  const e=state.enemy; state.inCombat=false; state.enemy=null;
  const gold=rng.between(e.tier, e.tier*3); const xp=rng.between(e.tier*3, e.tier*6);
  changeGold(gold); gainXP(xp);

  // Drops de fragments par type d’ennemi
  if(e.name.includes("Bandit"))      tryDropFragment("butin des bandits", 0.07);
  if(e.name.includes("Harpie"))      tryDropFragment("plume runique", 0.05);
  if(e.name.includes("Goule"))       tryDropFragment("relique miasmatique", 0.10);
  if(e.name.includes("Ours"))        tryDropFragment("cœur ancien", 0.08);

  // Loot objets (cap 2 / jour)
  const r=rng.rand();
  if(underDailyCap('lootItem',2)){
    if(r<0.18 && !hasItem("Épée affûtée")) { addItem("Épée affûtée","+1 attaque"); incDaily('lootItem'); }
    else if(r<0.30 && !hasItem("Bouclier en bois")) { addItem("Bouclier en bois","+1 armure légère"); incDaily('lootItem'); }
    else if(r<0.38) { state.potions++; write("Tu trouves une potion.","good"); incDaily('lootItem'); }
    else if(r<0.44 && !hasItem("Cuir renforcé")) { addItem("Cuir renforcé","+2 armure souple"); incDaily('lootItem'); }
  }

  if(e.name.includes("Bandit")){
    state.flags.rumors = (state.flags.rumors||0)+1;
    if(state.flags.rumors>=3 && !state.flags.bossUnlocked){ state.flags.bossUnlocked=true; write("🗡️ Tu apprends la cache du Chef Bandit… (événement rare débloqué)","info"); }
  }
  explore();
}

// ---------- Actions générales ----------
function searchArea(){
  if(!underDailyCap('search',4)){ write("Tu es épuisé de fouiller pour aujourd’hui.","warn"); return continueBtn(); }
  const {total}=d20(state.attrs.WIS>=3?1:0);
  if(total>=18){ write("🔑 Recherche exceptionnelle : tu trouves un coffre scellé.","good"); chest(); }
  else if(total>=12){ write("✨ Quelques pièces sous une pierre.","good"); changeGold(rng.between(2,6)); }
  else if(total>=8){ write("Des traces fraîches… une rencontre approche."); if(rng.rand()<0.55) randomEncounter(); }
  else { write("Aïe ! Ronce traîtresse.","bad"); damage(rng.between(1,3),"Ronces"); }
  incDaily('search');
  continueBtn();
}
function rest(){
  if(rng.rand()<0.3){ write("Quelque chose approche pendant ton repos…","warn"); randomEncounter(); }
  else { heal(rng.between(4,8)); write("Tu dors un peu. Ça fait du bien.","good"); }
  continueBtn();
}
function useItemMenu(){
  clearChoices();
  addChoice(`Boire une potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Tu n'as pas de potion.","warn"); return continueBtn(); }
    state.potions--; heal(rng.between(8,12)); continueBtn();
  }, true);
  addChoice("Annuler", ()=>explore());
}
function chest(){
  if(!underDailyCap('chest',2)){ write("Plus de coffres exploitables aujourd’hui.","warn"); return; }
  const r=rng.between(1,100);
  if(r>97){ addItem("Bouclier en fer","+2 armure"); incDaily('chest'); tryDropFragment("fond de coffre gravé", 0.15); }
  else if(r>85){ addItem("Potion de soin","Rest. 8-12 PV"); state.potions++; incDaily('chest'); tryDropFragment("fioles scellées", 0.08); }
  else if(r>55){ changeGold(rng.between(7,15)); incDaily('chest'); tryDropFragment("double fond", 0.06); }
  else { write("💥 Piège !","bad"); damage(rng.between(3,6),"Piège"); }
}
function randomEncounter(){
  const z=state.locationKey;
  const pick = (arr)=> arr[rng.between(0,arr.length-1)];
  if(z==='marais') combat(pick([mobs.ghoul(), mobs.wolf()]));
  else if(z==='clairiere') combat(pick([mobs.bandit(), mobs.boar()]));
  else if(z==='colline') combat(pick([mobs.harpy(), mobs.bandit()]));
  else if(z==='ruines') combat(pick([mobs.bandit(), mobs.harpy()]));
  else if(z==='grotte') combat(pick([{name:'Goule ancienne',hp:18,maxHp:18,ac:13,hitMod:5,tier:3,dotChance:0.35,dotType:'poison'}]));
  else combat(mobs.bandit());
}

// ---------- Événements & PNJ ----------
function eventHerbalist(){
  if(!available('herbalist')){ write("🌿 L’herboriste est déjà repartie aujourd’hui."); return continueBtn(); }
  write("🌿 Une herboriste te fait signe.");
  clearChoices();
  addChoice("S’approcher", ()=>{
    const cost=(state.rep>20?2:3);
    if(state.gold>=cost){ changeGold(-cost); heal(rng.between(6,12)); }
    else write("Pas assez d’or.","warn");
    setCooldown('herbalist', 2);
    continueBtn();
  }, true);
  addChoice("Marchander", ()=>{
    const {total}=d20(state.attrs.WIS>=3?2:0);
    if(total>=15){ heal(rng.between(4,8)); write('À prix d’ami.','good'); }
    else write('Elle refuse.','warn');
    setCooldown('herbalist', 2);
    continueBtn();
  });
  addChoice("Partir", ()=>{ setCooldown('herbalist',1); continueBtn(); });
}

function eventSmith(){
  if(!available('smith')){ write('⚒️ Le forgeron a plié bagage pour la journée.'); return continueBtn(); }
  write('⚒️ Un forgeron itinérant inspecte tes armes.');
  clearChoices();
  addChoice('Améliorer l’épée (5 or)', ()=>{
    if(state.gold>=5 && !hasItem('Épée affûtée')){ changeGold(-5); addItem('Épée affûtée','+1 attaque'); }
    else write("Pas assez d'or ou déjà amélioré.",'warn');
    setCooldown('smith', 2);
    continueBtn();
  }, true);
  addChoice('Bouclier en fer (6 or)', ()=>{
    if(state.gold>=6 && !hasItem('Bouclier en fer')){ changeGold(-6); addItem('Bouclier en fer','+2 armure'); }
    else write("Pas assez d'or ou déjà équipé.",'warn');
    setCooldown('smith', 2);
    continueBtn();
  });
  addChoice('Discuter', ()=>{ gainXP(3); setCooldown('smith',1); continueBtn(); });
}

function eventBard(){
  if(!available('bard')){ write('🎻 Le barde s’est éloigné vers une autre clairière.'); return continueBtn(); }
  write('🎻 Un barde propose une chanson.');
  clearChoices();
  addChoice('Écouter', ()=>{
    if(rng.rand()<0.7){ heal(rng.between(3,7)); } else { changeGold(-2); write('La bourse s’est allégée…','warn'); }
    setCooldown('bard',2);
    continueBtn();
  }, true);
  addChoice('L’ignorer', ()=>{ setCooldown('bard',1); continueBtn(); });
}

function eventRuins(){
  if(!available('ruins')){ write('🏚️ Les ruines sont silencieuses pour l’instant.'); return continueBtn(); }
  write('🏚️ Tu explores des ruines effondrées.');
  clearChoices();
  addChoice('Fouiller', ()=>{
    const hasOil = hasItem("Fiole d’huile");
    const bonus = (state.attrs.WIS>=3?1:0) + (hasOil?1:0);
    const {total}=d20(bonus);
    if(total>=16){
      if(!state.flags.torch){
        state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte');
        write("🔥 Tu trouves une Torche ancienne.", 'good');
      } else {
        tryDropFragment("niche secrète des ruines", 0.35);
        if(rng.rand()<0.35) changeGold(rng.between(5,12));
      }
    } else if(total>=10){
      chest(); // coffre (peut drop fragment)
    } else {
      damage(rng.between(2,5),'Éboulement');
      tryDropFragment("éboulement révélateur", 0.05);
    }
    setCooldown('ruins',2);
    continueBtn();
  }, true);
  addChoice('Partir', ()=>{ setCooldown('ruins',1); continueBtn(); });
}

function eventPeasant(){
  if(state.flags.peasantSaved){ write('🧑‍🌾 Le lieu est calme — le paysan a fui depuis longtemps.'); return continueBtn(); }
  write('🧑‍🌾 Un paysan enchaîné appelle à l’aide.');
  clearChoices();
  addChoice('Le libérer', ()=>{
    const {total}=d20(state.attrs.STR>=3?2:0);
    if(total>=14){ write('Les chaînes cèdent.','good'); rep(+5); state.flags.peasantSaved=true; state.quests.side.push({title:'Le paysan reconnaissant',state:'En attente'}); }
    else { damage(rng.between(1,4),'Effort'); }
    continueBtn();
  }, true);
  addChoice('L’ignorer', ()=>{ rep(-3); continueBtn(); });
}

function eventSanctuary(){
  if(!available('sanctuary')){ write('⛪ Le sanctuaire semble muet pour l’instant.'); return continueBtn(); }
  write('⛪ Un ancien sanctuaire se dévoile.');
  clearChoices();
  addChoice('Prier', ()=>{
    const night = state.time==='Nuit' || state.time==='Crépuscule';
    const {total}=d20(); const t=total+(night?1:0);
    if(t>=15){ heal(rng.between(6,12)); rep(+2); }
    else { damage(rng.between(2,6),'Présage'); rep(-1); }
    setCooldown('sanctuary',2);
    continueBtn();
  }, true);
  addChoice('Désacraliser', ()=>{
    const {total}=d20(-1);
    if(total>=16){ changeGold(rng.between(8,16)); rep(-3); }
    else { damage(rng.between(4,7),'Malédiction'); rep(-5); }
    setCooldown('sanctuary',3);
    continueBtn();
  });
  addChoice('Partir', ()=>{ setCooldown('sanctuary',1); continueBtn(); });
}

function eventMerchant(){
  if(!available('merchant')){ write("🧺 L’étal est fermé aujourd’hui."); return continueBtn(); }
  write("🧺 Un marchand ambulant te vend quelques articles.");
  clearChoices();
  addChoice("Acheter une Torche (3 or)", ()=>{
    if(state.flags.torch){ write("Tu as déjà une torche.","info"); }
    else if(state.gold>=3){ changeGold(-3); state.flags.torch=true; addItem("Torche","Permet d’explorer la grotte"); write("🔥 Torche obtenue.","good"); }
    else write("Pas assez d’or.","warn");
    setCooldown('merchant',1);
    continueBtn();
  }, true);
  addChoice("Huile (1 or)", ()=>{
    if(state.gold>=1){ changeGold(-1); addItem("Fiole d’huile","+20% recherche en grotte"); }
    else write("Pas assez d’or.","warn");
    setCooldown('merchant',1);
    continueBtn();
  });
  addChoice("Carte au trésor (4 or)", ()=>{
    if(!underDailyCap('map',1)){ write("Plus de cartes utiles aujourd’hui.", "warn"); return continueBtn(); }
    if(state.gold>=4){ changeGold(-4); write("🗺️ La carte pointe vers des ruines…", "info"); setCooldown('ruins', 0); incDaily('map'); }
    else write("Pas assez d’or.","warn");
    setCooldown('merchant',2);
    continueBtn();
  });
}

function eventBridge(){
  if(!available('bridge')){ write("🌉 Le pont est inaccessible pour l’instant."); return continueBtn(); }
  write("🌉 Un vieux pont effondré bloque le passage.");
  clearChoices();
  addChoice("Sauter (AGI)", ()=>{
    const r=d20((state.attrs.AGI>=3?2:0)).total;
    if(r>=13){ write("Tu franchis le gouffre de justesse.","good"); gainXP(3);}
    else damage(rng.between(3,6),"Chute");
    setCooldown('bridge',2);
    continueBtn();
  }, true);
  addChoice("Réparer (STR)", ()=>{
    const r=d20(state.attrs.STR>=3?2:0).total;
    if(r>=14){ write("Tu répares le pont assez solidement.","good"); rep(+1);}
    else damage(2,"Effort");
    setCooldown('bridge',3);
    continueBtn();
  });
  addChoice("Contourner", ()=>{ write("Tu perds du temps mais restes en sécurité.","info"); state.day++; setCooldown('bridge',1); continueBtn(); });
}

function eventRune(){
  if(state.flags.runeDone){ write("🪨 La pierre runique est fendue, inerte."); return continueBtn(); }
  write("🪨 Une pierre runique étrange émane une lueur.");
  clearChoices();
  addChoice("Prier", ()=>{ heal(rng.between(3,8)); rep(+2); state.flags.runeDone=true; continueBtn(); }, true);
  addChoice("La briser", ()=>{ changeGold(rng.between(5,10)); rep(-3); state.flags.runeDone=true; continueBtn(); });
  addChoice("L’ignorer", ()=>{ state.flags.runeDone=true; continueBtn(); });
}

function eventPatrol(){
  if(!available('patrol')){ write("🛡️ Tu ne vois aucune patrouille aujourd’hui."); return continueBtn(); }
  write("🛡️ Une petite patrouille du seigneur local t’accoste.");
  clearChoices();
  addChoice("Saluer respectueusement", ()=>{ if(state.rep>=10){ changeGold(3); write("Ils te remercient pour tes actes.","good"); } else write("Ils acquiescent et repartent."); setCooldown('patrol',3); continueBtn(); }, true);
  addChoice("Demander des nouvelles", ()=>{ gainXP(2); if(rng.rand()<0.5) state.flags.rumors=(state.flags.rumors||0)+1; setCooldown('patrol',2); continueBtn(); });
  addChoice("Les provoquer", ()=>{ rep(-5); combat(mobs.bandit()); setCooldown('patrol',3); });
}

function eventCaravan(){
  if(!available('caravan')){ write("🚚 La route est vide — la caravane est déjà passée."); return continueBtn(); }
  write("🚚 Tu croises une caravane de marchands.");
  clearChoices();
  addChoice("Aider à porter", ()=>{ gainXP(5); rep(+2); setCooldown('caravan',3); continueBtn(); }, true);
  addChoice("Proposer une escorte", ()=>{
    write("Tu marches à leurs côtés jusqu’au prochain tournant.");
    const amb = d20().total;
    if(amb>=14){ write("Tu déjoues une embuscade. Les marchands te paient.",'good'); changeGold(rng.between(4,8)); rep(+3); }
    else { write("Un accrochage survient : tu te blesses légèrement.",'warn'); damage(rng.between(1,4),'Accrochage'); changeGold(rng.between(2,4)); }
    setCooldown('caravan',4);
    continueBtn();
  });
  addChoice("Les voler", ()=>{ changeGold(5); rep(-5); setCooldown('caravan',5); combat(mobs.bandit()); });
}

// === Ermite (zone : colline) ===
function eventHermit(){
  if(!available('hermit')){ 
    write("🧙 L’ermite médite ailleurs pour aujourd’hui."); 
    return continueBtn(); 
  }
  write('🧙 Un ermite t’observe en silence.');
  clearChoices();
  addChoice('Accepter sa décoction', ()=>{
    if(rng.rand()<0.6){ 
      heal(rng.between(5,10)); 
      gainXP(3); 
    } else { 
      damage(rng.between(2,5),'Nausée'); 
    }
    setCooldown('hermit', 2);
    continueBtn();
  }, true);
  addChoice("Acheter une breloque (5 or)", ()=>{
    if(hasItem("Breloque d'ermite")){
      write("Tu possèdes déjà une breloque.", "info");
    } else if(state.gold>=5){
      changeGold(-5);
      addItem("Breloque d'ermite","10% d’annuler un mal (poison/saignement)");
      state.flags.charm = 1;
    } else {
      write("Pas assez d’or.", "warn");
    }
    setCooldown('hermit', 2);
    continueBtn();
  });
  addChoice('Refuser poliment', ()=>{
    setCooldown('hermit', 1);
    continueBtn();
  });
}

// ---------- Boss & oracle ----------
const mobs = {
  wolf: ()=>({name:'Loup affamé',hp:10,maxHp:10,ac:11,hitMod:2,tier:1}),
  bandit: ()=>({name:'Bandit des fourrés',hp:12,maxHp:12,ac:12,hitMod:3,tier:2,dotChance:0.1,dotType:'bleed'}),
  boar: ()=>({name:'Sanglier irascible',hp:11,maxHp:11,ac:11,hitMod:2,tier:1}),
  harpy: ()=>({name:'Harpie du vent',hp:14,maxHp:14,ac:13,hitMod:4,tier:2,dotChance:0.2,dotType:'bleed'}),
  ghoul: ()=>({name:'Goule des roseaux',hp:13,maxHp:13,ac:12,hitMod:3,tier:2,dotChance:0.25,dotType:'poison'}),
  chief: ()=>({name:'Chef Bandit',hp:24,maxHp:24,ac:14,hitMod:5,tier:3,dotChance:0.3,dotType:'bleed'})
};
function combatBoss(){
  const boss=mobs.chief();
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
function eventOracle(){
  write('🔮 Une voyante apparaît dans tes rêves.');
  clearChoices();
  addChoice('Écouter la prophétie', ()=>{
    write('“Quand trois éclats seront réunis, la porte s’ouvrira.”','info');
    state.flags.oracleSeen=true; continueBtn();
  }, true);
}

// ---------- Exploration (anti-stagnation) ----------
function pickWeighted(items, k){
  const recent = new Set(state.lastLabels);
  let pool = items
    .filter(it => it && it.label && typeof it.act === 'function')
    .filter(it => !it.key || available(it.key))
    .flatMap(it => Array(Math.max(1, it.w||1)).fill(it))
    .filter(it => !recent.has(it.label));

  if(pool.length < k){
    pool = items
      .filter(it => it && it.label && typeof it.act === 'function')
      .filter(it => !it.key || available(it.key))
      .flatMap(it => Array(Math.max(1, it.w||1)).fill(it));
  }

  const out=[];
  while(out.length<k && pool.length){
    const idx = Math.floor(rng.rand()*pool.length);
    out.push(pool[idx]);
    pool.splice(idx,1);
  }

  state.lastLabels = [...out.map(o=>o.label), ...state.lastLabels].slice(0,8);
  return out;
}

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

function explore(initial=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();

  // Avance le temps + reset des quotas quotidien au changement de cycle
  if(!initial){
    const slots=["Aube","Matin","Midi","Après-midi","Crépuscule","Nuit"];
    const idx=slots.indexOf(state.time);
    const n=(idx+1)%slots.length;
    if(n===0) state.day++, state.daily={};
    state.time = slots[n];
    ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  }
  tickStatus();
  if(state.hp<=0) return;

  if(state.day>=5 && !state.flags.oracleSeen){ eventOracle(); return; }
  if(state.flags.fragments>=3 && !state.flags.bossUnlocked){
    write("Les fragments te guident vers un repaire…","info");
    state.flags.bossUnlocked = true;
  }

  const base = [
    { label:"Fouiller", act:searchArea, w:2 },
    { label:"Se reposer", act:rest, w:1 },
    { label:"Utiliser un objet", act:useItemMenu, w:1 }
  ];

  const nav = [
    {label:'→ Marais', act:()=>gotoZone('marais'), w:1},
    {label:'→ Clairière', act:()=>gotoZone('clairiere'), w:1},
    {label:'→ Colline', act:()=>gotoZone('colline'), w:1},
    {label:'→ Ruines', act:()=>gotoZone('ruines'), w: state.flags.ruinsUnlocked?1:0},
    {label:'→ Grotte', act:()=> state.flags.torch ? gotoZone('grotte') : (write('Il fait trop sombre sans torche.','warn'), continueBtn()), w:1}
  ].filter(x=>x.w>0);

  const z=state.locationKey;
  let dyn=[];
  if(z==='marais'){
    dyn.push(
      {label:'Traquer une goule', act:()=>combat(mobs.ghoul()), w:3},
      {label:'Aider un captif',   act:eventPeasant,            w:1, key:'peasant'},
      {label:'Sanctuaire noyé',   act:eventSanctuary,          w:1, key:'sanctuary'},
      {label:'Marchand ambulant', act:eventMerchant,           w:1, key:'merchant'}
    );
  } else if(z==='clairiere'){
    dyn.push(
      {label:'Croiser une herboriste', act:eventHerbalist, w:2, key:'herbalist'},
      {label:'Écouter un barde',       act:eventBard,      w:1, key:'bard'},
      {label:'Chasser un sanglier',    act:()=>combat(mobs.boar()), w:2},
      {label:'Rencontrer le marchand', act:eventMerchant,  w:2, key:'merchant'},
      {label:'Pont effondré',          act:eventBridge,    w:1, key:'bridge'},
      {label:'Pierre runique',         act:eventRune,      w:1}
    );
  } else if(z==='colline'){
    dyn.push(
      {label:'Rencontrer un ermite',   act:eventHermit,    w:1, key:'hermit'},
      {label:'Explorer des ruines',    act:eventRuins,     w:2, key:'ruins'},
      {label:'Affronter une harpie',   act:()=>combat(mobs.harpy()), w:3},
      {label:'Croiser un forgeron',    act:eventSmith,     w:1, key:'smith'},
      {label:'Patrouille locale',      act:eventPatrol,    w:1, key:'patrol'},
      {label:'Caravane marchande',     act:eventCaravan,   w:1, key:'caravan'}
    );
  } else if(z==='ruines'){
    dyn.push(
      {label:'Fouiller les décombres', act:eventRuins,     w:3, key:'ruins'},
      {label:'Combattre des bandits',  act:()=>combat(mobs.bandit()), w:2},
      {label:'Patrouille locale',      act:eventPatrol,    w:1, key:'patrol'}
    );
  } else if(z==='grotte'){
    dyn.push(
      {label:'Goule ancienne',         act:()=>combat({name:'Goule ancienne',hp:18,maxHp:18,ac:13,hitMod:5,tier:3,dotChance:0.35,dotType:'poison'}), w:3},
      {label:'Échos inquiétants',      act:()=>{ const r=d20().total; if(r<10) damage(3,'Stalactite'); else write('Rien ne se passe.'); continueBtn(); }, w:1}
    );
  }

  if(state.flags.bossUnlocked){
    dyn.push({label:"Traquer le Chef Bandit", act:combatBoss, w:1, key:'boss'});
  }

  // Tirage minimum garanti : 1 base + 1 dyn + 1 nav, puis complète à 4
  const basePick = pickWeighted(base, 1);
  const dynPick  = pickWeighted(dyn,  Math.min(2, Math.max(1, dyn.length?1:0)));
  const navPick  = pickWeighted(nav,  1);
  let all = [...basePick, ...dynPick, ...navPick];

  const need = Math.max(0, 4 - all.length);
  if(need>0){
    const extra = pickWeighted([...dyn, ...nav, ...base], need);
    all = [...all, ...extra];
  }

  all.forEach((c,i)=> addChoice(c.label, c.act, i===0));

  const onlyBase = all.every(c => base.some(b => b.label===c.label));
  if(onlyBase && dyn.length){
    const extra = pickWeighted(dyn, 1)[0];
    if(extra) addChoice(extra.label, extra.act);
  }

  normalizeChoices();
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

// ---------- Classes ----------
function chooseClass(){
  clearChoices(); write('Choisis ta classe :','info');
  const pick = (nom, boostKey, boostVal, skill) => {
    state.cls = nom; if (boostKey) state.attrs[boostKey] = boostVal; state.hasChosenClass = true; state.skill = skill; setStats(); startAdventure();
  };
  addChoice('🛡️ Guerrier', ()=> pick('Guerrier','STR',3,{ name:'Frappe vaillante', cooldown:3, cd:0, use:(e)=>{ const dmg=rng.between(2,6)+rng.between(2,6)+state.level; e.hp-=dmg; write(`💥 Frappe vaillante : -${dmg} PV`,'good'); } }), true);
  addChoice('🗡️ Voleur', ()=> pick('Voleur','AGI',3,{ name:'Coup de l’ombre', cooldown:3, cd:0, use:(e)=>{ const r=d20(4).total; if(r>=e.ac){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🗡️ Coup de l’ombre : -${dmg} PV`,'good'); } else write('Tu rates.','warn'); } }));
  addChoice('⚕️ Paladin', ()=> pick('Paladin','WIS',2,{ name:'Lumière', cooldown:3, cd:0, use:()=>{ heal(rng.between(3,8)+state.level); } }));
  addChoice('🏹 Rôdeur',  ()=> pick('Rôdeur','AGI',3,{ name:'Tir précis', cooldown:2, cd:0, use:(e)=>{ const r=d20(6).total; if(r>=e.ac){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🏹 Tir précis : -${dmg} PV`,'good') } else write('Tir manqué.','warn'); } }));
  addChoice('🔮 Mystique',()=> pick('Mystique','WIS',3,{ name:'Onde arcanique', cooldown:3, cd:0, use:(e)=>{ const dmg=rng.between(3,8); e.hp-=dmg; e.dotChance=Math.min(0.6,(e.dotChance||0)+0.15); write(`🔮 Onde arcanique : -${dmg} PV`,'good'); } }));
}

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
    flags:{ metHerbalist:false,metSmith:false,peasantSaved:false, fragments:0,bossUnlocked:false,torch:false,oracleSeen:false, ruinsUnlocked:true,grottoUnlocked:false,rumors:0,charm:0, runeDone:false },
    quests:{ main:{title:'Le Chef Bandit',state:'En cours'}, side:[], artifacts:{title:'Fragments d’artefact (0/3)',state:'En cours'} },
    achievements:{}, lastLabels:[],
    inCombat:false, enemy:null,
    skill:{name:"", cooldown:0, cd:0, desc:"", use:()=>{}},
    cooldowns:{},
    daily:{}
  };
}
state = initialState();

function setup(isNew=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();
  const classesValides = ['Guerrier','Voleur','Paladin','Rôdeur','Mystique'];
  const needsClass = !state.cls || state.cls === '—' || !classesValides.includes(state.cls);
  if (isNew || ui.log.childElementCount===0 || needsClass){
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

// Bouton reset (si présent)
const btnReset=document.getElementById('btn-reset'); if(btnReset) btnReset.onclick=()=>{ state=initialState(); ui.log.innerHTML=""; setup(true); };

// PWA
if('serviceWorker' in navigator){ window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js') ); }

// Boot DOM-safe
(function boot(){ if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>setup(true), { once:true }); else setup(true); })();
