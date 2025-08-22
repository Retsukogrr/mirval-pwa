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
