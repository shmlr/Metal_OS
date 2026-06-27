(function(){
  'use strict';
  const CANOPY_SCHEMES = [
    {id:'wall_one_post', title:'Стена + 1 стойка', subtitle:'стена + одна передняя опора', icon:'┴', wallSide:'back', postCount:1, canopySchemeType:'wall_one_post', warning:'Проверьте анкера, стену, узел одинарной стойки и консольные фермы.'},
    {id:'wall_two_posts', title:'Стена + 2 стойки', subtitle:'классический пристенный навес', icon:'П', wallSide:'back', postCount:2, canopySchemeType:'auto'},
    {id:'free_four_posts', title:'4 стойки', subtitle:'свободностоящий навес', icon:'▣', wallSide:'none', postCount:4, canopySchemeType:'auto'},
    {id:'between_walls', title:'Между двумя стенами', subtitle:'без передних стоек', icon:'⇔', wallSide:'back', postCount:0, canopySchemeType:'auto', warning:'Проверьте стены/колонны и анкера.'},
    {id:'cantilever', title:'Консольный', subtitle:'без стоек, крепление к стене', icon:'⌐', wallSide:'back', postCount:0, canopySchemeType:'auto', warning:'Требуется инженерная проверка стены и анкеров.'}
  ];
  function $(id){ return document.getElementById(id); }
  function setVal(id, value){
    const el = $(id);
    if(!el) return false;
    el.value = value;
    el.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  }
  function applyCanopyScheme(s){
    setVal('wallSide', s.wallSide);
    setVal('postCount', s.postCount);
    setVal('canopySchemeType', s.canopySchemeType);
    const warn = $('schemeConstructorWarning');
    if(warn) warn.textContent = s.warning || 'Схема выбрана. Проверьте размеры и нажмите «Рассчитать».';
    document.querySelectorAll('[data-constructor-scheme]').forEach(btn=>{
      const active = btn.dataset.constructorScheme === s.id;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }
  function render(){
    const host = $('schemeConstructor');
    if(!host) return;
    host.innerHTML = CANOPY_SCHEMES.map(s => `
      <button type="button" class="scheme-choice" data-constructor-scheme="${s.id}" aria-pressed="false">
        <span class="scheme-choice-icon">${s.icon}</span>
        <span><b>${s.title}</b><small>${s.subtitle}</small></span>
      </button>`).join('');
    host.addEventListener('click', e=>{
      const btn = e.target.closest('[data-constructor-scheme]');
      if(!btn) return;
      const s = CANOPY_SCHEMES.find(x=>x.id === btn.dataset.constructorScheme);
      if(s) applyCanopyScheme(s);
    });
  }
  window.MetalOSSchemes = {canopy:CANOPY_SCHEMES, applyCanopyScheme};
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
