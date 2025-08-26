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
/* ============================================================
   Mirval v10 — Content Pack (EXTENDED)
   À coller À LA FIN de game.js v10 (après le boot).
   Ajouts non intrusifs : +PNJ, +rencontres, +objets, +contrats,
   +marchands, +combats, mini-boss, cohérence renforcée.
   ============================================================ */

/* ---------- Nouvelles créatures (sans casser l’existant) ---------- */
const extraMobs = {
  bear:        ()=>({ name:"Ours brun", hp:16, maxHp:16, ac:12, hitMod:4, tier:2 }),
  sprite:      ()=>({ name:"Farfae des lys", hp:9,  maxHp:9,  ac:14, hitMod:3, tier:1, dotChance:0.15, dotType:'bleed' }),
  skeleton:    ()=>({ name:"Squelette ancien", hp:14, maxHp:14, ac:13, hitMod:4, tier:2 }),
  cultist:     ()=>({ name:"Sectateur voilé", hp:15, maxHp:15, ac:12, hitMod:5, tier:3 }),
  mireHag:     ()=>({ name:"Grondeuse des tourbières", hp:20, maxHp:20, ac:13, hitMod:5, tier:3, dotChance:0.25, dotType:'poison' }),
  banditElite: ()=>({ name:"Bandit d’élite", hp:18, maxHp:18, ac:13, hitMod:5, tier:3 })
};
// accès simple dans le code
function mobEx(name){ return extraMobs[name](); }

/* ---------- Nouveaux objets & petites aides ---------- */
function priceOf(it){
  const base = 2 + (it.mods?.atk||0) + (it.mods?.def||0) + (it.heal?1:0);
  return Math.max(1, base);
}
function addIfNotOwned(name, desc, mods){
  if(!hasItem(name)) addItem(name,desc,mods);
}

// Quelques “nouveaux” items proposés par PNJ/loot
const shopItems = {
  dagger:      {name:"Dague fine", desc:"+1 ATQ (léger)", mods:{atk:1}},
  longsword:   {name:"Épée longue", desc:"+2 ATQ", mods:{atk:2}},
  oakShield:   {name:"Bouclier de chêne", desc:"+1 DEF", mods:{def:1}},
  chainMail:   {name:"Cotte de mailles", desc:"+3 DEF", mods:{def:3}},
  swiftBoots:  {name:"Bottes véloces", desc:"Esquive + (AGI check)", mods:{def:1}},
  warHorn:     {name:"Cor de guerre", desc:"+1 ATQ ce combat (consommable)"},
  balm:        {name:"Baume curatif", desc:"Soin 6-10 PV", heal:true}
};

/* ---------- Rencontres PNJ supplémentaires ---------- */
function eventHunter(){
  clearChoices();
  write("🏹 Un chasseur t’accoste près d’un collet.");
  addChoice("Acheter une dague (4 or)", ()=>{
    if(state.gold>=4){ changeGold(-4); addItem(shopItems.dagger.name,shopItems.dagger.desc,shopItems.dagger.mods); }
    else write("Pas assez d’or.","warn");
    continueBtn();
  }, true);
  addChoice("Prendre une leçon (2 or → +2 au prochain jet d’attaque)", ()=>{
    if(state.gold>=2){ changeGold(-2); state._tempAtkBuff = 2; write("Tu te sens plus sûr de toi.","good"); }
    else write("Pas assez d’or.","warn");
    continueBtn();
  });
  addChoice("Partir", continueBtn);
}

function eventPriest(){
  clearChoices();
  write("⛪ Un prêtre propose une bénédiction.");
  addChoice("Donner 2 or (soin 6-10)", ()=>{
    if(state.gold>=2){ changeGold(-2); heal(rng.between(6,10)); rep(+1); }
    else write("Pas assez d’or.","warn");
    continueBtn();
  }, true);
  addChoice("Confesser (réputation +2 / -2 selon ton état)", ()=>{
    if(state.rep<=-10){ rep(+2); write("Tu te sens plus léger…","good"); }
    else { rep(-2); write("L’humilité t’est recommandée…","warn"); }
    continueBtn();
  });
  addChoice("Refuser", continueBtn);
}

function eventScholar(){
  clearChoices();
  write("📚 Un érudit collecte des fragments.");
  addChoice("Échanger 1 fragment → 8 or", ()=>{
    if(state.flags.fragments>0){ state.flags.fragments--; changeGold(8); setStats(); }
    else write("Tu n’as pas de fragment.","warn");
    continueBtn();
  }, true);
  addChoice("Demander des rumeurs", ()=>{
    write("“On murmure qu’un passage s’ouvre quand trois éclats brillent…”",'info');
    continueBtn();
  });
  addChoice("Partir", continueBtn);
}

function eventBlackMarket(){
  clearChoices();
  write("🕯️ Un marché noir s’ouvre dans une ruelle sombre.");
  addChoice("Acheter Épée longue (9 or, +2 ATQ)", ()=>{
    if(state.gold>=9){ changeGold(-9); addItem(shopItems.longsword.name,shopItems.longsword.desc,shopItems.longsword.mods); }
    else write("Pas assez d’or.","warn");
    continueBtn(eventBlackMarket);
  }, true);
  addChoice("Acheter Cotte de mailles (10 or, +3 DEF)", ()=>{
    if(state.gold>=10){ changeGold(-10); addItem(shopItems.chainMail.name,shopItems.chainMail.desc,shopItems.chainMail.mods); }
    else write("Pas assez d’or.","warn");
    continueBtn(eventBlackMarket);
  });
  addChoice("Vendre un objet (prix noir +1)", ()=>{
    if(!state.inventory.length){ write("Rien à vendre.","info"); return continueBtn(eventBlackMarket); }
    clearChoices(); write("Que veux-tu vendre ?");
    state.inventory.forEach((it,idx)=>{
      const val = priceOf(it)+1;
      addChoice(`${it.name} (+${val} or)`, ()=>{
        state.inventory.splice(idx,1); changeGold(val); setStats(); write("Vendu.","good"); continueBtn(eventBlackMarket);
      });
    });
    addChoice("Retour", eventBlackMarket);
  });
  addChoice("Partir", continueBtn);
}

function eventStoneCircle(){
  clearChoices();
  write("🪨 Un cercle de pierres résonne d’un bourdonnement sourd.");
  addChoice("Tenter un rituel (jet ESPRIT)", ()=>{
    const {total}=d20(state.attrs.WIS>=3?2:0);
    if(total>=15){ heal(rng.between(5,10)); write("Une chaleur t’enveloppe.","good"); }
    else { damage(rng.between(3,6),"Résonance"); }
    continueBtn();
  }, true);
  addChoice("Graver une offrande (2 or)", ()=>{
    if(state.gold>=2){ changeGold(-2); rep(+2); write("Les pierres semblent te reconnaître.","info"); }
    else write("Pas assez d’or.","warn");
    continueBtn();
  });
  addChoice("Partir", continueBtn);
}

function eventBridgeToll(){
  clearChoices();
  write("🌉 Un péage de fortune barre un vieux pont.");
  addChoice("Payer 2 or et passer", ()=>{
    if(state.gold>=2){ changeGold(-2); write("Le passeur hoche la tête.","info"); }
    else write("Pas assez d’or.","warn");
    continueBtn();
  }, true);
  addChoice("Refuser → combat", ()=>{ combat(mobEx('banditElite')); });
  addChoice("Tenter de négocier (jet ESPRIT)", ()=>{
    const {total}=d20(state.attrs.WIS>=3?2:0);
    if(total>=14){ write("Ils te laissent passer, amusés.","good"); rep(+1); }
    else { write("Ils se fâchent !","warn"); combat(mobEx('banditElite')); }
  });
}

function eventFair(){
  clearChoices();
  write("🎪 Une petite foire s’est installée : jeux, étals, bouffe.");
  addChoice("Jeu d’adresse (1 or) → gain 3-6 si réussite", ()=>{
    if(state.gold<1){ write("Pas assez d’or.","warn"); return continueBtn(eventFair); }
    changeGold(-1);
    const {total}=d20(state.attrs.AGI>=3?2:0);
    if(total>=14){ const g=rng.between(3,6); changeGold(g); write(`Tu gagnes ${g} or !`,"good"); }
    else write("Perdu…","warn");
    continueBtn(eventFair);
  }, true);
  addChoice("Acheter baume (3 or)", ()=>{
    if(state.gold>=3){ changeGold(-3); // consommer à l’usage
      addItem(shopItems.balm.name, shopItems.balm.desc, {heal:1});
    }else write("Pas assez d’or.","warn");
    continueBtn(eventFair);
  });
  addChoice("Manger un ragoût (2 or, +4 PV)", ()=>{
    if(state.gold>=2){ changeGold(-2); heal(4); }
    else write("Pas assez d’or.","warn");
    continueBtn(eventFair);
  });
  addChoice("Quitter la foire", continueBtn);
}

/* ---------- Mini-boss de zone (aléatoire rare) ---------- */
function maybeMiniBoss(){
  // 6% de chance après une exploration non-combat
  if(rng.rand()<0.06){
    write("…Tu sens une présence dangereuse proche.","warn");
    combat(mobEx('mireHag'));
    return true;
  }
  return false;
}

/* ---------- Patch : Marché du village étendu ---------- */
const _market_orig = typeof market==='function'? market : null;
function market(){
  clearChoices();
  write('🛒 Marché élargi : potions, équipements, utilitaires.');
  addChoice('Potion (4 or)', ()=>{
    if(state.gold>=4){ changeGold(-4); state.potions++; write('Potion ajoutée.','good'); }
    else write('Pas assez d’or.','warn');
    continueBtn(market);
  }, true);
  addChoice('Torche (5 or)', ()=>{
    if(state.flags.torch){ write('Tu as déjà une torche.','info'); }
    else if(state.gold>=5){ changeGold(-5); state.flags.torch=true; write('Torche achetée.','good'); }
    else write('Pas assez d’or.','warn');
    continueBtn(market);
  });
  addChoice('Bouclier de chêne (6 or, +1 DEF)', ()=>{
    if(state.gold>=6){ changeGold(-6); addItem(shopItems.oakShield.name, shopItems.oakShield.desc, shopItems.oakShield.mods); }
    else write('Pas assez d’or.','warn');
    continueBtn(market);
  });
  addChoice('Épée longue (9 or, +2 ATQ)', ()=>{
    if(state.gold>=9){ changeGold(-9); addItem(shopItems.longsword.name, shopItems.longsword.desc, shopItems.longsword.mods); }
    else write('Pas assez d’or.','warn');
    continueBtn(market);
  });
  addChoice('Cotte de mailles (10 or, +3 DEF)', ()=>{
    if(state.gold>=10){ changeGold(-10); addItem(shopItems.chainMail.name, shopItems.chainMail.desc, shopItems.chainMail.mods); }
    else write('Pas assez d’or.','warn');
    continueBtn(market);
  });
  addChoice('Vendre un objet', ()=>{
    if(!state.inventory.length){ write('Rien à vendre.','info'); return continueBtn(market); }
    clearChoices(); write('Que veux-tu vendre ?');
    state.inventory.forEach((it,idx)=>{
      const val=priceOf(it);
      addChoice(`${it.name} (+${val} or)`, ()=>{
        state.inventory.splice(idx,1); changeGold(val); setStats(); write('Vendu.','good'); continueBtn(market);
      });
    });
    addChoice('Retour', market);
  });
  addChoice('Aller au marché noir', eventBlackMarket);
  addChoice('Retour village', eventVillage);
}

/* ---------- Patch : Guilde étendue (contrats variés) ---------- */
const _guild_orig = typeof guildBoard==='function'? guildBoard : null;
function guildBoard(){
  clearChoices();
  write('📜 Guilde — nouveaux contrats :');
  addChoice('Chasser 1 ours (12 or)', ()=>{
    state.quests.board.push({type:'bear', need:1, got:0, reward:12});
    write('Contrat pris.','info'); continueBtn(eventVillage);
  }, true);
  addChoice('Chasser 2 squelettes (14 or)', ()=>{
    state.quests.board.push({type:'skeleton', need:2, got:0, reward:14});
    write('Contrat pris.','info'); continueBtn(eventVillage);
  });
  addChoice('Chasser 3 bandits (17 or)', ()=>{
    state.quests.board.push({type:'bandit', need:3, got:0, reward:17});
    write('Contrat pris.','info'); continueBtn(eventVillage);
  });
  addChoice('Retour village', eventVillage);
}

/* ---------- Patch : Village étendu (accès PNJ + foire) ---------- */
const _village_orig = typeof eventVillage==='function'? eventVillage : null;
function eventVillage(){
  clearChoices();
  write('🏘️ Village de Mirval (étendu).');
  addChoice('Marché', market, true);
  addChoice('Guilde (contrats)', guildBoard);
  addChoice('Prêtre (bénédiction)', eventPriest);
  addChoice('Érudit (fragments)', eventScholar);
  addChoice('Chasseur (leçons & dague)', eventHunter);
  addChoice('Foire', eventFair);
  addChoice('Herboriste', eventHerbalist);
  addChoice('Forgeron', eventSmith);
  addChoice('Quitter le village', ()=>explore(true));
}

/* ---------- Patch : Rencontres aléatoires plus denses ---------- */
const _randomEncounter_orig = typeof randomEncounter==='function'? randomEncounter : null;
function randomEncounter(){
  // 55% combat / 45% social (avec plus de variété)
  if(rng.rand()<0.55){
    // combats variés selon zone
    const z=state.locationKey;
    if(z==='marais'){
      return combat( rng.rand()<0.5 ? mobTemplates.ghoul() : mobEx('mireHag') );
    } else if(z==='ruines'){
      return combat( rng.rand()<0.5 ? mobEx('skeleton') : mobEx('cultist') );
    } else if(z==='colline'){
      return combat( rng.rand()<0.5 ? mobTemplates.harpy() : mobEx('bear') );
    } else if(z==='grotte'){
      return combat( rng.rand()<0.5 ? mobTemplates.ancientGhoul() : mobEx('skeleton') );
    } else {
      // clairière & défaut
      const pool=[mobTemplates.bandit(), mobTemplates.boar(), mobEx('sprite'), mobEx('bear')];
      return combat( pool[rng.between(0,pool.length-1)] );
    }
  } else {
    // PNJ/événements
    const socials=[eventSanctuary, eventHermit, eventBard, eventPriest, eventHunter, eventScholar, eventStoneCircle, eventBridgeToll];
    socials[rng.between(0,socials.length-1)]();
  }
}

/* ---------- Patch : AfterCombat — prise en compte des nouveaux contrats ---------- */
const _afterCombat_orig = typeof afterCombat==='function'? afterCombat : null;
const __afterCombat_ref = afterCombat;
afterCombat = function(){
  // d’abord marquer les contrats étendus
  if(state.quests.board?.length){
    const en = (state.enemy?.name||'').toLowerCase();
    state.quests.board.forEach(c=>{
      if((c.type==='bandit'   && en.includes('bandit')) ||
         (c.type==='wolf'     && en.includes('loup'))   ||
         (c.type==='bear'     && en.includes('ours'))   ||
         (c.type==='skeleton' && en.includes('squelette'))){
        c.got=(c.got||0)+1;
        if(c.got>=c.need){ changeGold(c.reward); c.done=true; write(`Contrat accompli ! +${c.reward} or`,'good'); }
      }
    });
    state.quests.board = state.quests.board.filter(c=>!c.done);
  }

  // puis exécuter la version de base
  __afterCombat_ref();
};

/* ---------- Patch léger : fouille améliore drop des fragments dans les ruines ---------- */
const _eventRuins_orig = typeof eventRuins==='function'? eventRuins : null;
function eventRuins(){
  clearChoices();
  write('🏚️ Ruines profondes (étendues).');
  addChoice('Fouiller avec prudence (ESPRIT)', ()=>{
    const {total}=d20(state.attrs.WIS>=3?2:0);
    if(total>=16){
      // priorité fragment si <3, sinon coffre
      if(state.flags.fragments<3 && rng.rand()<0.65){
        state.flags.fragments++; write('✨ Tu trouves un fragment d’artefact !','good');
        if(state.flags.fragments>=3){ state.flags.witchUnlocked=true; state.quests.witch.state='Prête : affronter la Sorcière'; write('🌫️ Les brumes frémissent…','info'); }
      } else { chest(); }
    } else if(total>=10){ chest(); }
    else { damage(rng.between(2,5),'Effondrement'); }
    continueBtn();
  }, true);
  addChoice('Explorer la crypte (risque)', ()=>{
    if(rng.rand()<0.6) combat( rng.rand()<0.5 ? mobEx('skeleton') : mobEx('cultist') );
    else { write('Couloir vide… mais tu restes sur tes gardes.','info'); maybeMiniBoss(); continueBtn(); }
  });
  addChoice('Partir', continueBtn);
}

/* ---------- Patch : explore — injecte plus d’options sociales quand il y en a peu ---------- */
const _explore_core = explore;
explore = function(initial=false){
  _explore_core(initial);
  // Si peu d’options sociales visibles, ajouter un bouton de secours pour PNJ
  try{
    const labels=[...document.querySelectorAll('#choices button')].map(b=>b.textContent);
    const hasSocial = labels.some(t=>/Herboriste|Forgeron|Barde|Ermite|Village|Prêtre|Érudit|Foire|Chasseur/i.test(t));
    if(!hasSocial){
      addChoice('Rencontrer quelqu’un', ()=>{
        // Choisir un PNJ aléatoire sûr
        [eventHerbalist, eventSmith, eventBard, eventPriest, eventScholar, eventHunter][rng.between(0,5)]();
      });
    }
  }catch(_){}
};
/* ============================================================
   Mirval v10 — VISUAL PACK (à coller à la fin de game.js)
   - Cartes SVG de lieux, PNJ, monstres (auto-générées)
   - Bannière de zone à l’arrivée
   - Cartes "Combat engagé" et "Victoire"
   - Ne modifie PAS le gameplay; patchs non-intrusifs
   ============================================================ */

/* ---------- 1) Helpers d’injection visuelle ---------- */
function vp_card(html){
  const wrap = document.createElement('div');
  wrap.className = 'vp-card';
  wrap.innerHTML = html;
  ui.log.appendChild(wrap);
  ui.log.scrollTop = ui.log.scrollHeight;
}
function vp_banner(title, subtitle, svg){
  vp_card(`
    <div class="vp-banner">
      <div class="vp-svg">${svg||''}</div>
      <div class="vp-banner-text">
        <div class="vp-title">${title}</div>
        ${subtitle?`<div class="vp-sub">${subtitle}</div>`:''}
      </div>
    </div>
  `);
}
function vp_row(svg, title, lines=[]){
  vp_card(`
    <div class="vp-row">
      <div class="vp-svg">${svg||''}</div>
      <div class="vp-row-text">
        <div class="vp-row-title">${title}</div>
        ${lines.length?`<div class="vp-row-sub">${lines.join('<br>')}</div>`:''}
      </div>
    </div>
  `);
}

/* ---------- 2) Générateurs SVG simples ---------- */
function vp_sceneSVG(kind){
  // Petits paysages stylisés cohérents par zone
  const g = {
    clairiere: `<svg viewBox="0 0 220 90" width="220" height="90"><rect width="220" height="90" fill="#0b1220"/><rect y="55" width="220" height="35" fill="#1b2a3d"/><circle cx="36" cy="30" r="16" fill="#60a5fa"/><rect x="140" y="40" width="8" height="24" fill="#374151"/><polygon points="144,18 130,40 158,40" fill="#4b5563"/></svg>`,
    marais: `<svg viewBox="0 0 220 90" width="220" height="90"><rect width="220" height="90" fill="#071017"/><rect y="60" width="220" height="30" fill="#0f1c24"/><circle cx="186" cy="20" r="12" fill="#94a3b8"/><ellipse cx="70" cy="73" rx="40" ry="6" fill="#12303a"/><ellipse cx="120" cy="77" rx="50" ry="7" fill="#0f2831"/></svg>`,
    colline: `<svg viewBox="0 0 220 90" width="220" height="90"><rect width="220" height="90" fill="#0e0f13"/><polygon points="0,80 60,40 120,80" fill="#233047"/><polygon points="80,80 150,35 220,80" fill="#293a56"/><circle cx="40" cy="20" r="10" fill="#f59e0b"/></svg>`,
    ruines: `<svg viewBox="0 0 220 90" width="220" height="90"><rect width="220" height="90" fill="#0b0e15"/><rect x="30" y="40" width="30" height="30" fill="#374151"/><rect x="60" y="40" width="10" height="30" fill="#1f2937"/><rect x="150" y="35" width="18" height="35" fill="#334155"/><rect x="168" y="35" width="6" height="35" fill="#1f2937"/></svg>`,
    grotte: `<svg viewBox="0 0 220 90" width="220" height="90"><rect width="220" height="90" fill="#0a0f18"/><circle cx="110" cy="45" r="40" fill="#0f1320"/><path d="M70 80 Q110 30 150 80 Z" fill="#1f2538"/></svg>`,
    village: `<svg viewBox="0 0 220 90" width="220" height="90"><rect width="220" height="90" fill="#0b1220"/><rect x="30" y="50" width="40" height="25" fill="#6b7280"/><polygon points="30,50 50,35 70,50" fill="#9ca3af"/><rect x="120" y="48" width="50" height="27" fill="#4b5563"/><polygon points="120,48 145,30 170,48" fill="#94a3b8"/></svg>`
  };
  return g[kind] || g.clairiere;
}
function vp_pnjSVG(type){
  const baseHead = `<circle cx="28" cy="18" r="10" fill="#cbd5e1"/><rect x="16" y="28" width="24" height="16" rx="4" fill="#94a3b8"/>`;
  const aura = type==='herboriste' ? `<circle cx="28" cy="18" r="13" fill="rgba(52,211,153,.18)"/>` :
               type==='forgeron'   ? `<circle cx="28" cy="18" r="13" fill="rgba(245,158,11,.18)"/>` :
               type==='ermite'     ? `<circle cx="28" cy="18" r="13" fill="rgba(96,165,250,.18)"/>` :
               type==='barde'      ? `<circle cx="28" cy="18" r="13" fill="rgba(236,72,153,.18)"/>` :
               `<circle cx="28" cy="18" r="13" fill="rgba(148,163,184,.18)"/>`;
  return `<svg viewBox="0 0 56 48" width="84" height="72"><rect width="56" height="48" rx="8" fill="#0f1422"/><rect width="56" height="48" rx="8" fill="none" stroke="#22304a"/><!-- aura -->${aura}<!-- corps -->${baseHead}</svg>`;
}
function vp_mobSVG(name){
  const palette = name.includes('Bandit')?['#2f354a','#ffbf46']:
                  name.includes('Goule') ?['#213139','#34d399']:
                  name.includes('Harpie')?['#1b1f35','#60a5fa']:
                  name.includes('Ours')  ?['#241b13','#f59e0b']:
                  name.includes('Sorcière')?['#13151f','#a78bfa']: ['#0f1320','#94a3b8'];
  return `<svg viewBox="0 0 120 72" width="160" height="96"><rect width="120" height="72" rx="10" fill="${palette[0]}"/><circle cx="36" cy="36" r="16" fill="${palette[1]}"/><rect x="62" y="28" width="38" height="16" rx="8" fill="#0b0e15"/></svg>`;
}

/* ---------- 3) Bannières automatiques de zone ---------- */
const _gotoZone_vp = typeof gotoZone==='function' ? gotoZone : null;
gotoZone = function(key){
  _gotoZone_vp ? _gotoZone_vp(key) : null;
  // Après changement de zone, afficher la bannière
  const label = key==='marais'?'Marais de Vire-Saule' :
                key==='clairiere'?'Clairière des Lys' :
                key==='colline'?'Colline de Rocfauve' :
                key==='ruines'?'Ruines Oubliées' :
                key==='grotte'?'Grotte Sépulcrale' : 'Lisière';
  vp_banner(label, `Jour ${state.day} — ${state.time}`, vp_sceneSVG(key));
};

/* Afficher une bannière au tout début de l’aventure */
const _startAdventure_vp = typeof startAdventure==='function' ? startAdventure : null;
startAdventure = function(){
  _startAdventure_vp && _startAdventure_vp();
  vp_banner(state.location, `Jour ${state.day} — ${state.time}`, vp_sceneSVG(state.locationKey));
};

/* ---------- 4) Visuals PNJ (hook des événements) ---------- */
function vp_wrapPNJ(pnjType, title, originalFn){
  return function(){
    vp_row(vp_pnjSVG(pnjType), title);
    originalFn();
  };
}
if(typeof eventHerbalist==='function') eventHerbalist = vp_wrapPNJ('herboriste','Herboriste', eventHerbalist);
if(typeof eventSmith==='function')      eventSmith      = vp_wrapPNJ('forgeron','Forgeron', eventSmith);
if(typeof eventHermit==='function')     eventHermit     = vp_wrapPNJ('ermite','Ermite', eventHermit);
if(typeof eventBard==='function')       eventBard       = vp_wrapPNJ('barde','Barde', eventBard);
if(typeof eventVillage==='function'){
  const _evVillage = eventVillage;
  eventVillage = function(){
    vp_banner('Village de Mirval','Marché • Guilde • Taverne', vp_sceneSVG('village'));
    _evVillage();
  };
}

/* ---------- 5) Cartes Combat (début / victoire) ---------- */
const _combat_vp = typeof combat==='function' ? combat : null;
combat = function(mon){
  vp_row(vp_mobSVG(mon.name), `⚔️ Combat — ${mon.name}`, [
    `PV ${mon.hp}`, `Armure ${mon.ac}`
  ]);
  _combat_vp(mon);
};
const _afterCombat_vp = typeof afterCombat==='function' ? afterCombat : null;
afterCombat = function(){
  const en = state.enemy ? state.enemy.name : 'ennemi';
  vp_row(vp_mobSVG(en), `✅ Victoire — ${en}`, [
    `Or +?`, `XP +?`
  ]);
  _afterCombat_vp();
};

/* ---------- 6) Visuals pour événements spéciaux ---------- */
if(typeof eventWitchGate==='function'){
  const _wg = eventWitchGate;
  eventWitchGate = function(){
    vp_banner('Portail des Brumes','Le voile s’ouvre…', vp_sceneSVG('marais'));
    _wg();
  };
}
/* ============================================================
   v10 — Death-lock Patch (à coller tout en bas de game.js)
   - Bloque toute action quand PV <= 0
   - Affiche uniquement "Recommencer"
   - Relance une partie propre sur restart
   ============================================================ */
(function(){
  // S'assure que le flag existe
  if (typeof state === 'object' && state) state.dead = !!state.dead;

  // On garde les originaux
  const _addChoice   = addChoice;
  const _exploreCore = explore;
  const _combatTurn  = typeof combatTurn === 'function' ? combatTurn : null;
  const _continueBtn = continueBtn;
  const _damage      = damage;

  // Empêche d'ajouter des boutons (sauf "Recommencer") si mort
  addChoice = function(label, cb, primary=false){
    if (state.dead && !/Recommencer|Restart|Rejouer/i.test(label)) return;
    _addChoice(label, cb, primary);
  };

  // Coupe l'exploration si mort
  explore = function(...args){
    if (state.dead) return;
    _exploreCore(...args);
  };

  // Coupe le tour de combat si mort
  if (_combatTurn) {
    const _combatTurnOrig = _combatTurn;
    combatTurn = function(...args){
      if (state.dead) return;
      _combatTurnOrig(...args);
    };
  }

  // "Continuer" devient "Recommencer" si mort
  continueBtn = function(next=()=>explore()){
    if (state.dead){
      clearChoices();
      _addChoice('Recommencer', ()=>{
        state = initialState();
        state.dead = false;
        clearLog();
        setup(true);
      }, true);
      return;
    }
    _continueBtn(next);
  };

  // Si on subit des dégâts fatals, on pose le flag dead
  damage = function(n, src=""){
    const died = _damage(n, src);    // appelle gameOver si hp <= 0 dans certaines versions
    if (state.hp <= 0) state.dead = true;
    return died;
  };

  // Redéfinit gameOver pour verrouiller totalement
  gameOver = function(){
    state.inCombat = false;
    state.dead = true;
    write('<b>☠️ Tu succombes…</b>', 'bad');
    clearChoices();
    _addChoice('Recommencer', ()=>{
      state = initialState();
      state.dead = false;
      clearLog();
      setup(true);
    }, true);
  };
})();
/* ============================================================
   v10 — Extra Mobs Encounter Patch
   - Rend les ennemis ajoutés (ours, squelette, sectateur, farfae,
     grondeuse des tourbières, bandit d’élite…) réellement rencontrables
   - Ajoute des boutons de combat directs par zone
   - Enrichit randomEncounter() pour piocher les nouveaux mobs
   - Garantit au moins 1 combat proposé si possible
   ============================================================ */
(function(){

  // 1) Assure la présence des générateurs d’ennemis étendus
  const _extraMobs = (typeof extraMobs!=='undefined' && extraMobs) ? extraMobs : {
    bear:        ()=>({ name:"Ours brun", hp:16, maxHp:16, ac:12, hitMod:4, tier:2 }),
    sprite:      ()=>({ name:"Farfae des lys", hp:9,  maxHp:9,  ac:14, hitMod:3, tier:1, dotChance:0.15, dotType:'bleed' }),
    skeleton:    ()=>({ name:"Squelette ancien", hp:14, maxHp:14, ac:13, hitMod:4, tier:2 }),
    cultist:     ()=>({ name:"Sectateur voilé", hp:15, maxHp:15, ac:12, hitMod:5, tier:3 }),
    mireHag:     ()=>({ name:"Grondeuse des tourbières", hp:20, maxHp:20, ac:13, hitMod:5, tier:3, dotChance:0.25, dotType:'poison' }),
    banditElite: ()=>({ name:"Bandit d’élite", hp:18, maxHp:18, ac:13, hitMod:5, tier:3 })
  };
  function mobEx(key){ return _extraMobs[key](); }

  // 2) Patch randomEncounter() pour inclure les nouveaux ennemis
  const _randomEncounter = (typeof randomEncounter==='function') ? randomEncounter : null;
  randomEncounter = function(){
    // 60% combat, 40% social/événement
    if(rng.rand()<0.6){
      const z = state.locationKey;
      if(z==='marais'){
        // marais : goules + grondeuse
        return combat( rng.rand()<0.6 ? mobTemplates.ghoul() : mobEx('mireHag') );
      } else if(z==='ruines'){
        // ruines : squelette / sectateur / bandit
        const pool=[mobEx('skeleton'), mobEx('cultist'), mobTemplates.bandit()];
        return combat( pool[rng.between(0,pool.length-1)] );
      } else if(z==='colline'){
        // colline : harpie / ours
        return combat( rng.rand()<0.5 ? mobTemplates.harpy() : mobEx('bear') );
      } else if(z==='grotte'){
        // grotte : goule ancienne / squelette
        return combat( rng.rand()<0.55 ? mobTemplates.ancientGhoul() : mobEx('skeleton') );
      } else {
        // clairière & défaut : bandit / sanglier / farfae / ours
        const pool=[mobTemplates.bandit(), mobTemplates.boar(), mobEx('sprite'), mobEx('bear')];
        return combat( pool[rng.between(0,pool.length-1)] );
      }
    } else {
      // Sinon, laisser l’existant gérer le social si présent
      if(_randomEncounter){ return _randomEncounter(); }
      // fallback social minimal si la version de base n’existe pas
      [eventSanctuary,eventHerbalist,eventSmith,eventHermit,eventBard][rng.between(0,4)]();
    }
  };

  // 3) Patch explore() pour injecter des combats directs par zone
  const _exploreCore = explore;
  explore = function(initial=false){
    _exploreCore(initial);

    // Lis les labels actuels pour éviter doublons
    const buttons = Array.from(document.querySelectorAll('#choices button')).map(b=>b.textContent);
    const hasDirectFight = buttons.some(t=>/Traquer|Affronter|Combattre|Trouver un combat/i.test(t));

    // Si aucune option de combat direct n’a été proposée, on en ajoute 1-2 selon la zone
    if(!hasDirectFight){
      const z = state.locationKey;
      if(z==='marais'){
        addChoice('Affronter une grondeuse des tourbières', ()=>combat(mobEx('mireHag')));
        addChoice('Traquer une goule', ()=>combat(mobTemplates.ghoul()));
      }
      else if(z==='ruines'){
        addChoice('Combattre un squelette ancien', ()=>combat(mobEx('skeleton')));
        addChoice('Affronter un sectateur voilé', ()=>combat(mobEx('cultist')));
      }
      else if(z==='colline'){
        addChoice('Chasser un ours', ()=>combat(mobEx('bear')));
        addChoice('Affronter une harpie', ()=>combat(mobTemplates.harpy()));
      }
      else if(z==='grotte'){
        addChoice('Affronter une goule ancienne', ()=>combat(mobTemplates.ancientGhoul()));
        addChoice('Combattre un squelette ancien', ()=>combat(mobEx('skeleton')));
      }
      else {
        // clairière / défaut
        addChoice('Affronter un bandit', ()=>combat(mobTemplates.bandit()));
        addChoice('Trouver un farfae', ()=>combat(mobEx('sprite')));
      }
    }

    // Secours : si, malgré tout, aucun bouton de combat n’est visible, injecter un bouton générique
    const stillNoFight = Array.from(document.querySelectorAll('#choices button'))
      .every(b => !/Traquer|Affronter|Combattre|Trouver un combat|Chasser/i.test(b.textContent));
    if(stillNoFight){
      addChoice('Trouver un combat (aléatoire)', ()=>{
        const pools = [
          mobTemplates.bandit(), mobTemplates.wolf?mobTemplates.wolf():mobTemplates.boar(),
          mobEx('bear'), mobEx('sprite'), mobEx('skeleton')
        ];
        combat(pools[rng.between(0,pools.length-1)]);
      });
    }
  };

  // 4) Mise à jour des contrats de guilde (si existants) pour reconnaître les nouveaux types
  if(typeof afterCombat==='function'){
    const _afterCombat = afterCombat;
    afterCombat = function(){
      // Marque les kills pour les contrats étendus
      if(state.quests?.board?.length){
        const en = (state.enemy?.name||'').toLowerCase();
        state.quests.board.forEach(c=>{
          if((c.type==='bandit'   && en.includes('bandit'))   ||
             (c.type==='wolf'     && en.includes('loup'))     ||
             (c.type==='bear'     && en.includes('ours'))     ||
             (c.type==='skeleton' && en.includes('squelette'))){
            c.got = (c.got||0)+1;
            if(c.got>=c.need){ changeGold(c.reward); c.done=true; write(`Contrat accompli ! +${c.reward} or`,'good'); }
          }
        });
        state.quests.board = state.quests.board.filter(c=>!c.done);
      }
      _afterCombat();
    };
  }

})();
/* ============================================================
   v10 — Patch Équipement + Rareté + Stats effectives
   - Rareté: commun/rare/épique/légendaire (multiplie les mods)
   - Slots: weapon, armor, offhand, boots, trinket
   - Gestion: équiper / retirer / comparer
   - Stats effectives: FOR/DEX/ESPRIT = base + bonus équipements
   - Auto-equip amélioré (puissance globale)
   - Les checks principaux utilisent les stats effectives
   ============================================================ */
(function(){
  /* ---------- 1) Raretés ---------- */
  const RARITY = [
    {key:'common',     label:'Commun',      mult:1.00, color:'#e5e7eb'},
    {key:'rare',       label:'Rare',        mult:1.20, color:'#60a5fa'},
    {key:'epic',       label:'Épique',      mult:1.40, color:'#a78bfa'},
    {key:'legendary',  label:'Légendaire',  mult:1.65, color:'#f59e0b'}
  ];
  function rollRarity(){
    const r = Math.random();
    if(r<0.70) return RARITY[0];
    if(r<0.90) return RARITY[1];
    if(r<0.98) return RARITY[2];
    return RARITY[3];
  }
  function modMult(v,m){ if(!v) return 0; return Math.max(1, Math.round(v*m)); }

  /* ---------- 2) Génération d’item avec slot & rareté ---------- */
  function makeItem(base){
    const rar = rollRarity();
    const mods = Object.assign({}, base.mods||{});
    const scaled = {
      atk: modMult(mods.atk, rar.mult),
      def: modMult(mods.def, rar.mult),
      STR: modMult(mods.STR, rar.mult),
      AGI: modMult(mods.AGI, rar.mult),
      WIS: modMult(mods.WIS, rar.mult),
      crit: mods.crit||0,
      evade: mods.evade||0
    };
    const name = `${base.name} (${rar.label})`;
    const desc = `${base.desc}${(scaled.STR||scaled.AGI||scaled.WIS)?` • +${scaled.STR||0} FOR / +${scaled.AGI||0} DEX / +${scaled.WIS||0} ESPRIT`:''}${scaled.atk?` • +${scaled.atk} ATQ`:''}${scaled.def?` • +${scaled.def} DEF`:''}`;
    return {name, desc, mods:scaled, slot:base.slot, rarity:rar.key, color:rar.color};
  }

  /* ---------- 3) Catalogue base (sans rareté) ---------- */
  const BASE_ITEMS = {
    // Armes
    'dague_fine':      {name:'Dague fine',       desc:'+1 ATQ, +1 DEX',        slot:'weapon', mods:{atk:1, AGI:1}},
    'epee_affutee':    {name:'Épée affûtée',     desc:'+1 ATQ',                slot:'weapon', mods:{atk:1}},
    'epee_longue':     {name:'Épée longue',      desc:'+2 ATQ, +1 FOR',        slot:'weapon', mods:{atk:2, STR:1}},
    // Armures
    'cuir_leg':        {name:'Armure de cuir',   desc:'+1 DEF, +1 DEX',        slot:'armor',  mods:{def:1, AGI:1}},
    'cuir_renforce':   {name:'Cuir renforcé',    desc:'+2 DEF',                slot:'armor',  mods:{def:2}},
    'cotte_mailles':   {name:'Cotte de mailles', desc:'+3 DEF, - (rien)',      slot:'armor',  mods:{def:3}},
    // Offhand
    'bouclier_chene':  {name:'Bouclier de chêne',desc:'+1 DEF',                slot:'offhand',mods:{def:1}},
    'bouclier_fer':    {name:'Bouclier en fer',  desc:'+2 DEF',                slot:'offhand',mods:{def:2}},
    // Bottes
    'bottes_vites':    {name:'Bottes véloces',   desc:'+1 DEX, +1 DEF',        slot:'boots',  mods:{AGI:1, def:1}},
    // Talisman
    'talisman_sages':  {name:'Talisman des sages', desc:'+2 ESPRIT',           slot:'trinket',mods:{WIS:2}},
    'talisman_force':  {name:'Talisman de force', desc:'+2 FOR',               slot:'trinket',mods:{STR:2}}
  };

  /* ---------- 4) Stats effectives (base + équipements) ---------- */
  function effectiveAttrs(){
    const sum = {STR:state.attrs.STR, AGI:state.attrs.AGI, WIS:state.attrs.WIS};
    const eqs = [state.equips?.weapon, state.equips?.armor, state.equips?.offhand, state.equips?.boots, state.equips?.trinket];
    eqs.forEach(it=>{
      if(!it||!it.mods) return;
      sum.STR += it.mods.STR||0;
      sum.AGI += it.mods.AGI||0;
      sum.WIS += it.mods.WIS||0;
    });
    return sum;
  }

  /* ---------- 5) Puissance d’un item pour auto-equip ---------- */
  function gearScore(it){
    if(!it||!it.mods) return 0;
    const eff = effectiveAttrs();
    // pondération simple : atk favorise FOR, def favorise DEX
    const s =
      (it.mods.atk||0)* (1 + Math.max(0, eff.STR-1)*0.25) +
      (it.mods.def||0)* (1 + Math.max(0, eff.AGI-1)*0.20) +
      (it.mods.STR||0)*0.9 + (it.mods.AGI||0)*0.9 + (it.mods.WIS||0)*0.9;
    return s;
  }

  /* ---------- 6) Auto-equip amélioré ---------- */
  const _autoEquip_prev = (typeof autoEquip==='function') ? autoEquip : null;
  function allItemsBySlot(slot){
    return state.inventory.filter(i=>i.slot===slot);
  }
  autoEquip = function(){
    // slots connus
    const candidates = {
      weapon: allItemsBySlot('weapon').sort((a,b)=>gearScore(b)-gearScore(a))[0]||null,
      armor:  allItemsBySlot('armor').sort((a,b)=>gearScore(b)-gearScore(a))[0]||null,
      offhand:allItemsBySlot('offhand').sort((a,b)=>gearScore(b)-gearScore(a))[0]||null,
      boots:  allItemsBySlot('boots').sort((a,b)=>gearScore(b)-gearScore(a))[0]||null,
      trinket:allItemsBySlot('trinket').sort((a,b)=>gearScore(b)-gearScore(a))[0]||null
    };
    state.equips = state.equips || {};
    Object.keys(candidates).forEach(slot=>{
      if(candidates[slot]) state.equips[slot] = candidates[slot];
    });
    if(_autoEquip_prev) _autoEquip_prev();
    setStats();
  };

  /* ---------- 7) Menu de gestion d’équipement ---------- */
  function manageGear(){
    clearChoices();
    const eff = effectiveAttrs();
    write(`🧰 <b>Équipement</b> — FOR ${eff.STR} • DEX ${eff.AGI} • ESPRIT ${eff.WIS}`,'info');

    function slotLine(slot, label){
      const cur = state.equips?.[slot];
      write(`<i>${label} :</i> ${cur?`<b style="color:${cur.color||'#e5e7eb'}">${cur.name}</b> — ${cur.desc}`:'—'}`);
      // Liste des objets disponibles pour ce slot
      const choices = state.inventory
        .map((it,i)=>({it, i}))
        .filter(o=>o.it.slot===slot);
      if(cur){
        addChoice(`↩️ Retirer ${label}`, ()=>{
          state.equips[slot]=null; write(`${label} retiré.`,'warn'); setStats(); manageGear();
        });
      }
      if(choices.length){
        choices.forEach(o=>{
          addChoice(`Équiper: ${o.it.name}`, ()=>{
            const before=state.equips[slot];
            state.equips[slot]=o.it;
            const sBefore=before?gearScore(before):0, sNew=gearScore(o.it);
            write(`${label}: ${before?before.name:'(vide)'} → <b style="color:${o.it.color||'#e5e7eb'}">${o.it.name}</b> (score ${sBefore.toFixed(1)} → ${sNew.toFixed(1)})`,'good');
            setStats(); manageGear();
          });
        });
      } else {
        addChoice(`Aucun objet pour ${label}`, ()=>manageGear());
      }
      addChoice('—', ()=>{}, false); // séparateur inert
    }

    slotLine('weapon','Arme');
    slotLine('armor','Armure');
    slotLine('offhand','Bouclier/Offhand');
    slotLine('boots','Bottes');
    slotLine('trinket','Talisman');

    addChoice('Auto-équiper (recommandé)', ()=>{ autoEquip(); write('Auto-équiper effectué.','info'); manageGear(); }, true);
    addChoice('Fermer', ()=>explore(true));
  }

  /* ---------- 8) Patch explore: ajoute “Gérer l’équipement” ---------- */
  const _explore_prev = explore;
  explore = function(initial=false){
    _explore_prev(initial);
    try{
      const labels=[...document.querySelectorAll('#choices button')].map(b=>b.textContent);
      if(!labels.some(t=>/Gérer l'équipement/i.test(t))){
        addChoice("Gérer l'équipement", manageGear);
      }
    }catch(_){}
  };

  /* ---------- 9) Stats effectives en combat & checks ---------- */
  // Remplace les fonctions combat pour utiliser les attrs effectives
  const _playerAtkMod_prev = (typeof playerAtkMod==='function') ? playerAtkMod : null;
  playerAtkMod = function(){
    const eff = effectiveAttrs();
    let m = 0;
    if(state.cls==='Guerrier') m+=2;
    if(eff.STR>=3) m+=1;
    // arme
    if(state.equips?.weapon?.mods?.atk) m+=state.equips.weapon.mods.atk;
    // bonus existants
    if(hasItem('Épée affûtée')) m+=1;
    if(_playerAtkMod_prev) m += 0; // rien à prendre
    // Talisman de force influence légèrement
    if(state.equips?.trinket?.mods?.STR) m += Math.floor((state.equips.trinket.mods.STR||0)/2);
    return m;
  };

  const _playerDef_prev = (typeof playerDef==='function') ? playerDef : null;
  playerDef = function(){
    const eff = effectiveAttrs();
    let d = 10;
    if(state.cls==='Paladin') d+=1;
    if(eff.AGI>=3) d+=1;
    // slots défensifs
    d += (state.equips?.armor?.mods?.def||0);
    d += (state.equips?.offhand?.mods?.def||0);
    d += (state.equips?.boots?.mods?.def||0);
    // anciens items “plats”
    if(hasItem('Petite armure')) d+=1;
    if(hasItem('Cuir renforcé')) d+=2;
    if(hasItem('Bouclier en fer')) d+=2;
    if(_playerDef_prev) d += 0;
    return d;
  };

  // d20Attr: helper pour checks (utilisé dans nos événements patchés)
  function d20Attr(attr, extra=0){
    const eff = effectiveAttrs();
    const bonus = (eff[attr]>=3 ? 1 : 0);
    return d20(extra + bonus);
  }

  /* ---------- 10) Loot & Shop: génèrent des versions rares ---------- */
  // Patch coffre
  const _chest_prev = (typeof chest==='function') ? chest : null;
  chest = function(){
    // 50% objet, 30% or, 20% piège
    const r = rng.between(1,100);
    if(r>50){
      // Choisir une famille selon zone
      const z = state.locationKey;
      let keyPool = [];
      if(z==='marais' || z==='grotte'){ keyPool = ['cuir_renforce','bouclier_chene','talisman_sages']; }
      else if(z==='ruines'){ keyPool = ['cotte_mailles','bouclier_fer','talisman_force']; }
      else if(z==='colline'){ keyPool = ['bottes_vites','epee_longue','cuir_renforce']; }
      else { keyPool = ['dague_fine','epee_affutee','cuir_leg']; }
      const k = keyPool[rng.between(0,keyPool.length-1)];
      const item = makeItem(BASE_ITEMS[k]);
      addItem(item.name, item.desc, Object.assign({},
        item.mods,{/* garder slot & rarity */}));
      // On doit conserver slot/rarity sur l'objet stocké
      state.inventory[state.inventory.length-1].slot = BASE_ITEMS[k].slot;
      state.inventory[state.inventory.length-1].rarity = item.rarity;
      state.inventory[state.inventory.length-1].color = item.color;
      autoEquip();
    } else if(r>20){
      changeGold(rng.between(7,15));
    } else {
      write('💥 Piège !','bad'); damage(rng.between(3,6),'Piège');
    }
  };

  // Patch marché (si existe) : vend des versions rares
  if(typeof market==='function'){
    const _market_prev = market;
    market = function(){
      _market_prev();
      // Injecter une section “Équipement (qualité variable)”
      addChoice('Équipement (qualité variable)', ()=>{
        clearChoices(); write('🛒 Équipement :', 'info');
        const offerKeys = ['dague_fine','epee_longue','cuir_renforce','cotte_mailles','bouclier_fer','bottes_vites','talisman_sages','talisman_force'];
        offerKeys.forEach(k=>{
          const base = BASE_ITEMS[k];
          const it = makeItem(base);
          const price = 4 + (it.mods.atk||0)*2 + (it.mods.def||0)*2 + (it.mods.STR||0) + (it.mods.AGI||0) + (it.mods.WIS||0);
          addChoice(`${it.name} — ${it.desc} (${price} or)`, ()=>{
            if(state.gold>=price){
              changeGold(-price);
              // stocker en conservant slot/rarity/couleur
              addItem(it.name, it.desc, it.mods);
              const si = state.inventory[state.inventory.length-1];
              si.slot=base.slot; si.rarity=it.rarity; si.color=it.color;
              autoEquip(); write('Achat effectué.','good');
            } else write('Pas assez d’or.','warn');
            continueBtn(market);
          });
        });
        addChoice('Retour marché', market, true);
      });
    };
  }

  /* ---------- 11) Événements clés ⇒ checks avec stats effectives ---------- */
  // Remplace quelques événements pour utiliser d20Attr()
  if(typeof eventRuins==='function'){
    const _ru = eventRuins;
    eventRuins = function(){
      clearChoices();
      write('🏚️ Ruines (prise en compte ESPRIT effectif).');
      addChoice('Fouiller prudemment', ()=>{
        const {total}=d20Attr('WIS', 1);
        if(total>=16){
          if(state.flags.fragments<3 && rng.rand()<0.65){
            state.flags.fragments++; write('✨ Fragment d’artefact !','good');
          }else{ chest(); }
        }else if(total>=10){ chest(); }
        else { damage(rng.between(2,5),'Éboulement'); }
        continueBtn();
      }, true);
      addChoice('Partir', continueBtn);
    };
  }
  if(typeof eventPeasant==='function'){
    const _ep = eventPeasant;
    eventPeasant = function(){
      clearChoices();
      write('🧑‍🌾 Un paysan enchaîné appelle à l’aide.');
      addChoice('Le libérer (FOR)', ()=>{
        const {total}=d20Attr('STR', 1);
        if(total>=14){
          write('Les chaînes cèdent.','good'); rep(+5); state.flags.peasantSaved=true;
          state.quests.side.push({title:'Le paysan reconnaissant',state:'En attente'});
        }else{ damage(rng.between(1,4),'Effort'); }
        continueBtn();
      }, true);
      addChoice('L’ignorer', ()=>{ rep(-3); continueBtn(); });
    };
  }
  if(typeof eventBridgeToll==='function'){
    const _br = eventBridgeToll;
    eventBridgeToll = function(){
      clearChoices();
      write("🌉 Péage de fortune sur un vieux pont.");
      addChoice("Payer 2 or et passer", ()=>{
        if(state.gold>=2){ changeGold(-2); write("Le passeur hoche la tête.","info"); }
        else write("Pas assez d’or.","warn");
        continueBtn();
      }, true);
      addChoice("Refuser → combat", ()=>{ combat(extraMobs?.banditElite ? extraMobs.banditElite() : {name:"Bandit d’élite",hp:18,maxHp:18,ac:13,hitMod:5,tier:3}); });
      addChoice("Négocier (ESPRIT)", ()=>{
        const {total}=d20Attr('WIS', 1);
        if(total>=14){ write("Ils te laissent passer, amusés.","good"); rep(+1); continueBtn(); }
        else { write("Ils se fâchent !","warn"); combat(extraMobs?.banditElite ? extraMobs.banditElite() : {name:"Bandit d’élite",hp:18,maxHp:18,ac:13,hitMod:5,tier:3}); }
      });
    };
  }

  /* ---------- 12) Mise à jour setStats pour refléter le bonus équip ---------- */
  const _setStats_prev = setStats;
  setStats = function(){
    _setStats_prev();
    try{
      // Afficher un petit résumé équips dans le log une fois par zone
      if(!state._eqStampShown){
        const eq = state.equips||{};
        const eff = effectiveAttrs();
        write(`⚙️ Équips: ${eq.weapon?eq.weapon.name:'(arme —)'} • ${eq.armor?eq.armor.name:'(armure —)'} • ${eq.offhand?eq.offhand.name:'(offhand —)'} • ${eq.boots?eq.boots.name:'(bottes —)'} • ${eq.trinket?eq.trinket.name:'(talisman —)'}<br>FOR ${eff.STR} • DEX ${eff.AGI} • ESPRIT ${eff.WIS}`,'meta');
        state._eqStampShown = true;
        setTimeout(()=>{ state._eqStampShown=false; }, 1500);
      }
    }catch(_){}
  };

  /* ---------- 13) Intégration douce avec autoEquip initial ---------- */
  // Au tout début d’une partie ou après loot/achat, on peut auto-équiper
  if(!state.equips) state.equips = {weapon:null,armor:null,offhand:null,boots:null,trinket:null};
  // Essai d’auto-equip si pas d’arme équipée mais inventaire existant
  setTimeout(()=>{ try{ if(!state.equips.weapon && state.inventory?.length) autoEquip(); }catch(_){} }, 50);

})();
/* ============================================================
   Correctif v10 — Stats effectives + combat ours
   ============================================================ */
(function(){

  // --- 1) Forcer l’UI à afficher les stats effectives ---
  const _setStats_prev = setStats;
  setStats = function(){
    _setStats_prev();
    try{
      const eff = effectiveAttrs();
      ui.astr.textContent = eff.STR;
      ui.aagi.textContent = eff.AGI;
      ui.awis.textContent = eff.WIS;
    }catch(e){ console.error("Erreur setStats eff:", e); }
  };

  // --- 2) Corriger les combats (ours et cie) ---
  if(typeof extraMobs!=='undefined'){
    if(!extraMobs.bear){
      extraMobs.bear = ()=>({name:"Ours colossal",hp:20,maxHp:20,ac:13,hitMod:4,tier:3});
    }
  }

  // Injecter dans l’exploration : zone colline → ours possible
  const _explore_prev = explore;
  explore = function(initial=false){
    _explore_prev(initial);

    try{
      if(state.locationKey==='colline'){
        const labels=[...document.querySelectorAll('#choices button')].map(b=>b.textContent);
        if(!labels.some(t=>/Ours colossal/i.test(t))){
          addChoice("Combattre un Ours colossal", ()=>combat(extraMobs.bear()));
        }
      }
    }catch(e){ console.error("Erreur injection ours:",e); }
  };

})();
/* ============================================================
   Mirval v10 — PACK ÉQUIPEMENT 2.0
   À COLLER TOUT EN BAS DE game.js (après tout le reste)
   - Stats effectives (FOR/DEX/ESPRIT) = base + équipements
   - Emplacements: weapon, armor, offhand, boots, trinket
   - Gestion: équiper / retirer / auto-équiper / comparer
   - UI forcée sur stats effectives
   - Rareté simple (Common/Rare/Epic/Legendary)
   - WITHOUT save/load; 100% compatible avec les versions précédentes
   ============================================================ */
(function(){

  /* ---------- 0) Préparation état ---------- */
  if(!state.equips) state.equips = {weapon:null, armor:null, offhand:null, boots:null, trinket:null};

  /* ---------- 1) Rareté (facultative mais utile) ---------- */
  const RARITY = [
    {key:'common',     label:'Commun',      mult:1.00, color:'#e5e7eb'},
    {key:'rare',       label:'Rare',        mult:1.20, color:'#60a5fa'},
    {key:'epic',       label:'Épique',      mult:1.40, color:'#a78bfa'},
    {key:'legendary',  label:'Légendaire',  mult:1.65, color:'#f59e0b'}
  ];
  function rollRarity(){
    const r = Math.random();
    if(r<0.70) return RARITY[0];
    if(r<0.90) return RARITY[1];
    if(r<0.98) return RARITY[2];
    return RARITY[3];
  }
  function scale(v,m){ return v?Math.max(1, Math.round(v*m)):0; }

  /* ---------- 2) Catalogue simple pour fabrication ---------- */
  const BASE_ITEMS = {
    // Armes
    'dague_fine':   {name:'Dague fine',       slot:'weapon', mods:{atk:1, AGI:1}, desc:'+1 ATQ, +1 DEX'},
    'epee_affutee': {name:'Épée affûtée',     slot:'weapon', mods:{atk:1},        desc:'+1 ATQ'},
    'epee_longue':  {name:'Épée longue',      slot:'weapon', mods:{atk:2, STR:1}, desc:'+2 ATQ, +1 FOR'},
    // Armures
    'cuir_leg':     {name:'Armure de cuir',   slot:'armor',  mods:{def:1, AGI:1}, desc:'+1 DEF, +1 DEX'},
    'cuir_renf':    {name:'Cuir renforcé',    slot:'armor',  mods:{def:2},        desc:'+2 DEF'},
    'cotte_maille': {name:'Cotte de mailles', slot:'armor',  mods:{def:3},        desc:'+3 DEF'},
    // Offhand
    'bouclier_ch':  {name:'Bouclier de chêne',slot:'offhand',mods:{def:1},        desc:'+1 DEF'},
    'bouclier_fer': {name:'Bouclier en fer',  slot:'offhand',mods:{def:2},        desc:'+2 DEF'},
    // Bottes
    'bottes_vit':   {name:'Bottes véloces',   slot:'boots',  mods:{AGI:1, def:1}, desc:'+1 DEX, +1 DEF'},
    // Talisman
    'tal_sages':    {name:'Talisman des sages',slot:'trinket',mods:{WIS:2},       desc:'+2 ESPRIT'},
    'tal_force':    {name:'Talisman de force', slot:'trinket',mods:{STR:2},       desc:'+2 FOR'}
  };

  function craftItem(baseKey){
    const base = BASE_ITEMS[baseKey];
    if(!base) return null;
    const rar = rollRarity();
    const mods = base.mods || {};
    const scaled = {
      atk: scale(mods.atk, rar.mult),
      def: scale(mods.def, rar.mult),
      STR: scale(mods.STR, rar.mult),
      AGI: scale(mods.AGI, rar.mult),
      WIS: scale(mods.WIS, rar.mult)
    };
    const name = `${base.name} (${rar.label})`;
    const lines = [];
    if(scaled.atk) lines.push(`+${scaled.atk} ATQ`);
    if(scaled.def) lines.push(`+${scaled.def} DEF`);
    if(scaled.STR) lines.push(`+${scaled.STR} FOR`);
    if(scaled.AGI) lines.push(`+${scaled.AGI} DEX`);
    if(scaled.WIS) lines.push(`+${scaled.WIS} ESPRIT`);
    const desc = (base.desc||'') + (lines.length?` • ${lines.join(' • ')}`:'');
    return {name, desc, slot:base.slot, mods:scaled, rarity:rar.key, color:rar.color};
  }

  /* ---------- 3) Stats effectives ---------- */
  function effectiveAttrs(){
    const out = {STR:state.attrs.STR, AGI:state.attrs.AGI, WIS:state.attrs.WIS};
    const eq = state.equips||{};
    ['weapon','armor','offhand','boots','trinket'].forEach(s=>{
      const it = eq[s];
      if(it && it.mods){
        out.STR += it.mods.STR||0;
        out.AGI += it.mods.AGI||0;
        out.WIS += it.mods.WIS||0;
      }
    });
    return out;
  }

  /* ---------- 4) Affichage UI forcé sur effectif ---------- */
  const _setStats_base = setStats;
  setStats = function(){
    _setStats_base();
    try{
      const eff = effectiveAttrs();
      ui.astr.textContent = eff.STR;
      ui.aagi.textContent = eff.AGI;
      ui.awis.textContent = eff.WIS;
    }catch(e){}
  };

  /* ---------- 5) Combat utilise les stats effectives ---------- */
  const _playerAtkMod_base = (typeof playerAtkMod==='function') ? playerAtkMod : ()=>0;
  playerAtkMod = function(){
    const eff = effectiveAttrs();
    let m = 0;
    if(state.cls==='Guerrier') m += 2;
    if(eff.STR>=3) m += 1;
    // bonus d’équipement (arme principale)
    if(state.equips?.weapon?.mods?.atk) m += state.equips.weapon.mods.atk;
    // bonus “anciens” objets plats (compat)
    if(hasItem && hasItem('Épée affûtée')) m += 1;
    return m + (_playerAtkMod_base?0:0);
  };

  const _playerDef_base = (typeof playerDef==='function') ? playerDef : ()=>10;
  playerDef = function(){
    const eff = effectiveAttrs();
    let d = 10;
    if(state.cls==='Paladin') d += 1;
    if(eff.AGI>=3) d += 1;
    // cumul DEF des slots
    d += (state.equips?.armor?.mods?.def||0);
    d += (state.equips?.offhand?.mods?.def||0);
    d += (state.equips?.boots?.mods?.def||0);
    // compat ancien inventaire plat
    if(hasItem && hasItem('Petite armure')) d+=1;
    if(hasItem && hasItem('Cuir renforcé')) d+=2;
    if(hasItem && hasItem('Bouclier en fer')) d+=2;
    return d;
  };

  /* ---------- 6) Ajouter proprement un item “équipable” ---------- */
  function addEquipItem(baseKey){
    const it = craftItem(baseKey);
    if(!it) return null;
    // On réutilise addItem pour l’UI, puis on enrichit l’entrée stockée
    addItem(it.name, it.desc);
    const ref = state.inventory[state.inventory.length-1];
    ref.slot   = it.slot;
    ref.mods   = it.mods;
    ref.rarity = it.rarity;
    ref.color  = it.color;
    return ref;
  }

  /* ---------- 7) Score d’un item & auto-équiper ---------- */
  function gearScore(it){
    if(!it||!it.mods) return 0;
    const eff = effectiveAttrs();
    // pondération simple, robuste
    return (it.mods.atk||0) * (1 + Math.max(0,eff.STR-1)*0.25)
         + (it.mods.def||0) * (1 + Math.max(0,eff.AGI-1)*0.20)
         + (it.mods.STR||0)*0.9 + (it.mods.AGI||0)*0.9 + (it.mods.WIS||0)*0.9;
  }
  function bestOfSlot(slot){
    return state.inventory.filter(i=>i.slot===slot).sort((a,b)=>gearScore(b)-gearScore(a))[0]||null;
  }
  function autoEquip(){
    state.equips = state.equips || {};
    ['weapon','armor','offhand','boots','trinket'].forEach(slot=>{
      const best = bestOfSlot(slot);
      if(best) state.equips[slot]=best;
    });
    setStats();
  }

  /* ---------- 8) Menu de gestion d’équipement ---------- */
  function manageGear(){
    clearChoices();
    const eff = effectiveAttrs();
    write(`🧰 <b>Équipement</b> — FOR ${eff.STR} • DEX ${eff.AGI} • ESPRIT ${eff.WIS}`,'info');

    function slotUI(slot,label){
      const cur = state.equips?.[slot];
      write(`<i>${label} :</i> ${cur?`<b style="color:${cur.color||'#e5e7eb'}">${cur.name}</b> — ${cur.desc}`:'(aucun)'}`);
      if(cur){
        addChoice(`↩️ Retirer ${label}`, ()=>{
          state.equips[slot]=null; write(`${label} retiré.`,'warn'); setStats(); manageGear();
        });
      }
      const choices = state.inventory.map((it,i)=>({it,i})).filter(o=>o.it.slot===slot);
      choices.forEach(o=>{
        addChoice(`Équiper: ${o.it.name}`, ()=>{
          const before = state.equips[slot];
          state.equips[slot] = o.it;
          const sBefore = before?gearScore(before):0, sNew=gearScore(o.it);
          write(`${label}: ${before?before.name:'(vide)'} → <b style="color:${o.it.color||'#e5e7eb'}">${o.it.name}</b> (score ${sBefore.toFixed(1)} → ${sNew.toFixed(1)})`,'good');
          setStats(); manageGear();
        });
      });
      if(!choices.length) addChoice(`Aucun objet pour ${label}`, ()=>manageGear());
      addChoice('—', ()=>{}, false);
    }

    slotUI('weapon','Arme');
    slotUI('armor','Armure');
    slotUI('offhand','Bouclier/Offhand');
    slotUI('boots','Bottes');
    slotUI('trinket','Talisman');

    addChoice('Auto-équiper', ()=>{ autoEquip(); write('Auto-équiper effectué.','info'); manageGear(); }, true);
    addChoice('Fermer', ()=>explore(true));
  }

  /* ---------- 9) Injection du bouton d’accès ---------- */
  const _explore_core = explore;
  explore = function(initial=false){
    _explore_core(initial);
    try{
      const labels=[...document.querySelectorAll('#choices button')].map(b=>b.textContent);
      if(!labels.some(t=>/Gérer l'équipement/i.test(t))){
        addChoice("Gérer l'équipement", manageGear);
      }
    }catch(_){}
  };

  /* ---------- 10) Donner des objets “équipables” via coffre/forgeron (compat) ---------- */
  // Cofres : si chest() existe, on l’enrichit légèrement
  if(typeof chest==='function'){
    const _chest_prev = chest;
    chest = function(){
      const roll = rng.between(1,100);
      if(roll>60){ // 40% chance d’équipement
        const poolsByZone = {
          marais:   ['cuir_renf','bouclier_ch','tal_sages'],
          grotte:   ['cotte_maille','bouclier_fer','tal_force'],
          ruines:   ['cotte_maille','bouclier_fer','epee_longue'],
          colline:  ['bottes_vit','epee_longue','cuir_renf'],
          clairiere:['dague_fine','epee_affutee','cuir_leg']
        };
        const z = state.locationKey || 'clairiere';
        const pool = poolsByZone[z] || poolsByZone.clairiere;
        const key = pool[rng.between(0,pool.length-1)];
        const got = addEquipItem(key);
        if(got) write(`Tu obtiens <b style="color:${got.color}">${got.name}</b>.`,'good');
        autoEquip();
      } else {
        _chest_prev();
      }
    };
  }
  // Forgeron : si eventSmith() existe, on lui ajoute une option “équipement de qualité”
  if(typeof eventSmith==='function'){
    const _smith_prev = eventSmith;
    eventSmith = function(){
      _smith_prev();
      addChoice('Acheter (qualité variable)', ()=>{
        clearChoices(); write('⚒️ Forgeron — Qualité variable :', 'info');
        const offers = ['epee_longue','cotte_maille','bouclier_fer','bottes_vit'];
        offers.forEach(k=>{
          const it = craftItem(k);
          const price = 5 + (it.mods.atk||0)*2 + (it.mods.def||0)*2 + (it.mods.STR||0) + (it.mods.AGI||0) + (it.mods.WIS||0);
          addChoice(`${it.name} — ${it.desc} (${price} or)`, ()=>{
            if(state.gold>=price){
              changeGold(-price);
              const ref = addEquipItem(k); // on refabrique pour garder même slot
              // Remplacer par l’objet crafté (mêmes mods/rarity/color)
              if(ref){
                ref.name  = it.name;
                ref.desc  = it.desc;
                ref.mods  = it.mods;
                ref.rarity= it.rarity;
                ref.color = it.color;
              }
              autoEquip(); write('Achat effectué.','good');
            } else write('Pas assez d’or.','warn');
            continueBtn(eventSmith);
          });
        });
        addChoice('Retour', eventSmith, true);
      });
    };
  }

  /* ---------- 11) Initialisation douce ---------- */
  // Si aucune arme équipée mais inventaire présent, tenter un auto-équiper après boot
  setTimeout(()=>{ try{ if(!state.equips.weapon && state.inventory?.length) autoEquip(); }catch(_){ } }, 80);

})();
/* ============================================================
   Mirval v10 — Patch Stats Dynamiques (complément Pack Équipement 2.0)
   ============================================================ */
(function(){

  // Sauvegarder anciennes valeurs pour comparer
  let prevStats = {STR:state.attrs.STR, AGI:state.attrs.AGI, WIS:state.attrs.WIS};

  const _setStats_equips = setStats;
  setStats = function(){
    _setStats_equips();
    try{
      const eff = effectiveAttrs();
      ['STR','AGI','WIS'].forEach(stat=>{
        const oldVal = prevStats[stat]||0;
        const newVal = eff[stat];
        const uiEl = (stat==='STR')?ui.astr:(stat==='AGI')?ui.aagi:ui.awis;

        if(newVal>oldVal){
          uiEl.textContent = newVal;
          uiEl.style.color = '#22c55e'; // vert
          write(`+${newVal-oldVal} ${stat} (total: ${newVal})`,'good');
        } else if(newVal<oldVal){
          uiEl.textContent = newVal;
          uiEl.style.color = '#ef4444'; // rouge
          write(`${newVal-oldVal} ${stat} (total: ${newVal})`,'bad');
        } else {
          uiEl.textContent = newVal;
          uiEl.style.color = '#e5e7eb'; // neutre
        }
        prevStats[stat] = newVal;
      });
    }catch(e){ console.error("Erreur stats dynamiques:", e); }
  };

})();
if (typeof state.flags.brumeFragments === 'undefined') {
  state.flags.brumeFragments = 0; // Compteur pour fragments de brume
}
if (zone==='marais' && rng.rand() < 0.25) {
  state.flags.brumeFragments++;
  write("🌫️ Tu trouves un Fragment de brume.", "good");
}
const bq = document.createElement('div');
bq.className='stat';
bq.innerHTML = `<b>Fragments de brume</b><span>${state.flags.brumeFragments}/3</span>`;
ui.quests.appendChild(bq);
if (state.flags.brumeFragments >= 3) {
  addChoice("→ Antre de la Sorcière des Brumes", ()=>bossSorciere());
}
/* ============================================================
   v10 — PATCH "Fragments de brume" (Option 2, prêt à coller)
   - Ajoute une ressource distincte: state.flags.brumeFragments
   - Affichage dédié "Fragments de brume (x/3)" dans la section Quêtes
   - Drop en MARAIS (combat & fouille), avec chances configurées
   - L’accès à la Sorcière des Brumes (portail) dépend de brumeFragments
   - Ne modifie pas les "Fragments d’artefact" (toujours pour la Crypte)
   ============================================================ */
(function(){
  /* ---------- 1) Initialisation état ---------- */
  if(!state.flags) state.flags = {};
  if(typeof state.flags.brumeFragments!=='number') state.flags.brumeFragments = 0;
  if(!state.quests) state.quests = {};
  // Mini-structure de suivi (non bloquante si tu as déjà un champ witch)
  if(!state.quests.brume){
    state.quests.brume = { title:'Fragments de brume', state:'(0/3) — Marais' };
  }

  /* ---------- 2) Aide format ---------- */
  function brumeProgressLabel(){
    const n = state.flags.brumeFragments|0;
    return `Fragments de brume (${n}/3)`;
  }

  /* ---------- 3) Affichage Quêtes : injecter/mettre à jour la ligne "Fragments de brume" ---------- */
  const _setStats = (typeof setStats==='function')? setStats : null;
  if(_setStats){
    setStats = function(){
      _setStats();
      try{
        // Retirer ancien "bloc brume" s’il existe
        const old = document.getElementById('quest-brume-line');
        if(old && old.parentNode) old.parentNode.removeChild(old);

        // Injecter une ligne dédiée en tête des quêtes
        if(ui && ui.quests){
          const wrap = document.createElement('div');
          wrap.className = 'stat';
          wrap.id = 'quest-brume-line';
          const ready = state.flags.brumeFragments>=3 ? 'Prêt : Portail des Brumes' : 'Marais (combat/fouille)';
          wrap.innerHTML = `<b>${brumeProgressLabel()}</b><span>${ready}</span>`;
          // L’insérer juste après la première ligne existante de quêtes si possible
          if(ui.quests.firstChild){
            ui.quests.insertBefore(wrap, ui.quests.firstChild.nextSibling || ui.quests.firstChild);
          }else{
            ui.quests.appendChild(wrap);
          }
        }
      }catch(_){}
    };
  }

  /* ---------- 4) Drop des Fragments de brume en MARAIS ---------- */
  // 4a) En combat (après un combat gagné en MARAIS, ennemis du marais)
  const _afterCombat = (typeof afterCombat==='function')? afterCombat : null;
  if(_afterCombat){
    afterCombat = function(){
      const wasEnemy = state.enemy ? (state.enemy.name||'').toLowerCase() : '';
      const inMarsh  = state.locationKey==='marais';
      const canGain  = state.flags.brumeFragments < 3;
      // Appel original (récompenses, or, xp, etc.)
      _afterCombat();

      try{
        if(inMarsh && canGain){
          // Chance de drop si l’ennemi est "marécageux" (goule/…)
          const marshy = /goule|tourbi|brume|marais/.test(wasEnemy);
          const pct = marshy ? 0.45 : 0.22; // 45% si cible marécageuse, sinon 22%
          if(Math.random() < pct){
            state.flags.brumeFragments++;
            write(`✨ Un fragment de brume s’agrège autour de toi. (${state.flags.brumeFragments}/3)`,'good');
            if(state.flags.brumeFragments>=3){
              write('🌫️ Les brumes s’éveillent… Un portail pourrait répondre à ton appel dans le Marais.','info');
            }
            setStats();
          }
        }
      }catch(_){}
    };
  }

  // 4b) En fouille (searchArea) quand on est dans le MARAIS
  const _searchArea = (typeof searchArea==='function')? searchArea : null;
  if(_searchArea){
    searchArea = function(){
      const wasMarsh = state.locationKey==='marais';
      _searchArea();
      try{
        if(wasMarsh && state.flags.brumeFragments<3){
          // Petite chance passive lors d’une fouille réussie (pour éviter la dèche)
          const p = 0.18; // 18%
          if(Math.random() < p){
            state.flags.brumeFragments++;
            write(`🌫️ Des feux-follets te guident vers un fragment de brume. (${state.flags.brumeFragments}/3)`,'good');
            if(state.flags.brumeFragments>=3){
              write('🌘 Un murmure parcourt les roseaux : "Le chemin vers Elle s’ouvre…"','info');
            }
            setStats();
          }
        }
      }catch(_){}
    };
  }

  /* ---------- 5) Accès à la Sorcière des Brumes = dépend de brumeFragments ---------- */
  // 5a) Le bouton d’accès dans l’exploration (si tu le crées dynamiquement en Marais)
  const _explore = (typeof explore==='function')? explore : null;
  if(_explore){
    explore = function(initial=false){
      _explore(initial);
      try{
        if(state.locationKey==='marais'){
          const buttons = Array.from(document.querySelectorAll('#choices button')).map(b=>b.textContent);
          const hasGateBtn = buttons.some(t=>/Brumes|Sorcière|Antre|Portail/i.test(t));
          // S’il n’y a pas déjà un bouton vers l’antre, on injecte le bon état
          if(!hasGateBtn){
            if(state.flags.brumeFragments>=3){
              addChoice('→ Antre des Brumes (Sorcière)', ()=>{
                if(typeof eventWitchGate==='function'){ eventWitchGate(); }
                else if(typeof combatWitch==='function'){ combatWitch(); }
                else { write("Le voile s’entrouvre, mais tu n’as pas de prise… (fonction manquante)",'warn'); }
              });
            }else{
              addChoice(`Brumes instables — ${brumeProgressLabel()}`, ()=>{
                write('Il te manque des fragments de brume. On en trouve surtout en Marais (combats/fouille).','info');
                continueBtn(()=>explore());
              });
            }
          }
        }
      }catch(_){}
    };
  }

  // 5b) Sécuriser eventWitchGate() pour qu’il refuse l’accès si <3 fragments
  if(typeof eventWitchGate==='function'){
    const _wg = eventWitchGate;
    eventWitchGate = function(){
      if(state.flags.brumeFragments>=3){
        _wg();
      }else{
        write('🌫️ Les brumes te repoussent. Il te faut encore des fragments de brume (3 requis).','warn');
        continueBtn(()=>explore());
      }
    };
  }
  if(typeof combatWitch==='function'){
    // Facultatif : on autorise quand même combatWitch si quelqu’un l’appelle direct,
    // mais ici on peut aussi sécuriser :
    const _cw = combatWitch;
    combatWitch = function(){
      if(state.flags.brumeFragments>=3){ _cw(); }
      else{
        write('Le pouvoir des brumes te manque (3 fragments requis).','warn');
        continueBtn(()=>explore());
      }
    };
  }

  /* ---------- 6) Indices dans le Marais (événements sociaux) ---------- */
  // Si tu as un événement de sanctuaire en marais, on peut laisser un indice
  if(typeof eventSanctuary==='function'){
    const _sanct = eventSanctuary;
    eventSanctuary = function(){
      _sanct();
      try{
        if(state.locationKey==='marais' && state.flags.brumeFragments<3){
          write('Des lueurs flottent au ras de l’eau. Elles semblent chercher quelque chose…','meta');
        }
      }catch(_){}
    };
  }

  /* ---------- 7) Mise à jour immédiate de l’UI ---------- */
  try{ setStats(); }catch(_){}

})();
