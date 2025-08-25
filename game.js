// === Aventurier de Mirval — game.js v10 développé++ ===
console.log("game.js v10 — extension");

// ====================
// État initial du jeu
// ====================
function initialState(){
  return {
    name: "Eldarion",
    cls: "—",
    hasChosenClass: false,
    attrs: { STR:1, AGI:1, WIS:1 },
    hp: 25, hpMax: 25,
    gold: 15, level: 1, xp: 0, rep: 0,
    day: 1, time: "Aube",
    location: "Lisière de la forêt de Mirval",
    locationKey: "clairiere",
    inventory: [
      {name:"Vieille épée", desc:"+1 attaque"},
      {name:"Petite armure", desc:"+1 armure"}
    ],
    potions: 1,
    status: [],
    flags: { 
      fragments:0, bossUnlocked:false, torch:false, oracleSeen:false, 
      peasantSaved:false, rumors:0, ruinsUnlocked:true, 
      villageUnlocked:false, towerUnlocked:false 
    },
    quests: {
      main:{title:"Le Chef Bandit",state:"En cours"},
      side:[],
      artifacts:{title:"Fragments d’artefact (0/3)",state:"En cours"}
    },
    achievements: {},
    inCombat:false, enemy:null,
    skill: { name:"", cooldown:0, cd:0, desc:"", use:()=>{} }
  };
}

let state;

// ====================
// Interface & UI
// ====================
const ui = {};
function bindUI(){
  ui.log=document.getElementById('log');
  ui.choices=document.getElementById('choices');
  ui.hp=document.getElementById('hp');
  ui.hpmax=document.getElementById('hpmax');
  ui.hpbar=document.getElementById('hpbar');
  ui.gold=document.getElementById('gold');
  ui.lvl=document.getElementById('lvl');
  ui.xp=document.getElementById('xp');
  ui.inv=document.getElementById('inventory');
  ui.loc=document.getElementById('location');
  ui.day=document.getElementById('day');
  ui.lastRoll=document.getElementById('lastRoll');
  ui.status=document.getElementById('status');
  ui.pclass=document.getElementById('p-class');
  ui.pname=document.getElementById('p-name');
  ui.astr=document.getElementById('a-str');
  ui.aagi=document.getElementById('a-agi');
  ui.awis=document.getElementById('a-wis');
  ui.rep=document.getElementById('rep');
  ui.repLabel=document.getElementById('rep-label');
  ui.quests=document.getElementById('quests');
}

// ====================
// UI helpers
// ====================
function write(text,cls=""){
  const p=document.createElement('p');
  if(cls)p.classList.add(cls);
  p.innerHTML=text;
  ui.log.appendChild(p);
  ui.log.scrollTop=ui.log.scrollHeight;
}
function clearChoices(){ui.choices.innerHTML="";}
function addChoice(label,fn,primary=false){
  const b=document.createElement('button');
  if(primary)b.classList.add('btn-primary');
  b.textContent=label;
  b.onclick=fn;
  ui.choices.appendChild(b);
}

// ====================
// Stats
// ====================
function setStats(){
  ui.hp.textContent=state.hp;
  ui.hpmax.textContent=state.hpMax;
  ui.hpbar.style.width=Math.max(0,Math.min(100,Math.round(state.hp/state.hpMax*100)))+'%';
  ui.gold.textContent=state.gold;
  ui.lvl.textContent=state.level;
  ui.xp.textContent=state.xp;
  ui.status.textContent=state.status.length? state.status.map(s=>s.name).join(', '):"—";
  ui.pclass.textContent=state.cls;
  ui.pname.textContent=state.name;
  ui.astr.textContent=state.attrs.STR;
  ui.aagi.textContent=state.attrs.AGI;
  ui.awis.textContent=state.attrs.WIS;
  ui.rep.textContent=state.rep;
  ui.repLabel.textContent=repText(state.rep);
  ui.inv.innerHTML="";
  state.inventory.forEach(it=>{
    const d=document.createElement('div');
    d.className='stat';
    d.innerHTML=`<b>${it.name}</b><span>${it.desc}</span>`;
    ui.inv.appendChild(d);
  });
}

// ====================
// Dés & utilitaires
// ====================
function d20(mod=0){
  const r=Math.floor(Math.random()*20)+1;
  const t=r+mod;
  ui.lastRoll.textContent=`d20(${mod>=0?'+':''}${mod}) → ${r} = ${t}`;
  return{roll:r,total:t};
}
function heal(n){
  state.hp=Math.min(state.hpMax,state.hp+n);
  setStats();write(`+${n} PV`,"good");
}
function damage(n,src=""){
  state.hp=Math.max(0,state.hp-n);
  setStats();write(`-${n} PV ${src?`(${src})`:''}`,"bad");
  if(state.hp<=0)gameOver();
}
function changeGold(n){
  state.gold=Math.max(0,state.gold+n);
  setStats();
  write(`Or ${n>=0?'+':''}${n} (total: ${state.gold})`,n>=0?"good":"warn");
}
function gainXP(n){
  state.xp+=n;
  write(`XP +${n}`,"info");
  const need=20+(state.level-1)*15;
  if(state.xp>=need){
    state.level++;state.xp=0;
    state.hpMax+=5;state.hp=state.hpMax;
    write(`<b>Niveau ${state.level} !</b>`,"good");
  }
  setStats();
}
function addItem(name,desc){
  state.inventory.push({name,desc});
  setStats();write(`Tu obtiens <b>${name}</b>`,"good");
}
function hasItem(name){return state.inventory.some(i=>i.name===name);}
function removeItem(name){
  const i=state.inventory.findIndex(x=>x.name===name);
  if(i>=0)state.inventory.splice(i,1);
  setStats();
}
function repText(n){return n>=30?'Vertueux':n<=-30?'Sombre':'Neutre';}
// ====================
// RNG simple (utilisé par certains événements)
// ====================
const rng = {
  rand: () => Math.random(),
  between: (min,max) => Math.floor(Math.random()*(max-min+1))+min
};

// ====================
// Aide : bouton "Continuer"
// ====================
function continueBtn(next){
  addChoice("Continuer", ()=>{
    if(typeof next === 'function') next();
  }, true);
}

// ====================
// Réputation & Statuts récurrents
// ====================
function rep(n){ state.rep += n; setStats(); }

function tickStatus(){
  state.status = state.status.filter(st=>{
    if(st.type==='poison'){ const dmg=rng.between(1,2); damage(dmg,"Poison"); st.dur--; }
    if(st.type==='bleed'){  const dmg=2; damage(dmg,"Saignement"); st.dur--; }
    if(st.type==='slow'){   st.dur--; if(st.dur===0) write('💨 Tu te sens plus léger.','info'); }
    return st.dur>0 && state.hp>0;
  });
}

// ====================
// Modifs d’attaque/défense
// ====================
function playerAtkMod(){
  let m=0;
  if(state.cls==='Guerrier') m+=2;
  if(state.attrs.STR>=3) m+=1;
  if(hasItem('Épée affûtée')) m+=1;
  if(hasItem('Arc de chasse')) m+=1;
  return m;
}
function playerDef(){
  return 10
    + (state.cls==='Paladin'?1:0)
    + (state.attrs.AGI>=3?1:0)
    + (hasItem('Petite armure')?1:0)
    + (hasItem('Cuir renforcé')?2:0)
    + (hasItem('Bouclier en fer')?2:0)
    + (hasItem('Armure lourde')?3:0);
}
function terrainPenalty(){ return state.locationKey==='marais' ? -1 : 0 }

// ====================
// Choix de classe
// ====================
function chooseClass(){
  clearChoices();
  write("Choisis ta classe :","info");

  function pick(nom, key, val, skill){
    state.cls = nom;
    if(key) state.attrs[key] = val;
    state.skill = skill;
    state.hasChosenClass = true;
    setStats();
    startAdventure(); // sera défini dans le Bloc 4
  }

  addChoice("🛡️ Guerrier", ()=>pick("Guerrier","STR",3,{
    name:"Frappe vaillante", cooldown:3, cd:0, desc:"Attaque puissante",
    use:(e)=>{ const dmg=rng.between(4,10)+Math.max(0,state.level-1); e.hp-=dmg; write(`💥 Frappe vaillante : -${dmg} PV`,"good"); }
  }), true);

  addChoice("🗡️ Voleur", ()=>pick("Voleur","AGI",3,{
    name:"Coup de l’ombre", cooldown:3, cd:0, desc:"Jet +4, dégâts + vol",
    use:(e)=>{ const r=d20(4).total; if(r>=e.ac){ const steal=Math.min(3, Math.max(0,state.gold)); const dmg=rng.between(3,7)+steal; e.hp-=dmg; changeGold(steal); write(`🗡️ L’ombre frappe : -${dmg} PV`,"good"); } else write("Tu rates.","warn"); }
  }));

  addChoice("⚕️ Paladin", ()=>pick("Paladin","WIS",2,{
    name:"Lumière", cooldown:3, cd:0, desc:"Soigne",
    use:()=>{ heal(rng.between(6,10)+Math.floor(state.level/2)); }
  }));

  addChoice("🏹 Rôdeur", ()=>pick("Rôdeur","AGI",3,{
    name:"Tir précis", cooldown:2, cd:0, desc:"Jet +6, 1d8 dégâts",
    use:(e)=>{ const r=d20(6).total; if(r>=e.ac){ const dmg=rng.between(3,8); e.hp-=dmg; write(`🏹 Tir précis : -${dmg} PV`,"good"); } else write("Tir manqué.","warn"); }
  }));

  addChoice("🔮 Mystique", ()=>pick("Mystique","WIS",3,{
    name:"Onde arcanique", cooldown:3, cd:0, desc:"1d8 & vulnérabilité",
    use:(e)=>{ const dmg=rng.between(3,8); e.hp-=dmg; e.dotChance=Math.min(0.6,(e.dotChance||0)+0.15); write(`🔮 Onde arcanique : -${dmg} PV`,"good"); }
  }));
}

// ====================
// Bestiaire
// ====================
const mobs = {
  wolf:   ()=>({ name:"Loup affamé",       hp:10, maxHp:10, ac:11, hitMod:2, tier:1, dotChance:0 }),
  bandit: ()=>({ name:"Bandit des fourrés", hp:12, maxHp:12, ac:12, hitMod:3, tier:2, dotChance:0.1, dotType:'bleed' }),
  boar:   ()=>({ name:"Sanglier irascible", hp:11, maxHp:11, ac:11, hitMod:2, tier:1, dotChance:0.05, dotType:'bleed' }),
  harpy:  ()=>({ name:"Harpie du vent",     hp:14, maxHp:14, ac:13, hitMod:4, tier:2, dotChance:0.2, dotType:'bleed' }),
  ghoul:  ()=>({ name:"Goule des roseaux",  hp:13, maxHp:13, ac:12, hitMod:3, tier:2, dotChance:0.25, dotType:'poison' }),
  chief:  ()=>({ name:"Chef Bandit",        hp:24, maxHp:24, ac:14, hitMod:5, tier:3, dotChance:0.3, dotType:'bleed' }),
  serpent:()=>({ name:"Serpent des marais", hp:11, maxHp:11, ac:11, hitMod:3, tier:1, dotChance:0.25, dotType:'poison'}),
  slime:  ()=>({ name:"Slime acide",        hp:14, maxHp:14, ac:12, hitMod:3, tier:2, dotChance:0.2,  dotType:'bleed'}),
  archer: ()=>({ name:"Brigand archer",     hp:12, maxHp:12, ac:12, hitMod:4, tier:2 })
};

// ====================
// Combat
// ====================
function combat(mon){
  clearChoices();
  state.inCombat = true;
  state.enemy = JSON.parse(JSON.stringify(mon));
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
    const m = d20(e.hitMod||3).total;
    const armor = playerDef() + bonus;
    if(m>=armor){
      const dmg=Math.max(0,rng.between(1,3+(e.tier||2))-2-bonus);
      write(`Parade partielle, -${dmg} PV.`,"warn");
      damage(dmg,e.name);
    } else write("Tu pares complètement !","good");
    if(e.hp>0) enemyAttack();
    combatTurn();
  });

  addChoice(`✨ Compétence`, ()=>{
    if(state.skill && state.skill.cd>0){ write("Compétence en recharge.","warn"); return combatTurn(); }
    if(!state.skill || !state.skill.use){ write("Tu n’as pas de compétence active.","info"); return combatTurn(); }
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

  addChoice(`🏃 Fuir`, ()=>{
    const r=d20(state.attrs.AGI>=3?2:0).total;
    if(r>=14){ write("Tu fuis le combat.","sys"); state.inCombat=false; state.enemy=null; }
    else { write("Échec de fuite !","bad"); enemyAttack(); }
    if(state.inCombat) combatTurn();
  });
}

function aimMenu(){
  clearChoices(); const e=state.enemy;
  addChoice('🎯 Tête', ()=>{
    const r=d20(playerAtkMod()-2 + terrainPenalty()).total;
    if(r>=e.ac+2){ const dmg=rng.between(6,10); e.hp-=dmg; write(`🎯 Coup à la tête : -${dmg} PV`,'good'); }
    else write('Tu manques la tête.','warn');
    if(e.hp>0) enemyAttack(); combatTurn();
  }, true);

  addChoice('🗡️ Torse', ()=>{
    const r=d20(playerAtkMod() + terrainPenalty()).total;
    if(r>=e.ac){ const dmg=rng.between(3,7); e.hp-=dmg; write(`🗡️ Frappe au torse : -${dmg} PV`,'good'); }
    else write('Tu manques.','warn');
    if(e.hp>0) enemyAttack(); combatTurn();
  });

  addChoice('🦵 Jambes', ()=>{
    const r=d20(playerAtkMod()+1 + terrainPenalty()).total;
    if(r>=e.ac-1){ const dmg=rng.between(2,5); e.hp-=dmg; state.status.push({type:'slow',name:'Ralentissement',dur:2}); write(`🦵 Frappe aux jambes : -${dmg} PV (ennemi ralenti)`,'good'); }
    else write('Tu manques les jambes.','warn');
    if(e.hp>0) enemyAttack(); combatTurn();
  });

  addChoice('↩️ Retour', combatTurn);
}

function enemyAttack(){
  const e=state.enemy;
  const roll = d20(e.hitMod||3).total;
  const def = playerDef() + terrainPenalty();
  if(roll>=def){
    const dmg=rng.between(1,3+(e.tier||2));
    if(e.name==='Bandit des fourrés' && rng.rand()<0.2){ changeGold(-1); write('🪙 Le bandit te détrousse !','warn'); }
    damage(dmg,e.name);
    if(e.dotChance && rng.rand()<e.dotChance){
      if(e.dotType==='poison') state.status.push({type:'poison', name:'Poison', dur:rng.between(2,4)});
      if(e.dotType==='bleed')  state.status.push({type:'bleed',  name:'Saignement', dur:rng.between(2,4)});
      write(`⚠️ ${e.name} inflige ${e.dotType==='poison'?'un poison':'un saignement'} !`,"warn");
    }
  } else {
    write(`${e.name} rate son attaque.`, "info");
  }
  tickStatus();
}

function afterCombat(){
  const e=state.enemy; state.inCombat=false; state.enemy=null;
  const gold=rng.between(e.tier||1, (e.tier||1)*3);
  const xp=rng.between((e.tier||1)*3, (e.tier||1)*6);
  changeGold(gold); gainXP(xp);
  const r=rng.rand();
  if(r<0.18 && !hasItem("Épée affûtée")) addItem("Épée affûtée","+1 attaque");
  else if(r<0.30 && !hasItem("Bouclier en bois")) addItem("Bouclier en bois","+1 armure légère");
  else if(r<0.40) { state.potions++; write("Tu trouves une potion.","good"); }
  else if(r<0.48 && !hasItem("Arc de chasse")) addItem("Arc de chasse","+1 attaque à distance");
  else if(r<0.52 && !hasItem("Cuir renforcé")) addItem("Cuir renforcé","+2 armure souple");

  if(e.name.includes("Bandit")){
    state.flags.rumors = (state.flags.rumors||0)+1;
    if(state.flags.rumors>=3 && !state.flags.bossUnlocked){
      state.flags.bossUnlocked=true;
      write("🗡️ Tu apprends la cache du Chef Bandit… (événement rare débloqué)","info");
    }
  }
  // L’exploration reprendra dans le Bloc 3, via explore()
}

// ====================
// PNJ & Événements
// ====================
function eventHerbalist(){
  write("🌿 Une herboriste te fait signe.","info");
  clearChoices();
  addChoice("S’approcher", ()=>{
    if(state.rep<-20){ write("Elle se détourne : 'Je ne sers pas les cruels.'",'warn'); rep(-1); return continueBtn(explore); }
    const cost=(state.rep>20?2:3);
    if(state.gold>=cost){ changeGold(-cost); heal(rng.between(6,12)); state.flags.metHerbalist=true; }
    else write("Tu n'as pas assez d'or.","warn");
    continueBtn(explore);
  }, true);
  addChoice("Marchander", ()=>{
    const {total}=d20(state.attrs.WIS>=3?2:0);
    if(total>=15){ heal(rng.between(4,8)); write('Elle sourit : "À prix d’ami."','good'); }
    else write('Elle refuse.','warn');
    continueBtn(explore);
  });
  addChoice("Partir", ()=>continueBtn(explore));
}

function eventSmith(){
  write('⚒️ Un forgeron itinérant inspecte tes armes.','info');
  clearChoices();
  addChoice('Demander une amélioration (5 or)', ()=>{
    if(state.gold>=5){ changeGold(-5); if(!hasItem('Épée affûtée')) addItem('Épée affûtée','+1 attaque'); else write("Ton arme est déjà affûtée.","info"); }
    else write("Pas assez d'or.",'warn');
    continueBtn(explore);
  }, true);
  addChoice('Commander un bouclier (6 or)', ()=>{
    if(state.gold>=6){ changeGold(-6); if(!hasItem('Bouclier en fer')) addItem('Bouclier en fer','+2 armure'); else write("Tu as déjà un bon bouclier.","info"); }
    else write("Pas assez d'or.",'warn');
    continueBtn(explore);
  });
  addChoice('Forger une armure lourde (10 or)', ()=>{
    if(state.gold>=10){ changeGold(-10); if(!hasItem('Armure lourde')) addItem('Armure lourde','+3 armure'); else write("Tu portes déjà une armure lourde.","info"); }
    else write("Pas assez d'or.",'warn');
    continueBtn(explore);
  });
}

function eventBard(){
  write('🎻 Un barde propose une chanson.','info');
  clearChoices();
  addChoice('Écouter', ()=>{
    if(rng.rand()<0.7){ heal(rng.between(3,7)); rep(+1); }
    else { changeGold(-2); write('La bourse s’est allégée…','warn'); }
    continueBtn(explore);
  }, true);
  addChoice('L’ignorer', ()=>continueBtn(explore));
}

function eventPeasant(){
  write('🧑‍🌾 Un paysan enchaîné appelle à l’aide.','info');
  clearChoices();
  addChoice('Le libérer', ()=>{
    const {total}=d20(state.attrs.STR>=3?2:0);
    if(total>=14){
      write('Les chaînes cèdent.','good');
      rep(+5);
      state.flags.peasantSaved=true;
      state.quests.side.push({title:'Le paysan reconnaissant',state:'En attente'});
    } else {
      damage(rng.between(1,4),'Effort');
    }
    continueBtn(explore);
  }, true);
  addChoice('L’ignorer', ()=>{ rep(-3); continueBtn(explore); });
}

function eventSanctuary(){
  write('⛪ Un ancien sanctuaire se dévoile.','info');
  clearChoices();
  addChoice('Prier', ()=>{
    const night = state.time==='Nuit' || state.time==='Crépuscule';
    const {total}=d20(); const t=total+(night?1:0);
    if(t>=15){ heal(rng.between(6,12)); rep(+2); }
    else { damage(rng.between(2,6),'Présage'); rep(-1); }
    continueBtn(explore);
  }, true);
  addChoice('Désacraliser', ()=>{
    const {total}=d20(-1);
    if(total>=16){ changeGold(rng.between(8,16)); rep(-3); }
    else { damage(rng.between(4,7),'Malédiction'); rep(-5); }
    continueBtn(explore);
  });
  addChoice('Partir', ()=>continueBtn(explore));
}

function eventHermit(){
  write('🧙 Un ermite t’observe en silence.','info');
  clearChoices();
  addChoice('Accepter sa décoction', ()=>{
    if(rng.rand()<0.6){ heal(rng.between(5,10)); gainXP(3); }
    else { damage(rng.between(2,5),'Nausée'); }
    continueBtn(explore);
  }, true);
  addChoice('Acheter une breloque (5 or)', ()=>{
    if(state.gold>=5){ changeGold(-5); addItem("Breloque d'ermite","10% annule un mal"); state.flags.charm=1; }
    else write("Pas assez d'or.",'warn');
    continueBtn(explore);
  });
  addChoice('Refuser', ()=>continueBtn(explore));
}

function eventTrap(){
  write('🪤 Une corde s’enroule à ta cheville !','warn');
  const {total}=d20(state.attrs.AGI>=3?2:0);
  if(total>=13) write('Tu t’en sors de justesse.','good');
  else damage(rng.between(2,5),'Piège');
  continueBtn(explore);
}

function eventOracle(){
  write('🔮 Une voyante apparaît dans tes rêves.','info');
  clearChoices();
  addChoice('Écouter la prophétie', ()=>{
    write('“Quand trois éclats seront réunis, la porte s’ouvrira.”','info');
    state.flags.oracleSeen=true;
    continueBtn(explore);
  }, true);
}
// ====================
// Temps & navigation
// ====================
function setTime(){
  const slots=["Aube","Matin","Midi","Après-midi","Crépuscule","Nuit"];
  const idx=slots.indexOf(state.time);
  let n=(idx+1)%slots.length;
  if(n===0) state.day++;
  state.time=slots[n];
  ui.day.textContent=`Jour ${state.day} — ${state.time}`;
}

function gotoZone(key){
  state.locationKey=key;
  state.location = key==='marais'   ? "Marais de Vire-Saule" :
                   key==='clairiere'? "Clairière des Lys" :
                   key==='colline'  ? "Colline de Rocfauve" :
                   key==='ruines'   ? "Ruines Oubliées" :
                   key==='grotte'   ? "Grotte Sépulcrale" :
                   key==='village'  ? "Village de Mirval" :
                                      "Lisière";
  write(`👉 Tu te diriges vers ${state.location}.`,"sys");
  explore(true);
}

// ====================
// Anti-redondance de choix
// ====================
function pickWeighted(items, k){
  state.lastLabels = state.lastLabels || [];
  const recent = new Set(state.lastLabels);
  let pool = items.flatMap(it => Array((it.w||1)).fill(it)).filter(it=> !recent.has(it.label));
  if(pool.length<k) pool = items.flatMap(it => Array((it.w||1)).fill(it));
  const out=[];
  for(let i=0;i<k && pool.length;i++){
    const idx=Math.floor(Math.random()*pool.length);
    out.push(pool[idx]);
    pool.splice(idx,1);
  }
  state.lastLabels = [...out.map(o=>o.label), ...state.lastLabels].slice(0,8);
  return out;
}

// ====================
// Recherche / Repos / Coffre / Rencontre
// ====================
function searchArea(){
  const wis = state.attrs.WIS>=3?1:0;
  const {total}=d20(wis);
  if(state.locationKey==='ruines' && rng.rand()<0.15){
    state.flags.fragments++;
    write("✨ Tu mets la main sur un fragment d’artefact !",'good');
  }
  if(total>=18){
    write("🔑 Recherche exceptionnelle : tu trouves un coffre scellé.","good");
    chest();
  } else if(total>=12){
    const roll=rng.rand();
    if(roll<0.4){ changeGold(rng.between(3,8)); }
    else if(roll<0.7){ state.mats = state.mats||{herbe:0,cuir:0,dent:0,obsid:0}; state.mats.herbe++; write("🌿 Tu cueilles une herbe utile.","good"); }
    else { write("Tu repères des traces fraîches…","info"); if(rng.rand()<0.6) randomEncounter(); }
  } else if(total>=8){
    write("Des bruissements au loin…","info");
    if(rng.rand()<0.5) randomEncounter();
  } else {
    write("Ronces perfides !","warn");
    damage(rng.between(1,3),"Ronces");
  }
  continueBtn(explore);
}

function rest(){
  if(rng.rand()<0.35){
    write("Quelque chose approche pendant ton repos…","warn");
    randomEncounter();
  } else {
    heal(rng.between(4,8));
    write("Tu te reposes un instant.","good");
  }
  continueBtn(explore);
}

function chest(){
  const r=rng.between(1,100);
  if(r>90){ addItem("Bouclier en fer","+2 armure"); }
  else if(r>70){ state.potions++; write("Tu trouves une potion.","good"); }
  else if(r>55){ state.mats.herbe++; write("🌿 Tu récupères une herbe.","good"); }
  else if(r>40){ changeGold(rng.between(7,15)); }
  else { write("💥 Piège !","bad"); damage(rng.between(3,6),"Piège"); }
}

function randomEncounter(){
  const roll=rng.rand();
  const zone=state.locationKey;
  if(roll<0.55){
    if(zone==='marais') combat(mobs.serpent());
    else if(zone==='clairiere') combat(mobs.bandit());
    else if(zone==='colline') combat(mobs.harpy());
    else if(zone==='ruines') combat(mobs.archer());
    else combat(mobs.wolf());
  } else {
    // Rencontre pacifique
    const friendly=[eventHerbalist,eventSmith,eventBard,eventHermit,eventSanctuary];
    friendly[rng.between(0,friendly.length-1)]();
  }
}

// ====================
// Village (hub) & services
// ====================
function hubVillage(){
  write("🏘️ Tu arrives au Village de Mirval. Place du marché animée, guilde modeste, bourgade paisible.","info");
  clearChoices();

  addChoice("🛒 Marché", eventMerchant, true);
  addChoice("🏛️ Guilde (apprendre des compétences)", eventGuild);
  addChoice("📜 Tableau de contrats", eventBoard);
  addChoice("🛏️ Auberge (3 or → soins complets)", ()=>{
    if(state.gold>=3){ changeGold(-3); state.hp=state.hpMax; setStats(); write("Tu dors d’un sommeil profond. Tu es remis.","good"); }
    else write("Pas assez d’or.","warn");
    continueBtn(explore);
  });
  addChoice("⚒️ Forgeron", eventSmith);
  addChoice("Quitter le village", ()=>gotoZone('clairiere'));
}

// Marchand complet (achat/vente/carte)
function eventMerchant(){
  write("🧳 Un marchand déplie ses étals : torches, potions, bric-à-brac.","info");
  clearChoices();

  addChoice("Acheter une torche (4 or)", ()=>{
    if(state.gold>=4){
      changeGold(-4);
      if(!state.flags.torch){ state.flags.torch=true; addItem("Torche ancienne","Permet d’explorer la grotte"); }
      else write("Tu as déjà de quoi voir dans le noir.","info");
    } else write("Trop cher.","warn");
    continueBtn(explore);
  }, true);

  addChoice("Acheter une potion (5 or)", ()=>{
    if(state.gold>=5){ changeGold(-5); state.potions++; write("Tu achètes une potion.","good"); }
    else write("Trop cher.","warn");
    continueBtn(explore);
  });

  addChoice("Acheter une carte au trésor (6 or)", ()=>{
    if(state.gold>=6){ changeGold(-6); state.flags.map=true; write("🗺️ Une vieille carte griffonnée…","info"); }
    else write("Trop cher.","warn");
    continueBtn(explore);
  });

  addChoice("Vendre matériaux", ()=>{
    const val = (state.mats.herbe||0)*1 + (state.mats.cuir||0)*2 + (state.mats.dent||0)*2 + (state.mats.obsid||0)*3;
    if(val>0){
      changeGold(val);
      state.mats.herbe=state.mats.cuir=state.mats.dent=state.mats.obsid=0;
      write("Tu revends tes matériaux.","good");
    } else write("Tu n’as rien à vendre.","info");
    continueBtn(explore);
  });

  addChoice("Revenir", explore);
}

// Guilde : compétences apprenables
function eventGuild(){
  write("🏛️ La petite guilde propose quelques techniques utiles.","info");
  clearChoices();

  function learn(skill, cost){
    if(state.skills && state.skills.some(s=>s.name===skill.name)){ write("Tu connais déjà cette technique.","info"); return; }
    if(state.gold<cost){ write("Pas assez d’or.","warn"); return; }
    changeGold(-cost);
    state.skills = state.skills||[];
    state.skills.push(skill);
    write(`Tu apprends <b>${skill.name}</b>.`,"good");
  }

  const skills = [
    { name:"Bandage", cooldown:3, cd:0, desc:"Soigne 1d6+2", use:()=>{ heal(rng.between(3,8)); } },
    { name:"Concentration", cooldown:3, cd:0, desc:"+2 au prochain jet d’attaque", use:()=>{ state.flags.nextHitBonus=(state.flags.nextHitBonus||0)+2; write("Tu te concentres… (+2 au prochain coup)","info"); } },
    { name:"Coup circulaire", cooldown:3, cd:0, desc:"Frappe large 2–5", use:(e)=>{ const dmg=rng.between(2,5); e.hp-=dmg; write(`Coup circulaire : -${dmg} PV`,'good'); } },
  ];

  addChoice("Apprendre Bandage (3 or)", ()=>{ learn(skills[0],3); continueBtn(hubVillage); }, true);
  addChoice("Apprendre Concentration (4 or)", ()=>{ learn(skills[1],4); continueBtn(hubVillage); });
  addChoice("Apprendre Coup circulaire (5 or)", ()=>{ learn(skills[2],5); continueBtn(hubVillage); });
  addChoice("Retour", hubVillage);
}

// Tableau de contrats (mini-quêtes)
function eventBoard(){
  write("📜 Le tableau grince : quelques avis de recherche y pendent.","info");
  clearChoices();

  // Génération d’un contrat si aucun actif
  if(!(state.quests.board && state.quests.board.length)){
    const pool=[
      {key:'loups',   need:3, reward:{gold:6,xp:8}, title:'Chasser les loups'},
      {key:'bandits', need:3, reward:{gold:8,xp:10}, title:'Réprimer les bandits'},
      {key:'harpies', need:2, reward:{gold:7,xp:10}, title:'Abattre les harpies'},
      {key:'goules',  need:2, reward:{gold:9,xp:12}, title:'Purifier les marais'},
    ];
    const c = pool[rng.between(0,pool.length-1)];
    state.quests.board=[{key:c.key, have:0, need:c.need, reward:c.reward, title:c.title}];
    write(`Nouveau contrat : <b>${c.title}</b> (${c.have||0}/${c.need})`,'info');
  }

  const c=state.quests.board[0];
  addChoice(`${c.title} — ${c.have}/${c.need}`, ()=>{ write("Contrat suivi.",'info'); continueBtn(hubVillage); }, true);

  if(c.have>=c.need){
    addChoice(`Rendre le contrat (récompense)`, ()=>{
      changeGold(c.reward.gold); gainXP(c.reward.xp);
      state.rep += 2; setStats();
      write("Le prévôt te remercie.","good");
      state.quests.board=[];
      continueBtn(hubVillage);
    });
  }
  addChoice("Retour", hubVillage);
}

// MàJ contrat après un kill
function updateContractsAfterKill(name){
  if(!(state.quests.board && state.quests.board.length)) return;
  const c=state.quests.board[0];
  const map={
    loups:   (n)=>/Loup/i.test(n),
    bandits: (n)=>/Bandit/i.test(n),
    harpies: (n)=>/Harpie/i.test(n),
    goules:  (n)=>/Goule/i.test(n),
  };
  if(map[c.key] && map[c.key](name)){
    c.have = (c.have||0)+1;
    write(`📜 Contrat progressé : ${c.have}/${c.need}`,'info');
  }
}

// ====================
// Boss
// ====================
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

function combatWitch(){
  const boss={name:"Sorcière des Brumes",hp:26,maxHp:26,ac:15,hitMod:5,tier:3,dotChance:0.35,dotType:'poison'};
  write("🌫️ Un froid surnaturel tombe… la Sorcière des Brumes apparaît !","warn");
  combat(boss);
  const _enemyAttack = enemyAttack;
  enemyAttack = function(){
    if(state.enemy && state.enemy.name==='Sorcière des Brumes' && !state.enemy.phase2 && state.enemy.hp<=state.enemy.maxHp/2){
      state.enemy.phase2=true; state.enemy.ac+=1; state.enemy.hitMod+=1;
      write("🕯️ La brume s’épaissit : la Sorcière devient plus dangereuse !","warn");
    }
    _enemyAttack();
  };
}

// ====================
// Correction combat : menu & statut "slow" ennemi + bonus prochain coup
// (On redéfinit aimMenu et enemyAttack pour intégrer ces effets)
// ====================
(function overrideCombatMenus(){
  const _aimMenu = aimMenu;
  aimMenu = function(){
    clearChoices(); const e=state.enemy;
    const nextBonus = state.flags && state.flags.nextHitBonus ? state.flags.nextHitBonus : 0;

    addChoice('🎯 Tête', ()=>{
      const r=d20(playerAtkMod()-2 + terrainPenalty() + nextBonus).total;
      if(state.flags) state.flags.nextHitBonus=0;
      if(r>=e.ac+2){ const dmg=rng.between(6,10); e.hp-=dmg; write(`🎯 Coup à la tête : -${dmg} PV`,'good'); }
      else write('Tu manques la tête.','warn');
      if(e.hp>0) enemyAttack(); combatTurn();
    }, true);

    addChoice('🗡️ Torse', ()=>{
      const r=d20(playerAtkMod() + terrainPenalty() + nextBonus).total;
      if(state.flags) state.flags.nextHitBonus=0;
      if(r>=e.ac){ const dmg=rng.between(3,7); e.hp-=dmg; write(`🗡️ Frappe au torse : -${dmg} PV`,'good'); }
      else write('Tu manques.','warn');
      if(e.hp>0) enemyAttack(); combatTurn();
    });

    addChoice('🦵 Jambes', ()=>{
      const r=d20(playerAtkMod()+1 + terrainPenalty() + nextBonus).total;
      if(state.flags) state.flags.nextHitBonus=0;
      if(r>=e.ac-1){ const dmg=rng.between(2,5); e.hp-=dmg; e.slowTurns=(e.slowTurns||0)+2; write(`🦵 Frappe aux jambes : -${dmg} PV (ennemi ralenti)`,'good'); }
      else write('Tu manques les jambes.','warn');
      if(e.hp>0) enemyAttack(); combatTurn();
    });

    addChoice('↩️ Retour', combatTurn);
  };

  const _enemyAttack = enemyAttack;
  enemyAttack = function(){
    const e=state.enemy;
    let hm = e.hitMod||3;
    if(e.slowTurns && e.slowTurns>0){ hm = Math.max(0, hm-1); e.slowTurns--; }
    const roll = d20(hm).total;
    const def  = playerDef() + terrainPenalty();
    if(roll>=def){
      const dmg=rng.between(1,3+(e.tier||2));
      if(e.name==='Bandit des fourrés' && rng.rand()<0.2){ changeGold(-1); write('🪙 Le bandit te détrousse !','warn'); }
      damage(dmg,e.name);
      if(e.dotChance && rng.rand()<e.dotChance){
        if(e.dotType==='poison') state.status.push({type:'poison', name:'Poison', dur:rng.between(2,4)});
        if(e.dotType==='bleed')  state.status.push({type:'bleed',  name:'Saignement', dur:rng.between(2,4)});
        write(`⚠️ ${e.name} inflige ${e.dotType==='poison'?'un poison':'un saignement'} !`,"warn");
      }
    } else {
      write(`${e.name} rate son attaque.`, "info");
    }
    tickStatus();
  };
})();

// ====================
// Exploration (zones & navigation)
// ====================
function explore(initial=false){
  setStats();
  ui.loc.textContent = state.location;
  ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();
  if(!initial) setTime();
  tickStatus();
  if(state.hp<=0) return;

  // Déblocages conditionnels
  if(state.flags.fragments>=3 && !state.flags.witchUnlocked){
    state.flags.witchUnlocked=true;
    state.quests.artifacts.state="Complet";
    write("🔶 Les fragments résonnent… tu pressens une présence dans la Grotte.","info");
  }

  // Événement temporel unique
  if(state.day>=5 && !state.flags.oracleSeen){ eventOracle(); return; }

  // Menu de base
  const base = [
    { label:"Fouiller", act:searchArea, w:2 },
    { label:"Se reposer", act:rest, w:1 },
    { label:"Utiliser un objet", act:useItemMenu, w:1 }
  ];

  // Pool dynamique selon zone
  const zone=state.locationKey;
  let pool=[];
  if(zone==='clairiere'){
    if(!state.flags.villageUnlocked) pool.push({label:'Chemin vers un village', act:()=>{ state.flags.villageUnlocked=true; write("Tu découvres un sentier menant à un village.","info"); continueBtn(explore); }, w:1});
    pool.push({label:'Croiser une herboriste', act:eventHerbalist, w:2});
    pool.push({label:'Écouter un barde', act:eventBard, w:1});
    pool.push({label:'Chasser un sanglier', act:()=>combat(mobs.boar()), w:2});
    pool.push({label:'Bandits embusqués', act:()=>combat(mobs.bandit()), w:2});
    pool.push({label:'Marchand itinérant', act:eventMerchant, w:1});
  } else if(zone==='marais'){
    pool.push({label:'Suivre des feux-follets', act:eventSanctuary, w:1});
    pool.push({label:'Aider un captif', act:()=>{ if(!state.flags.peasantSaved) eventPeasant(); else { write('La berge est silencieuse.'); continueBtn(explore); } }, w:1});
    pool.push({label:'Traquer une goule', act:()=>combat(mobs.ghoul()), w:3});
    pool.push({label:'Serpent des roseaux', act:()=>combat(mobs.serpent()), w:2});
    pool.push({label:'Tomber sur un piège', act:()=>{ eventTrap(); }, w:1});
  } else if(zone==='colline'){
    pool.push({label:'Rencontrer un ermite', act:eventHermit, w:1});
    pool.push({label:'Explorer des ruines', act:()=>{ gotoZone('ruines'); }, w:1});
    pool.push({label:'Affronter une harpie', act:()=>combat(mobs.harpy()), w:3});
    pool.push({label:'Croiser un forgeron', act:eventSmith, w:1});
  } else if(zone==='ruines'){
    pool.push({label:'Fouiller les décombres', act:eventRuins, w:3});
    pool.push({label:'Combattre des bandits', act:()=>combat(mobs.bandit()), w:2});
    pool.push({label:'Esquiver un éboulement', act:()=>{ damage(rng.between(1,4),'Éboulement'); continueBtn(explore); }, w:1});
  } else if(zone==='grotte'){
    pool.push({label:'Slime acide', act:()=>combat(mobs.slime()), w:2});
    pool.push({label:'Goule ancienne', act:()=>combat({name:'Goule ancienne',hp:18,maxHp:18,ac:13,hitMod:5,tier:3,dotChance:0.35,dotType:'poison'}), w:2});
    pool.push({label:'Échos inquiétants', act:()=>{ const r=d20().total; if(r<10) damage(3,'Stalactite'); else write('Rien ne se passe.'); continueBtn(explore); }, w:1});
    if(state.flags.witchUnlocked) pool.push({label:'Affronter la Sorcière des Brumes', act:()=>combatWitch(), w:1});
  } else if(zone==='village'){
    return hubVillage();
  }

  // Boss Chef Bandit disponible ?
  if(state.flags.bossUnlocked) pool.push({label:"Traquer le Chef Bandit", act:()=>combatBoss(), w:1});

  // Navigation (selon déblocage)
  const nav = [
    {label:'→ Village',   act:()=>gotoZone('village'),   w: state.flags.villageUnlocked?1:0},
    {label:'→ Marais',    act:()=>gotoZone('marais'),    w:1},
    {label:'→ Clairière', act:()=>gotoZone('clairiere'), w:1},
    {label:'→ Colline',   act:()=>gotoZone('colline'),   w:1},
    {label:'→ Ruines',    act:()=>gotoZone('ruines'),    w: state.flags.ruinsUnlocked?1:0},
    {label:'→ Grotte',    act:()=> state.flags.torch? gotoZone('grotte') : (write('Il fait trop sombre pour entrer.','warn'), continueBtn(explore)), w:1},
  ].filter(x=>x.w>0);

  const dyn = pickWeighted(pool, 3 + (rng.rand()<0.4?1:0));
  const all = pickWeighted([...base, ...dyn, ...nav], 5);
  all.forEach((c,i)=> addChoice(c.label, c.act, i===0));
}

// ====================
// Post-combat enrichi : loot, contrats, déblocages
// (On écrase afterCombat défini plus tôt pour l’étendre)
// ====================
(function overrideAfterCombat(){
  const _origAfterCombat = afterCombat;
  afterCombat = function(){
    const e=state.enemy;
    _origAfterCombat(); // or / gold / xp / loot de base
    if(!e) return;
    // Contrats
    updateContractsAfterKill(e.name||'');
    // Matériaux (chance)
    if(/Sanglier|Loup|Harpie/i.test(e.name||'')){
      if(rng.rand()<0.4){ state.mats.cuir=(state.mats.cuir||0)+1; write("Tu récupères du cuir.","good"); }
    }
    if(/Sanglier|Loup/i.test(e.name||'') && rng.rand()<0.25){
      state.mats.dent=(state.mats.dent||0)+1; write("Tu récupères une dent.","good");
    }
    // Rumeurs de Chef Bandit déjà gérées, on garde
    // Progression boss 2 via fragments faite ailleurs
  };
})();
// ====================
// Menu Objets (potion, craft, carte)
// ====================
function useItemMenu(){
  clearChoices();

  addChoice(`🧪 Boire une potion (${state.potions})`, ()=>{
    if(state.potions<=0){ write("Tu n'as pas de potion.","warn"); return continueBtn(explore); }
    state.potions--; heal(rng.between(8,12));
    continueBtn(explore);
  }, true);

  // Craft basique (nécessite state.mats)
  addChoice("🛠️ Fabriquer (atelier rapide)", ()=>{
    state.mats = state.mats || {herbe:0, cuir:0, dent:0, obsid:0};
    clearChoices();
    addChoice(`🌿 3 Herbes → 1 Potion  ${state.mats.herbe>=3?'(possible)':'(manque)'}`, ()=>{
      if(state.mats.herbe>=3){ state.mats.herbe-=3; state.potions++; write("Tu brasses une potion simple.","good"); }
      else write("Il te manque des herbes.","warn");
      continueBtn(explore);
    }, true);
    addChoice(`🐗 2 Cuirs + 🦷 1 Dent → Cuir renforcé  ${(state.mats.cuir||0)>=2 && (state.mats.dent||0)>=1 ?'(possible)':'(manque)'}`, ()=>{
      if((state.mats.cuir||0)>=2 && (state.mats.dent||0)>=1){
        state.mats.cuir-=2; state.mats.dent-=1;
        if(!hasItem("Cuir renforcé")) addItem("Cuir renforcé","+2 armure souple"); else changeGold(6);
        write("Tu assembles une armure de cuir robuste.","good");
      }else write("Il manque des matériaux.","warn");
      continueBtn(explore);
    });
    addChoice("↩️ Retour", explore);
  });

  // Carte au trésor (si achetée)
  if(state.flags && state.flags.map){
    addChoice("🗺️ Consulter la carte au trésor", ()=>{
      write("La carte indique un lieu entre la Colline et les Ruines…","info");
      if(rng.rand()<0.6){ state.flags.map=false; state.flags.ruinsClue=true; write("Tu repères une cache probable près des Ruines.","good"); }
      continueBtn(explore);
    });
  }

  addChoice("Annuler", explore);
}

// ====================
// Ruines : fragments & torche
// ====================
function eventRuins(){
  write('🏚️ Des ruines effondrées se dressent, couvertes de lierre.','info');
  clearChoices();
  addChoice('Fouiller', ()=>{
    const {total}=d20(state.attrs.WIS>=3?1:0);
    if(total>=16){
      if(!state.flags.torch){ state.flags.torch=true; addItem('Torche ancienne','Permet d’explorer la grotte'); }
      else {
        state.flags.fragments = (state.flags.fragments||0)+1;
        write('Tu trouves un fragment d’artefact.','good');
        if(state.flags.fragments>=3){
          state.quests.artifacts.state="Complet";
          write("Les trois fragments vibrent à l’unisson…","info");
        }
      }
    } else if(total>=10){
      chest();
    } else {
      damage(rng.between(2,5),'Éboulement');
    }
    continueBtn(explore);
  }, true);
  addChoice('Partir', ()=>continueBtn(explore));
}

// ====================
// Setup / Démarrage robustes
// ====================
function ensureStateIntegrity(){
  // Champs par défaut si absents (compatibilité montages précédents)
  state.mats       = state.mats       || {herbe:0, cuir:0, dent:0, obsid:0};
  state.flags      = state.flags      || {};
  state.lastLabels = state.lastLabels || [];
  state.skills     = state.skills     || [];
  state.quests     = state.quests     || {main:{title:"Le Chef Bandit",state:"En cours"},side:[],artifacts:{title:"Fragments d’artefact (0/3)",state:"En cours"},board:[]};
  state.quests.board = state.quests.board || [];
  state.skill      = state.skill      || {name:"", cooldown:0, cd:0, desc:"", use:()=>{}};
  if(typeof state.hasChosenClass!=='boolean') state.hasChosenClass=false;
  if(!state.cls) state.cls="—";
}

function setup(isNew=false){
  ensureStateIntegrity();
  setStats();
  if(ui.loc) ui.loc.textContent = state.location;
  if(ui.day) ui.day.textContent = `Jour ${state.day} — ${state.time}`;
  clearChoices();

  // Gate des classes
  const classes=["Guerrier","Voleur","Paladin","Rôdeur","Mystique"];
  const needsClass=!state.hasChosenClass || !state.cls || state.cls==="—" || !classes.includes(state.cls);

  if (isNew || ui.log.childElementCount===0 || needsClass){
    write("v10 — Démarrage. Choisis ta classe.","sys");
    chooseClass();
    return;
  }
  explore(true);
}

function startAdventure(){
  ui.log.innerHTML="";
  write("L'aventure commence !","info");
  setStats();
  explore(true);
}

function gameOver(){
  state.inCombat=false;
  write("<b>☠️ Tu t'effondres… La forêt de Mirval se referme sur ton destin.</b>","bad");
  clearChoices();
  addChoice("Recommencer", ()=>{
    state = initialState();
    ensureStateIntegrity();
    setup(true);
  }, true);
}

// ====================
// Cooldowns : -1 à chaque exploration déclenchée
// ====================
(function hookExploreCooldown(){
  const _explore = explore;
  explore = function(...args){
    // CD compétence de classe
    if(state.skill && typeof state.skill.cd==='number'){
      state.skill.cd = Math.max(0, state.skill.cd-1);
    }
    // CD compétences apprises (guilde)
    if(state.skills && state.skills.length){
      state.skills.forEach(sk=>{ sk.cd = Math.max(0,(sk.cd||0)-1); });
    }
    _explore(...args);
  };
})();

// ====================
// Watchdog : si les boutons disparaissent avant le choix de classe
// ====================
setInterval(()=>{
  try{
    if(!state.hasChosenClass && ui && ui.choices && ui.choices.childElementCount===0){
      chooseClass();
    }
  }catch(_){}
}, 800);

// ====================
// Boot DOM-safe
// ====================
(function boot(){
  function go(){
    bindUI();
    state = initialState();
    ensureStateIntegrity();
    state.hasChosenClass = false;    // force le menu de classe à l’ouverture
    setup(true);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', go, {once:true});
  } else {
    go();
  }
})();

// (Optionnel) WakeLock pour mobile si supporté
let wakeLock;
async function keepAwake(){ try{ wakeLock = await navigator.wakeLock.request('screen'); }catch(e){} }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && 'wakeLock' in navigator) keepAwake(); });
if('wakeLock' in navigator) keepAwake();

// (Optionnel) Service Worker (si tu as un sw.js à la racine)
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
