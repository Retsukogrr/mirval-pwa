/* ============================================================
   Aventurier de Mirval — v10 (full, anti-bug, contenu étendu)
   - Démarrage fiable (classes au boot)
   - UI robuste (anti double-clic, pas de doublon "Continuer")
   - Exploration riche (combat garanti + PNJ/village garantis)
   - Marché, Guilde (contrats), Forgeron, Herboriste, Barde, Ermite
   - Quêtes : fragments (drop%), paysan, oracle, 2 Boss (Chef & Sorcière)
   - Combat stable (attaque/viser/parade/compétence/potion/fuite)
   - Équipements (mods ATQ/DEF), vente/achat, auto-équiper
   - AUCUNE sauvegarde/chargement
   ============================================================ */

/* ---------- Garder écran éveillé (mobile) ---------- */
let wakeLock;
async function keepAwake(){ try{ wakeLock = await navigator.wakeLock.request('screen'); }catch(e){} }
if('wakeLock' in navigator){
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') keepAwake(); });
  keepAwake();
}

/* ---------- RNG avec graine ---------- */
const rng = (() => {
  const seed = (crypto.getRandomValues ? (crypto.getRandomValues(new Uint32Array(1))[0]^Date.now()) : Date.now())>>>0;
  let s = seed>>>0;
  function rand(){ s^=s<<13; s^=s>>>17; s^=s<<5; return (s>>>0)/0xFFFFFFFF; }
  function between(min,max){ return Math.floor(rand()*(max-min+1))+min; }
  return {rand, between, seed};
})();

/* ---------- Bind UI ---------- */
const ui = {};
function bindUI(){
  const ids = [
    'log','choices','hp','hpmax','hpbar','gold','lvl','xp','inventory','location','day',
    'lastRoll','status','p-class','p-name','a-str','a-agi','a-wis','rep','rep-label','quests','seedInfo'
  ];
  ids.forEach(id => ui[id]=document.getElementById(id));
  ui.loc = ui.location; // alias compat
  if(ui.seedInfo) ui.seedInfo.textContent = `seed ${rng.seed}`;
}

/* ---------- Helpers UI ---------- */
function write(html, cls=""){ const p=document.createElement('p'); if(cls) p.classList.add(cls); p.innerHTML=html; ui.log.appendChild(p); ui.log.scrollTop=ui.log.scrollHeight; }
function clearLog(){ ui.log.innerHTML=''; }
function clearChoices(){ ui.choices.innerHTML=''; }
function addChoice(label, cb, primary=false){
  const b=document.createElement('button');
  if(primary) b.classList.add('btn-primary');
  b.textContent=label;
  b.addEventListener('click', ()=>{
    if(state._lockClicks) return;
    state._lockClicks=true;
    try{ cb(); } finally { setTimeout(()=>{ state._lockClicks=false; }, 80); }
  });
  ui.choices.appendChild(b);
}
function continueBtn(next=()=>explore()){
  clearChoices();
  addChoice("Continuer", next, true);
}

/* ---------- État initial ---------- */
function initialState(){
  return {
    name:"Eldarion",
    cls:"—",
    hasChosenClass:false,
    attrs:{ STR:1, AGI:1, WIS:1 },

    hp:22, hpMax:22, gold:12, level:1, xp:0, rep:0,

    day:1, time:"Aube",
    location:"Lisière de la forêt de Mirval",
    locationKey:"clairiere",

    inventory:[
      {name:"Vieille épée", desc:"+1 ATQ", mods:{atk:1}},
      {name:"Petite armure", desc:"+1 DEF", mods:{def:1}}
    ],
    potions:1,
    status:[],
    equips:{ weapon:null, armor:null, offhand:null },

    flags:{
      torch:false, fragments:0,
      metHerbalist:false, metSmith:false, peasantSaved:false,
      rumors:0, bossUnlocked:false,         // Chef Bandit
      witchUnlocked:false,                  // Sorcière des Brumes (portail)
      ruinsUnlocked:true, grottoUnlocked:false,
      charm:false, oracleSeen:false,
      villageVisited:false
    },

    quests:{
      main:{title:'Le Chef Bandit',state:'En cours'},
      side:[],
      artifacts:{title:'Fragments d’artefact (0/3)',state:'En cours'},
      board:[], // contrats guilde
      witch:{title:'Brumes de la Sorcière',state:'Fragments requis (0/3)'}
    },

    inCombat:false, enemy:null,
    skill:{name:"", cooldown:0, cd:0, desc:"", use:()=>{}},

    lastLabels:[],
    _lockClicks:false
  };
}
let state = initialState();

/* ---------- Icônes SVG simples pour cohérence visuelle ---------- */
function svgIcon(kind){
  if(kind==='altar') return `<svg width="18" height="16" viewBox="0 0 22 20" style="vertical-align:-3px"><rect x="5" y="10" width="12" height="6" rx="2" fill="#4b5563"/><rect x="7" y="7" width="8" height="3" fill="#9ca3af"/></svg>`;
  if(kind==='forge') return `<svg width="18" height="16" viewBox="0 0 24 20" style="vertical-align:-3px"><rect x="3" y="10" width="18" height="7" rx="2" fill="#374151"/><circle cx="12" cy="9" r="3" fill="#f59e0b"/></svg>`;
  if(kind==='chest') return `<svg width="18" height="16" viewBox="0 0 22 20" style="vertical-align:-3px"><rect x="3" y="7" width="16" height="9" rx="2" fill="#92400e"/><rect x="3" y="7" width="16" height="4" fill="#b45309"/></svg>`;
  if(kind==='pnj') return `<svg width="18" height="16" viewBox="0 0 20 20" style="vertical-align:-3px"><circle cx="10" cy="6" r="3" fill="#9ca3af"/><rect x="5" y="10" width="10" height="6" rx="2" fill="#6b7280"/></svg>`;
  return '';
}

/* ---------- Statuts récurrents ---------- */
function tickStatus(){
  state.status = state.status.filter(st=>{
    if(st.type==='poison'){ const dmg=rng.between(1,2); damage(dmg,'Poison'); st.dur--; }
    if(st.type==='bleed'){ const dmg=2; damage(dmg,'Saignement'); st.dur--; }
    if(st.type==='slow'){ st.dur--; if(st.dur===0) write('💨 Tu te sens plus léger.','info'); }
    return st.dur>0 && state.hp>0;
  });
}

/* ---------- Aides mécaniques ---------- */
function d20(mod=0){ const r=rng.between(1,20); const t=r+mod; ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${r} = ${t}`; return {roll:r,total:t}; }
function heal(n){ state.hp=Math.min(state.hpMax,state.hp+n); setStats(); write(`+${n} PV`,'good'); }
function damage(n,src=""){ state.hp=Math.max(0,state.hp-n); setStats(); write(`-${n} PV ${src?`(${src})`:''}`,'bad'); if(state.hp<=0){ gameOver(); return true; } return false; }
function changeGold(n){ state.gold=Math.max(0,state.gold+n); setStats(); write(`Or ${n>=0?'+':''}${n} → ${state.gold}`, n>=0?'good':'warn'); }
function gainXP(n){ state.xp+=n; const need=20+(state.level-1)*15; write(`XP +${n} (total ${state.xp}/${need})`,'info'); if(state.xp>=need){ state.xp=0; state.level++; state.hpMax+=5; state.hp=state.hpMax; write(`<b>Niveau ${state.level} !</b> PV +5 & soignés.`,'good'); } setStats(); }
function rep(n){ state.rep+=n; setStats(); }
function repText(n){ return n>=30?'Vertueux':(n<=-30?'Sombre':'Neutre'); }
function addItem(name,desc,mods){ state.inventory.push({name,desc,mods:mods||{}}); setStats(); write(`Tu obtiens <b>${name}</b>.`,'good'); }
function hasItem(name){ return state.inventory.some(i=>i.name===name); }
function removeItem(name){ const i=state.inventory.findIndex(x=>x.name===name); if(i>=0){ state.inventory.splice(i,1); setStats(); } }

/* ---------- Stats affichées ---------- */
function setStats(){
  if(!ui.hp) return;
  ui.hp.textContent=state.hp; ui.hpmax.textContent=state.hpMax;
  ui.hpbar.style.width = Math.max(0,Math.min(100, Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent=state.gold; ui.lvl.textContent=state.level; ui.xp.textContent=state.xp;
  ui.status.textContent = state.status.length? state.status.map(s=>s.name).join(', ') : '—';
  ui['p-class'].textContent=state.cls; ui['p-name'].textContent=state.name;
  ui['a-str'].textContent=state.attrs.STR; ui['a-agi'].textContent=state.attrs.AGI; ui['a-wis'].textContent=state.attrs.WIS;
  ui.rep.textContent=state.rep; ui['rep-label'].textContent=repText(state.rep);

  // inventaire
  ui.inventory.innerHTML='';
  state.inventory.forEach(it=>{
    const d=document.createElement('div'); d.className='stat';
    d.innerHTML=`<b>${it.name}</b><span>${it.desc||''}</span>`;
    ui.inventory.appendChild(d);
  });

  // quêtes
  ui.quests.innerHTML='';
  const mq=document.createElement('div'); mq.className='stat';
  mq.innerHTML=`<b>${state.quests.main.title}</b><span>${state.quests.main.state}</span>`;
  ui.quests.appendChild(mq);

  const aq=document.createElement('div'); aq.className='stat';
  aq.innerHTML=`<b>Fragments d’artefact (${state.flags.fragments}/3)</b><span>${state.quests.artifacts.state}</span>`;
  ui.quests.appendChild(aq);

  const wq=document.createElement('div'); wq.className='stat';
  const wst = state.flags.fragments>=3 ? 'Prête : affronter la Sorcière' : `Fragments requis (${state.flags.fragments}/3)`;
  wq.innerHTML=`<b>${state.quests.witch.title}</b><span>${wst}</span>`;
  ui.quests.appendChild(wq);

  state.quests.side.forEach(q=>{
    const dq=document.createElement('div'); dq.className='stat';
    dq.innerHTML=`<b>${q.title}</b><span>${q.state}</span>`;
    ui.quests.appendChild(dq);
  });
}

/* ---------- Temps ---------- */
function setTime(){
  const slots=["Aube","Matin","Midi","Après-midi","Crépuscule","Nuit"];
  const idx=slots.indexOf(state.time);
  let n=(idx+1)%slots.length;
  if(n===0) state.day++;
  state.time=slots[n];
  ui.day.textContent=`Jour ${state.day} — ${state.time}`;
}

/* ---------- Équipement auto ---------- */
function autoEquip(){
  const bestW = state.inventory.filter(i=>i.mods?.atk).sort((a,b)=>(b.mods.atk||0)-(a.mods.atk||0))[0]||null;
  const bestA = state.inventory.filter(i=>i.mods?.def).sort((a,b)=>(b.mods.def||0)-(a.mods.def||0))[0]||null;
  state.equips.weapon = bestW; state.equips.armor = bestA;
}

/* ===================== ENNEMIS (définis tôt) ===================== */
const mobTemplates = {
  wolf: ()=>({ name:"Loup affamé", hp:10, maxHp:10, ac:11, hitMod:2, tier:1 }),
  bandit: ()=>({ name:"Bandit des fourrés", hp:12, maxHp:12, ac:12, hitMod:3, tier:2 }),
  boar: ()=>({ name:"Sanglier irascible", hp:11, maxHp:11, ac:11, hitMod:2, tier:1 }),
  harpy: ()=>({ name:"Harpie du vent", hp:14, maxHp:14, ac:13, hitMod:4, tier:2, dotChance:0.2, dotType:'bleed' }),
  ghoul: ()=>({ name:"Goule des roseaux", hp:13, maxHp:13, ac:12, hitMod:3, tier:2, dotChance:0.25, dotType:'poison' }),
  ancientGhoul: ()=>({ name:"Goule ancienne", hp:18, maxHp:18, ac:13, hitMod:5, tier:3, dotChance:0.35, dotType:'poison' })
};
/* ===================== UTILITAIRES CHOIX ===================== */
function pickWeighted(items, k){
  const recent=new Set(state.lastLabels);
  let pool=items.flatMap(it=>Array((it.w||1)).fill(it)).filter(it=>!recent.has(it.label));
  if(pool.length<k) pool=items.flatMap(it=>Array((it.w||1)).fill(it));
  const out=[];
  for(let i=0;i<k && pool.length;i++){
    const idx=Math.floor(rng.rand()*pool.length);
    out.push(pool[idx]); pool.splice(idx,1);
  }
  state.lastLabels=[...out.map(o=>o.label), ...state.lastLabels].slice(0,8);
  return out;
}

/* ===================== ACTIONS GÉNÉRALES ===================== */
function searchArea(){
  clearChoices();
  const bonus = state.attrs.WIS>=3?1:0;
  const {total}=d20(bonus);
  if(total>=19){ write(`${svgIcon('chest')} Tu trouves un coffre scellé !`,'good'); chest(); }
  else if(total>=14){ write('✨ Tu déniches quelques pièces.','good'); changeGold(rng.between(3,8)); }
  else if(total>=10){ write('Des traces fraîches…','info'); if(rng.rand()<0.65) randomEncounter(); }
  else { write('Aïe ! Des ronces t’écorchent.','bad'); damage(rng.between(1,3),'Ronces'); }
  continueBtn();
}
function rest(){
  clearChoices();
  if(rng.rand()<0.38){ write('Quelque chose s’approche pendant ton repos…','warn'); randomEncounter(); }
  else { heal(rng.between(4,8)); write('Tu te reposes un peu.','good'); }
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
  const r=rng.between(1,100);
  if(r>92){ addItem("Bouclier en fer","+2 DEF",{def:2}); }
  else if(r>75){ addItem("Cuir renforcé","+2 DEF",{def:2}); }
  else if(r>60){ addItem("Épée affûtée","+1 ATQ",{atk:1}); }
  else if(r>40){ changeGold(rng.between(7,15)); }
  else { write("💥 Piège !","bad"); damage(rng.between(3,6),"Piège"); }
}
function randomCombat(){
  const z=state.locationKey;
  if(z==='marais') return combat(mobTemplates.ghoul());
  if(z==='grotte') return combat(mobTemplates.ancientGhoul());
  if(z==='clairiere') return combat(mobTemplates.bandit());
  if(z==='colline') return combat(mobTemplates.harpy());
  return combat(mobTemplates.wolf());
}
function randomEncounter(){
  if(rng.rand()<0.65) return randomCombat();
  [eventSanctuary,eventHerbalist,eventSmith,eventHermit,eventBard][rng.between(0,4)]();
}

/* ===================== PNJ & ÉVÈNEMENTS ===================== */
function eventHerbalist(){
  clearChoices();
  write("🌿 Une herboriste te fait signe.");
  addChoice("S’approcher", ()=>{
    if(state.rep<-20){ write("Elle se détourne : 'Je ne sers pas les cruels.'",'warn'); rep(-1); return continueBtn(); }
    write("Elle prépare une mixture fumante…");
    const cost=(state.rep>20?2:3);
    if(state.gold>=cost){ changeGold(-cost); heal(rng.between(6,12)); state.flags.metHerbalist=true; }
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
  clearChoices();
  write(`${svgIcon('forge')} ⚒️ Un forgeron inspecte tes armes.`);
  addChoice('Améliorer arme (5 or)', ()=>{
    if(state.gold>=5){ changeGold(-5); addItem('Épée affûtée','ATQ +1',{atk:1}); autoEquip(); }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  }, true);
  addChoice('Acheter bouclier (6 or)', ()=>{
    if(state.gold>=6){ changeGold(-6); addItem('Bouclier en fer','DEF +2',{def:2}); autoEquip(); }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  });
  addChoice('Réparer/équiper', ()=>{
    autoEquip(); write('Tes équipements sont prêts.','good'); continueBtn();
  });
}
function eventBard(){
  clearChoices();
  write('🎻 Un barde propose une chanson.');
  addChoice('Écouter', ()=>{
    if(rng.rand()<0.7){ heal(rng.between(3,7)); }
    else { changeGold(-2); write('La bourse s’est allégée…','warn'); }
    continueBtn();
  }, true);
  addChoice('L’ignorer', continueBtn);
}
function eventRuins(){
  clearChoices();
  write('🏚️ Des ruines effondrées se dressent.');
  addChoice('Fouiller', ()=>{
    const {total}=d20(state.attrs.WIS>=3?1:0);
    if(total>=16){
      if(!state.flags.torch){ state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte'); }
      else if(state.flags.fragments<3 && rng.rand()<0.55){
        state.flags.fragments++; write('Tu trouves un fragment d’artefact.','good');
        if(state.flags.fragments>=3){ state.flags.witchUnlocked=true; state.quests.witch.state='Prête : affronter la Sorcière'; write('🌫️ Les brumes frémissent… un passage s’ouvre dans le marais.','info'); }
      } else { chest(); }
    } else if(total>=10){ chest(); }
    else { damage(rng.between(2,5),'Éboulement'); }
    setStats();
    continueBtn();
  }, true);
  addChoice('Partir', continueBtn);
}
function eventPeasant(){
  clearChoices();
  write('🧑‍🌾 Un paysan enchaîné appelle à l’aide.');
  addChoice('Le libérer', ()=>{
    const {total}=d20(state.attrs.STR>=3?2:0);
    if(total>=14){
      write('Les chaînes cèdent.','good'); rep(+5); state.flags.peasantSaved=true;
      state.quests.side.push({title:'Le paysan reconnaissant',state:'En attente'});
    } else { damage(rng.between(1,4),'Effort'); }
    continueBtn();
  }, true);
  addChoice('L’ignorer', ()=>{ rep(-3); continueBtn(); });
}
function eventSanctuary(){
  clearChoices();
  write(`${svgIcon('altar')} ⛪ Un ancien sanctuaire se dévoile.`);
  addChoice('Prier', ()=>{
    const night = state.time==='Nuit' || state.time==='Crépuscule';
    const {total}=d20(); const t=total+(night?1:0);
    if(t>=15){ heal(rng.between(6,12)); rep(+2); }
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
  clearChoices();
  write('🧙 Un ermite t’observe en silence.');
  addChoice('Accepter sa décoction', ()=>{
    if(rng.rand()<0.6){ heal(rng.between(5,10)); gainXP(3); }
    else { damage(rng.between(2,5),'Nausée'); }
    continueBtn();
  }, true);
  addChoice('Acheter une breloque (5 or)', ()=>{
    if(state.gold>=5){ changeGold(-5); addItem("Breloque d'ermite","10% chance d’annuler un mal"); state.flags.charm=true; }
    else write("Pas assez d'or.",'warn');
    continueBtn();
  });
  addChoice('Refuser', continueBtn);
}
function eventOracle(){
  clearChoices();
  write('🔮 Une voyante apparaît dans tes rêves.');
  addChoice('Écouter la prophétie', ()=>{
    write('“Quand trois éclats seront réunis, la porte s’ouvrira.”','info');
    state.flags.oracleSeen=true; continueBtn();
  }, true);
}

/* ----- Village (Marché + Guilde) ----- */
function eventVillage(){
  clearChoices();
  write('🏘️ Tu atteins le village de Mirval.');
  addChoice('Aller au marché', market, true);
  addChoice('Passer à la guilde (contrats)', guildBoard);
  addChoice('Taverne (repos sûr 2 or)', ()=>{
    if(state.gold>=2){ changeGold(-2); heal(rng.between(6,10)); } else write('Pas assez d’or.','warn');
    continueBtn(eventVillage);
  });
  addChoice('Repartir explorer', ()=>explore(true));
}
function market(){
  clearChoices();
  write('🛒 Marché : que veux-tu faire ?');
  addChoice('Acheter une potion (4 or)', ()=>{
    if(state.gold>=4){ changeGold(-4); state.potions++; write('Potion ajoutée.','good'); }
    else write('Pas assez d’or.','warn');
    continueBtn(market);
  }, true);
  addChoice('Acheter torche (5 or)', ()=>{
    if(state.flags.torch){ write('Tu as déjà une torche.','info'); }
    else if(state.gold>=5){ changeGold(-5); state.flags.torch=true; write('Torche achetée.','good'); }
    else write('Pas assez d’or.','warn');
    continueBtn(market);
  });
  addChoice('Acheter cuir renforcé (8 or, DEF+2)', ()=>{
    if(state.gold>=8){ changeGold(-8); addItem('Cuir renforcé','DEF +2',{def:2}); autoEquip(); }
    else write('Pas assez d’or.','warn');
    continueBtn(market);
  });
  addChoice('Vendre un objet', ()=>{
    if(!state.inventory.length){ write('Rien à vendre.','info'); return continueBtn(market); }
    clearChoices(); write('Que veux-tu vendre ?');
    state.inventory.forEach((it,idx)=>{
      const val=Math.max(1, (it.mods?.atk||0)+(it.mods?.def||0) + 1);
      addChoice(`${it.name} (+${val} or)`, ()=>{
        state.inventory.splice(idx,1); changeGold(val); setStats(); write('Vendu.','good'); continueBtn(market);
      });
    });
    addChoice('Annuler', market);
  });
  addChoice('Retour village', eventVillage);
}
function guildBoard(){
  clearChoices();
  write('📜 Tableau des contrats :');
  addChoice('Contrat: chasser 1 bandit (6 or)', ()=>{
    state.quests.board.push({type:'bandit', need:1, got:0, reward:6});
    write('Contrat pris.','info');
    continueBtn(eventVillage);
  }, true);
  addChoice('Contrat: chasser 2 loups (10 or)', ()=>{
    state.quests.board.push({type:'wolf', need:2, got:0, reward:10});
    write('Contrat pris.','info');
    continueBtn(eventVillage);
  });
  addChoice('Retour village', eventVillage);
}

/* ===================== ZONES & EXPLORATION ===================== */
function gotoZone(key){
  state.locationKey=key;
  state.location = key==='marais'?"Marais de Vire-Saule" :
                   key==='clairiere'?"Clairière des Lys" :
                   key==='colline'?"Colline de Rocfauve" :
                   key==='ruines'?"Ruines Oubliées" :
                   key==='grotte'?"Grotte Sépulcrale" : "Lisière";
  write(`👉 Tu te diriges vers ${state.location}.`,'sys');
  explore(true);
}
function setTimeAndTick(){ setTime(); tickStatus(); }

/* Exploration avec garanties :
   - au moins 1 combat (si possible)
   - au moins 1 social/special (PNJ, ruines, sanctuaire, village)
   - base (fouiller, se reposer, utiliser objet)
   - navigation (2 max)
*/
function explore(initial=false){
  setStats();
  ui.location.textContent=state.location;
  ui.day.textContent=`Jour ${state.day} — ${state.time}`;
  clearChoices();
  if(!initial) setTimeAndTick();
  if(state.hp<=0) return;

  // Oracle (unique)
  if(state.day>=5 && !state.flags.oracleSeen){ eventOracle(); return; }

  const z=state.locationKey;

  const base = [
    {label:"Fouiller", act:searchArea, w:2},
    {label:"Se reposer", act:rest, w:1},
    {label:"Utiliser un objet", act:useItemMenu, w:1},
    {label:"Aller au village", act:eventVillage, w:1}
  ];

  const combats=[], socials=[], specials=[];
  if(z==='marais'){
    combats.push({label:'Traquer une goule', act:()=>combat(mobTemplates.ghoul()), w:3});
    combats.push({label:'Affronter un loup', act:()=>combat(mobTemplates.wolf()), w:2});
    socials.push({label:'Aider un captif', act:()=>{ if(!state.flags.peasantSaved) eventPeasant(); else { write('La berge est silencieuse.'); continueBtn(); } }, w:1});
    specials.push({label:'Feux-follets (sanctuaire)', act:eventSanctuary, w:1});
    if(state.flags.fragments>=3) specials.push({label:'→ Antre des Brumes', act:eventWitchGate, w:1});
  } else if(z==='clairiere'){
    combats.push({label:'Bandits embusqués', act:()=>combat(mobTemplates.bandit()), w:3});
    combats.push({label:'Chasser un sanglier', act:()=>combat(mobTemplates.boar()), w:2});
    socials.push({label:'Herboriste', act:eventHerbalist, w:2});
    socials.push({label:'Barde itinérant', act:eventBard, w:1});
  } else if(z==='colline'){
    combats.push({label:'Affronter une harpie', act:()=>combat(mobTemplates.harpy()), w:3});
    socials.push({label:'Ermite', act:eventHermit, w:1});
    specials.push({label:'Ruines anciennes', act:eventRuins, w:3});
    socials.push({label:'Forgeron itinérant', act:eventSmith, w:1});
  } else if(z==='ruines'){
    combats.push({label:'Bandits dans l’ombre', act:()=>combat(mobTemplates.bandit()), w:2});
    specials.push({label:'Fouiller les décombres', act:eventRuins, w:4});
  } else if(z==='grotte'){
    combats.push({label:'Goule ancienne', act:()=>combat(mobTemplates.ancientGhoul()), w:3});
    specials.push({label:'Échos inquiétants', act:()=>{ const r=d20().total; if(r<10) damage(3,'Stalactite'); else write('Rien ne se passe.'); continueBtn(); }, w:1});
  }

  if(state.flags.bossUnlocked) specials.push({label:"Traquer le Chef Bandit", act:()=>combatBoss(), w:1});

  const nav = [
    {label:'→ Marais', act:()=>gotoZone('marais'), w:1},
    {label:'→ Clairière', act:()=>gotoZone('clairiere'), w:1},
    {label:'→ Colline', act:()=>gotoZone('colline'), w:1},
    {label:'→ Ruines', act:()=>gotoZone('ruines'), w: state.flags.ruinsUnlocked?1:0},
    {label:'→ Grotte', act:()=> state.flags.torch? gotoZone('grotte') : (write('Il fait trop sombre pour entrer.','warn'), continueBtn()), w:1}
  ].filter(x=>x.w>0);

  // Garanties
  const out=[];
  const pickOne = (arr)=>{ if(arr.length){ const p=pickWeighted(arr,1)[0]; if(p) out.push(p); } };
  pickOne(combats);
  pickOne([...socials, ...specials]);

  // Compléments
  const poolRest=[...base, ...combats, ...socials, ...specials];
  pickWeighted(poolRest, 5 - out.length).forEach(x=>out.push(x));

  // Nav (2 max)
  pickWeighted(nav, Math.min(2,nav.length)).forEach(x=>out.push(x));

  // Secours : si aucun combat, injecter un bouton dédié
  if(!out.some(o => o.act && (''+o.act).includes('combat('))){
    out.unshift({label:'Trouver un combat', act:randomCombat});
  }

  clearChoices();
  out.slice(0,6).forEach((c,i)=> addChoice(c.label, c.act, i===0));
}
/* ===================== COMBAT ===================== */
function playerAtkMod(){
  let m=0;
  if(state.cls==='Guerrier') m+=2;
  if(state.attrs.STR>=3) m+=1;
  if(state.equips.weapon?.mods?.atk) m+=state.equips.weapon.mods.atk;
  if(hasItem('Épée affûtée')) m+=1;
  return m;
}
function playerDef(){
  let d=10;
  if(state.cls==='Paladin') d+=1;
  if(state.attrs.AGI>=3) d+=1;
  if(state.equips.armor?.mods?.def) d+=state.equips.armor.mods.def;
  if(state.equips.offhand?.mods?.def) d+=state.equips.offhand.mods.def;
  if(hasItem('Petite armure')) d+=1;
  if(hasItem('Cuir renforcé')) d+=2;
  if(hasItem('Bouclier en fer')) d+=2;
  return d;
}
function terrainPenalty(){ return state.locationKey==='marais' ? -1 : 0; }

function combat(mon){
  clearChoices();
  state.inCombat=true;
  state.enemy={...mon};
  write(`<b>${mon.name}</b> apparaît ! ❤️ ${mon.hp} — CA ${mon.ac}`,'warn');
  combatTurn();
}
function combatTurn(){
  if(!state.inCombat) return;
  if(state.hp<=0){ gameOver(); return; }
  if(state.enemy.hp<=0){ write(`<b>${state.enemy.name} est vaincu !</b>`,'good'); afterCombat(); return; }

  clearChoices();
  const e=state.enemy;

  addChoice('Attaquer', ()=>aimMenu(), true);
  addChoice('Parer', ()=>{
    const bonus = state.cls==='Rôdeur'?2:1;
    const m = d20(e.hitMod).total;
    const armor = playerDef() + 2 + bonus + terrainPenalty();
    if(m>=armor){
      const dmg=Math.max(0,rng.between(1,3+e.tier)-2-bonus);
      write(`Parade partielle, -${dmg} PV.`,'warn');
      damage(dmg,e.name);
    } else write('Tu pares complètement !','good');
    setTimeout(combatTurn,0);
  });
  addChoice(`Compétence (${state.skill.name||'—'})`, ()=>{
    if(!state.skill || !state.skill.use){ write("Aucune compétence.","warn"); return combatTurn(); }
    if(state.skill.cd && state.skill.cd>0){ write("Compétence en recharge.","warn"); return combatTurn(); }
    state.skill.use(e);
    state.skill.cd = state.skill.cooldown||2;
    if(e.hp>0) enemyAttack();
    setTimeout(combatTurn,0);
  });
  addChoice(`Potion [${state.potions}]`, ()=>{
    if(state.potions<=0){ write("Plus de potions.","warn"); return combatTurn(); }
    state.potions--; heal(rng.between(8,12));
    if(e.hp>0) enemyAttack();
    setTimeout(combatTurn,0);
  });
  addChoice('Fuir', ()=>{
    const r=d20(state.attrs.AGI>=3?2:0).total;
    if(r>=14){ write("Tu fuis le combat.",'sys'); state.inCombat=false; state.enemy=null; explore(); }
    else { write("Échec de fuite !",'bad'); enemyAttack(); combatTurn(); }
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
    if(r>=e.ac-1){ const dmg=rng.between(2,5); e.hp-=dmg; write(`🦵 Frappe aux jambes : -${dmg} PV`,'good'); }
    else write('Tu manques les jambes.','warn');
    enemyAttack(); combatTurn();
  });
  addChoice('Retour', combatTurn);
}
function enemyAttack(){
  const e=state.enemy;
  const roll = d20(e.hitMod).total;
  const def = playerDef() + terrainPenalty();
  if(roll>=def){
    const dmg=rng.between(1,3+e.tier);
    if(e.name==='Bandit des fourrés' && rng.rand()<0.2){ changeGold(-1); write('🪙 Le bandit te détrousse !','warn'); }
    damage(dmg,e.name);
    if(e.dotChance && rng.rand()<e.dotChance){
      if(e.dotType==='poison') state.status.push({type:'poison', name:'Poison', dur:rng.between(2,4)});
      if(e.dotType==='bleed')  state.status.push({type:'bleed',  name:'Saignement', dur:rng.between(2,4)});
      write(`⚠️ ${e.name} inflige ${e.dotType==='poison'?'un poison':'un saignement'} !`,'warn');
    }
  }else{
    write(`${e.name} rate son attaque.`,'info');
  }
}
function afterCombat(){
  // Contrats de guilde
  if(state.quests.board?.length){
    const en = state.enemy.name.toLowerCase();
    state.quests.board.forEach(c=>{
      if((c.type==='bandit' && en.includes('bandit')) ||
         (c.type==='wolf' && en.includes('loup'))){
        c.got=(c.got||0)+1;
        if(c.got>=c.need){ changeGold(c.reward); c.done=true; write(`Contrat accompli ! +${c.reward} or`,'good'); }
      }
    });
    state.quests.board = state.quests.board.filter(c=>!c.done);
  }

  const e=state.enemy; state.inCombat=false; state.enemy=null;
  const gold=rng.between(e.tier, e.tier*3);
  const xp=rng.between(e.tier*3, e.tier*6);
  changeGold(gold); gainXP(xp);

  const r=rng.rand();
  if(r<0.18 && !hasItem("Épée affûtée")) addItem("Épée affûtée","+1 ATQ",{atk:1});
  else if(r<0.30 && !hasItem("Bouclier en fer")) addItem("Bouclier en fer","+2 DEF",{def:2});
  else if(r<0.42) { state.potions++; write("Tu trouves une potion.",'good'); }
  else if(r<0.52 && !hasItem("Cuir renforcé")) addItem("Cuir renforcé","+2 DEF",{def:2});

  // rumeurs -> Chef Bandit
  if(e.name.includes("Bandit")){
    state.flags.rumors=(state.flags.rumors||0)+1;
    if(state.flags.rumors>=3 && !state.flags.bossUnlocked){
      state.flags.bossUnlocked=true; write("🗡️ Tu apprends la cache du Chef Bandit… (événement rare débloqué)",'info');
    }
  }

  continueBtn(()=>explore());
}

/* ===================== BOSS 1 : Chef Bandit ===================== */
function combatBoss(){
  const boss={ name:"Chef Bandit", hp:24, maxHp:24, ac:14, hitMod:5, tier:3, dotChance:0.25, dotType:'bleed' };
  write('🥷 Tu t’infiltres dans la planque du Chef Bandit.','warn');
  combat(boss);
  const baseEnemyAttack=enemyAttack;
  enemyAttack=function(){
    if(state.enemy && state.enemy.name==='Chef Bandit' && state.enemy.hp<=state.enemy.maxHp/2 && !state.enemy.enraged){
      state.enemy.enraged=true; state.enemy.hitMod+=1; write('🔥 Le Chef Bandit entre en rage !','warn');
    }
    baseEnemyAttack();
  };
}

/* ===================== BOSS 2 : Sorcière des Brumes ===================== */
function eventWitchGate(){
  clearChoices();
  write('🌫️ Les brumes s’ouvrent sur un sentier caché…');
  addChoice('S’enfoncer dans les brumes', ()=>{
    state.flags.witchUnlocked = true;
    write('Un chuchotement glisse à ton oreille…','warn');
    continueBtn(()=>combatWitch());
  }, true);
  addChoice('Rebrousser chemin', continueBtn);
}
function combatWitch(){
  const witch={ name:"Sorcière des Brumes", hp:26, maxHp:26, ac:14, hitMod:5, tier:3, dotChance:0.3, dotType:'poison' };
  write('🌫️ Tu pénètres dans le cœur des brumes… Une silhouette s’avance.','warn');
  combat(witch);
  const baseEnemyAttack=enemyAttack;
  enemyAttack=function(){
    if(state.enemy && state.enemy.name==='Sorcière des Brumes'){
      if(!state.enemy.phase2 && state.enemy.hp<=18){ state.enemy.phase2=true; state.enemy.hitMod+=1; write('🕯️ Maléfice : l’air devient lourd.','warn'); }
      if(!state.enemy.phase3 && state.enemy.hp<=10){ state.enemy.phase3=true; state._witchMist=true; write('👁️ Les brumes gênent tes attaques…','warn'); }
    }
    baseEnemyAttack();
  };
}

/* ===================== FINS & GAME OVER ===================== */
function ending(){
  clearChoices();
  if(state.rep>=30){ write('<b>Fin héroïque :</b> Mirval te salue comme un sauveur.','good'); }
  else if(state.rep<=-30){ write('<b>Fin sombre :</b> ta légende glace le sang des voyageurs.','bad'); }
  else { write('<b>Fin neutre :</b> tu quittes la forêt, plus sage qu’avant.','info'); }
  addChoice('Rejouer', ()=>{ state=initialState(); clearLog(); setup(true); }, true);
}
function gameOver(){
  state.inCombat=false;
  write('<b>☠️ Tu t’effondres… La forêt de Mirval se referme sur ton destin.</b>','bad');
  clearChoices();
  addChoice('Recommencer', ()=>{ state=initialState(); clearLog(); setup(true); }, true);
}

/* ===================== CLASSES & COMPÉTENCES ===================== */
function chooseClass(){
  clearChoices();
  write('🗡️ <b>Choisis ta classe</b> pour commencer :','sys');

  const pick = (nom, boostKey, boostVal, skill) => {
    state.cls=nom; state.hasChosenClass=true;
    if(boostKey) state.attrs[boostKey]=boostVal;
    state.skill=skill||{name:'', cooldown:0, cd:0, desc:'', use:()=>{}};
    setStats(); startAdventure();
  };

  addChoice('🛡️ Guerrier — robuste et offensif', ()=>{
    pick('Guerrier','STR',3,{
      name:'Frappe vaillante', cooldown:3, cd:0, desc:'2d6 + niveau',
      use:(e)=>{ const dmg=rng.between(2,6)+rng.between(2,6)+state.level; e.hp-=dmg; write(`💥 Frappe vaillante : -${dmg} PV`,'good'); }
    });
  }, true);

  addChoice('🗡️ Voleur — agile et opportuniste', ()=>{
    pick('Voleur','AGI',3,{
      name:'Coup de l’ombre', cooldown:3, cd:0, desc:'+4 au jet, dégâts + vol',
      use:(e)=>{ const r=d20(4).total; if(r>=e.ac){ const steal=Math.min(3,state.gold); const dmg=rng.between(3,8)+steal; e.hp-=dmg; changeGold(steal); write(`🗡️ L’ombre frappe : -${dmg} PV`,'good'); } else write('Tu rates.','warn'); }
    });
  });

  addChoice('⚕️ Paladin — soins et endurance', ()=>{
    pick('Paladin','WIS',2,{
      name:'Lumière', cooldown:3, cd:0, desc:'Soigne 1d6 + niv',
      use:()=>{ heal(rng.between(3,8)+state.level); }
    });
  });

  addChoice('🏹 Rôdeur — tir précis', ()=>{
    pick('Rôdeur','AGI',3,{
      name:'Tir précis', cooldown:2, cd:0, desc:'+6 au jet, 1d8 dégâts',
      use:(e)=>{ const r=d20(6).total; if(r>=e.ac){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🏹 Tir précis : -${dmg} PV`,'good'); } else write('Tir manqué.','warn'); }
    });
  });

  addChoice('🔮 Mystique — magie & vulnérabilité', ()=>{
    pick('Mystique','WIS',3,{
      name:'Onde arcanique', cooldown:3, cd:0, desc:'1d8 & +vulnérabilité',
      use:(e)=>{ const dmg=rng.between(3,8); e.hp-=dmg; e.dotChance=Math.min(0.6,(e.dotChance||0)+0.15); write(`🔮 Onde arcanique : -${dmg} PV`,'good'); }
    });
  });
}
function startAdventure(){
  clearLog(); write("L'aventure commence !",'sys'); setStats(); explore(true);
}

/* ===================== SETUP / BOOT ===================== */
// Réduction du cooldown de compétence à chaque exploration
const _explore = explore;
explore = function(...args){
  if(state.skill && typeof state.skill.cd==='number'){
    state.skill.cd = Math.max(0, state.skill.cd-1);
  }
  _explore(...args);
};

function setup(isNew=false){
  setStats();
  ui.location.textContent=state.location;
  ui.day.textContent=`Jour ${state.day} — ${state.time}`;
  clearChoices();
  if(isNew || !state.hasChosenClass || state.cls==='—'){ chooseClass(); return; }
  explore(true);
}

// Watchdog anti-page vide (sécurité)
setInterval(()=>{
  try{
    if(!state || state.hasChosenClass) return;
    if(ui.choices && ui.choices.childElementCount===0) chooseClass();
  }catch(_){}
}, 900);

// Boot DOM
(function boot(){
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ bindUI(); setup(true); }, {once:true});
  }else{
    bindUI(); setup(true);
  }
})();
