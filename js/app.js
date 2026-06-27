(function(){
  'use strict';

  const BUILD_DATE = '2026-06-27';
  const STORAGE_KEY = 'metal_os_v14_settings';
  const STICK_LENGTH = 6;

  const PROFILE_CATALOG = [
    { name:'20x20x1.5', kgPerM:0.88, rank:1, defaultType:'meter', defaultValue:120 },
    { name:'40x20x2', kgPerM:1.70, rank:2, defaultType:'meter', defaultValue:180 },
    { name:'40x40x2', kgPerM:2.37, rank:3, defaultType:'meter', defaultValue:220 },
    { name:'60x40x2', kgPerM:3.04, rank:4, defaultType:'meter', defaultValue:280 },
    { name:'60x60x2', kgPerM:3.63, rank:5, defaultType:'meter', defaultValue:340 },
    { name:'80x80x3', kgPerM:7.22, rank:6, defaultType:'meter', defaultValue:520 },
    { name:'100x100x3', kgPerM:9.14, rank:7, defaultType:'meter', defaultValue:680 }
  ];


  const TRUSS_TYPES = [
    { key:'straight_parallel', label:'Прямая / параллельные пояса', short:'Прямая', hint:'простые навесы и прямые пролёты' },
    { key:'mono_slope', label:'Односкатная ферма', short:'Односкатная', hint:'навес с уклоном в одну сторону' },
    { key:'gable', label:'Двускатная ферма', short:'Двускатная', hint:'навес с коньком / домиком' },
    { key:'arched', label:'Арочная ферма', short:'Арочная', hint:'арочные навесы' },
    { key:'cantilever', label:'Консольная / козырьковая', short:'Консольная', hint:'козырьки и выносы от стены' },
    { key:'combined', label:'Комбинированная', short:'Комбинированная', hint:'нестандартная форма с ориентировочным расчётом' },
    { key:'custom', label:'Пользовательская', short:'Пользовательская', hint:'ручной ввод элементов' }
  ];

  const TRUSS_WEB_PATTERNS = [
    { key:'triangle', label:'Треугольная' },
    { key:'vertical', label:'Вертикальные стойки' },
    { key:'diagonal', label:'Диагональные раскосы' },
    { key:'warren', label:'Warren / треугольники' },
    { key:'pratt', label:'Pratt / стойки + диагонали' },
    { key:'fan', label:'Веерная' },
    { key:'decorative_arc', label:'Декоративные дуги / круги' },
    { key:'reinforced', label:'Усиленная' },
    { key:'custom', label:'Пользовательская' }
  ];

  const PRESETS = {
    naves: {
      econom: { post:'40x40x2', beam:'60x40x2', cross:'40x20x2', crossStep:0.8, waste:7, posts:4 },
      standard: { post:'60x60x2', beam:'80x80x3', cross:'60x40x2', crossStep:0.7, waste:10, posts:4 },
      strong: { post:'80x80x3', beam:'100x100x3', cross:'60x60x2', crossStep:0.6, waste:12, posts:6 }
    },
    perila: {
      econom: { post:'40x40x2', handrail:'40x20x2', fill:'20x20x1.5', postStep:1.2, waste:6 },
      standard: { post:'40x40x2', handrail:'60x40x2', fill:'40x20x2', postStep:1.0, waste:8 },
      strong: { post:'60x60x2', handrail:'80x80x3', fill:'40x40x2', postStep:0.8, waste:10 }
    },
    lestnica: {
      econom: { stringer:'60x40x2', stepFrame:'40x20x2', railing:'40x20x2', waste:6 },
      standard: { stringer:'80x80x3', stepFrame:'60x40x2', railing:'40x40x2', waste:8 },
      strong: { stringer:'100x100x3', stepFrame:'60x60x2', railing:'60x40x2', waste:10 }
    }
  };

  const ROLE_DEFS = [
    { key:'welder', label:'Сварщик', defaultEnabled:true, defaultRate:1200, defaultPeople:2,
      ownOps:[], hint:'Сварка, резка, сборка, замер, подготовка, закупка, зачистка — и всё, что не взяли другие включённые роли.' },
    { key:'painter', label:'Маляр', defaultEnabled:false, defaultRate:1200, defaultPeople:1,
      ownOps:['Покраска / грунтовка'], hint:'Покраска и грунтовка. Если выключено — эти часы считает сварщик.' },
    { key:'mounter', label:'Установщик / монтажник', defaultEnabled:false, defaultRate:1200, defaultPeople:1,
      ownOps:['Монтаж'], hint:'Монтаж на объекте. Если выключено — эти часы считает сварщик.' },
    { key:'helper', label:'Разнорабочий / помощник', defaultEnabled:false, defaultRate:900, defaultPeople:1,
      ownOps:[], hint:'Автоматических часов нет — впишите вручную, если помощник нужен.' }
  ];

  let state = {
    product:'naves',
    preset:'standard',
    prices:{},
    timeOverrides:{},
    roleHoursOverrides:{},
    trussGroups:[],
    trussEnabled:false,
    lastResult:null
  };

  function $(id){ return document.getElementById(id); }
  function safeId(s){ return String(s).replace(/[^a-zA-Z0-9]/g,'_'); }
  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function escapeAttr(value){ return escapeHtml(value); }
  function parseNumber(value, fallback=0){
    const n = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }
  function sanitizeNumericChars(raw, allowNegative){
    let s = String(raw ?? '');
    const neg = allowNegative && s.trim().startsWith('-');
    s = s.replace(/[^0-9.,]/g, '');
    const firstSepMatch = s.match(/[.,]/);
    if(firstSepMatch){
      const idx = s.indexOf(firstSepMatch[0]);
      s = s.slice(0, idx+1) + s.slice(idx+1).replace(/[.,]/g,'');
    }
    return (neg ? '-' : '') + s;
  }
  function attachNumericSanitizers(){
    document.querySelectorAll('input[inputmode="decimal"], input[inputmode="numeric"]').forEach(el=>{
      if(el.dataset.numericBound) return;
      el.dataset.numericBound = '1';
      const allowNegative = (el.min === undefined || el.min === '' || Number(el.min) < 0);
      el.addEventListener('input', ()=>{
        const pos = el.selectionStart;
        const before = el.value;
        const after = sanitizeNumericChars(before, allowNegative);
        if(after !== before){
          el.value = after;
          const diff = before.length - after.length;
          if(pos !== null) el.setSelectionRange(Math.max(0,pos-diff), Math.max(0,pos-diff));
        }
      });
    });
  }
  function inputNumber(id, fallback=0){ const el=$(id); return parseNumber(el ? el.value : fallback, fallback); }
  function inputText(id, fallback=''){ const el=$(id); return el ? el.value : fallback; }
  function selectValue(id, fallback=''){ const el=$(id); return el ? el.value : fallback; }
  function setValue(id, value){ const el=$(id); if(el) el.value = value; }
  function fmt(n, dec=1){
    const x = Number.isFinite(Number(n)) ? Number(n) : 0;
    return x.toLocaleString('ru-RU', { maximumFractionDigits: dec, minimumFractionDigits: dec });
  }
  function fmt0(n){
    const x = Number.isFinite(Number(n)) ? Number(n) : 0;
    return Math.round(x).toLocaleString('ru-RU');
  }
  function money(n){ return fmt0(n) + ' ₽'; }
  function pluralDays(n){
    const x = Math.abs(Math.round(n));
    const mod10 = x % 10, mod100 = x % 100;
    if(mod100 >= 11 && mod100 <= 14) return 'дней';
    if(mod10 === 1) return 'день';
    if(mod10 >= 2 && mod10 <= 4) return 'дня';
    return 'дней';
  }
  function pluralWorkers(n){
    const x = Math.abs(Math.round(n));
    const mod10 = x % 10, mod100 = x % 100;
    if(mod100 >= 11 && mod100 <= 14) return 'рабочих';
    if(mod10 === 1) return 'рабочего';
    if(mod10 >= 2 && mod10 <= 4) return 'рабочих';
    return 'рабочих';
  }
  function m(n){ return fmt(n,1) + ' м'; }
  function kg(n){ return fmt(n,1) + ' кг'; }
  function hasTimeOverrides(){ return Object.keys(state.timeOverrides).length > 0; }
  function attachTimeInputs(){
    document.querySelectorAll('.time-input').forEach(el=>{
      el.addEventListener('input', ()=>{
        const before = el.value;
        const after = sanitizeNumericChars(before, false);
        if(after !== before) el.value = after;
      });
      el.addEventListener('change', ()=>{
        const label = el.getAttribute('data-time-label');
        const val = parseNumber(el.value, NaN);
        if(Number.isFinite(val) && val >= 0){ state.timeOverrides[label] = val; }
        calculate();
      });
    });
    const resetBtn = document.getElementById('resetTimeBtn');
    if(resetBtn) resetBtn.addEventListener('click', ()=>{ state.timeOverrides = {}; calculate(); });
  }

  // ── Роли, оплата ──────────────────────────────────────────────────────
  function renderRolesSection(){
    const wrap = $('rolesContainer');
    if(!wrap) return;
    wrap.innerHTML = ROLE_DEFS.map(def => `
      <div class="role-card">
        <label class="role-head">
          <input type="checkbox" id="role_${def.key}_enabled" ${def.defaultEnabled ? 'checked' : ''}>
          <span class="role-name">${def.label}</span>
        </label>
        <p class="mini role-hint">${def.hint}</p>
        <div class="role-body" id="roleBody_${def.key}">
          <div class="grid2-always">
            <div><label>Оплата</label>
              <select id="role_${def.key}_paymentType">
                <option value="hour">За час</option>
                <option value="day">За день</option>
                <option value="order">За заказ</option>
              </select>
            </div>
            <div id="roleRateWrap_${def.key}"><label id="roleRateLabel_${def.key}">Ставка, ₽/час</label><input id="role_${def.key}_rate" type="text" inputmode="decimal" min="0" step="50" value="${def.defaultRate}"></div>
            <div id="rolePeopleWrap_${def.key}"><label>Людей</label><input id="role_${def.key}_people" type="text" inputmode="numeric" min="1" step="1" value="${def.defaultPeople}"></div>
            <div id="roleHoursWrap_${def.key}"><label>Часы</label><input id="role_${def.key}_hours" type="text" inputmode="decimal" min="0" step="0.5" value="0"></div>
            <div id="roleDaysWrap_${def.key}" class="hidden"><label>Дней</label><input id="role_${def.key}_days" type="text" inputmode="numeric" min="1" step="1" value="1"></div>
            <div id="roleSumWrap_${def.key}" class="hidden"><label>Сумма, ₽</label><input id="role_${def.key}_sum" type="text" inputmode="decimal" min="0" step="500" value="0"></div>
          </div>
        </div>
      </div>
    `).join('');
    attachNumericSanitizers();
    ROLE_DEFS.forEach(def => { attachRoleHandlers(def.key); updateRoleVisibility(def.key); });
    const resetBtn = $('resetRoleHoursBtn');
    if(resetBtn && !resetBtn.dataset.bound){
      resetBtn.dataset.bound = '1';
      resetBtn.addEventListener('click', ()=>{ state.roleHoursOverrides = {}; if(state.lastResult) calculate(); });
    }
  }
  function updateRoleVisibility(key){
    const enabledEl = $('role_'+key+'_enabled');
    const body = $('roleBody_'+key);
    if(!enabledEl || !body) return;
    body.style.display = enabledEl.checked ? '' : 'none';
    if(!enabledEl.checked) return;
    const pt = selectValue('role_'+key+'_paymentType','hour');
    $('roleRateWrap_'+key).classList.toggle('hidden', pt==='order');
    $('roleHoursWrap_'+key).classList.toggle('hidden', pt!=='hour');
    $('roleDaysWrap_'+key).classList.toggle('hidden', pt!=='day');
    $('roleSumWrap_'+key).classList.toggle('hidden', pt!=='order');
    const rateLabel = $('roleRateLabel_'+key);
    if(rateLabel) rateLabel.textContent = pt==='day' ? 'Ставка, ₽/день' : 'Ставка, ₽/час';
  }
  function attachRoleHandlers(key){
    const enabledEl = $('role_'+key+'_enabled');
    const ptEl = $('role_'+key+'_paymentType');
    const hoursEl = $('role_'+key+'_hours');
    if(!enabledEl || enabledEl.dataset.bound) return;
    enabledEl.dataset.bound = '1';
    enabledEl.addEventListener('change', ()=>{ updateRoleVisibility(key); if(state.lastResult) calculate(); });
    ptEl.addEventListener('change', ()=>{ updateRoleVisibility(key); if(state.lastResult) calculate(); });
    hoursEl.addEventListener('change', ()=>{
      const val = parseNumber(hoursEl.value, NaN);
      if(Number.isFinite(val) && val >= 0) state.roleHoursOverrides[key] = val;
      if(state.lastResult) calculate();
    });
    ['role_'+key+'_rate','role_'+key+'_people','role_'+key+'_days','role_'+key+'_sum'].forEach(id=>{
      const el = $(id);
      if(el) el.addEventListener('change', ()=>{ if(state.lastResult) calculate(); });
    });
  }
  function readRolesConfig(){
    const cfg = {};
    ROLE_DEFS.forEach(def=>{
      const enabledEl = $('role_'+def.key+'_enabled');
      cfg[def.key] = {
        key: def.key,
        label: def.label,
        enabled: enabledEl ? enabledEl.checked : def.defaultEnabled,
        paymentType: selectValue('role_'+def.key+'_paymentType','hour'),
        rate: Math.max(0, inputNumber('role_'+def.key+'_rate', def.defaultRate)),
        people: Math.max(1, Math.round(inputNumber('role_'+def.key+'_people', def.defaultPeople))),
        days: Math.max(1, Math.round(inputNumber('role_'+def.key+'_days', 1))),
        sum: Math.max(0, inputNumber('role_'+def.key+'_sum', 0))
      };
    });
    return cfg;
  }
  function computeRoleAutoHours(time, rolesCfg){
    const claimed = new Set();
    const totalPersonHours = { welder:0, painter:0, mounter:0, helper:0 };
    ROLE_DEFS.forEach(def=>{
      if(def.key==='welder' || !def.ownOps.length) return;
      if(rolesCfg[def.key] && rolesCfg[def.key].enabled){
        time.forEach(t=>{ if(def.ownOps.includes(t.label)){ totalPersonHours[def.key]+=t.hours; claimed.add(t.label); } });
      }
    });
    time.forEach(t=>{ if(!claimed.has(t.label)) totalPersonHours.welder += t.hours; });
    // Таблица времени даёт суммарные человеко-часы операции. «Часы» роли в формуле —
    // это часы НА ОДНОГО человека (как в люди×ставка×часы), поэтому делим на людей роли.
    const perPerson = {};
    ROLE_DEFS.forEach(def=>{
      const people = (rolesCfg[def.key] && rolesCfg[def.key].people) || 1;
      perPerson[def.key] = totalPersonHours[def.key] / Math.max(1, people);
    });
    return perPerson;
  }
  function roleEffectiveHours(key, autoHours){
    const ov = state.roleHoursOverrides[key];
    return (ov !== undefined && Number.isFinite(ov)) ? ov : (autoHours[key] || 0);
  }
  function refreshRoleAutoHours(r){
    const autoH = computeRoleAutoHours(r.time, readRolesConfig());
    ROLE_DEFS.forEach(def=>{
      const el = $('role_'+def.key+'_hours');
      if(!el) return;
      if(state.roleHoursOverrides[def.key] === undefined){
        el.value = fmt(autoH[def.key] || 0, 1);
      }
    });
  }
  function profile(name){ return PROFILE_CATALOG.find(p=>p.name===name) || PROFILE_CATALOG[0]; }
  function profileExists(name){ return PROFILE_CATALOG.some(p=>p.name === name); }
  function normalizeProfileName(name, fallback){
    return profileExists(name) ? name : fallback;
  }
  function priceSettings(name){
    if(!state.prices[name]){
      const p = profile(name);
      state.prices[name] = { type:p.defaultType, value:p.defaultValue };
    }
    return state.prices[name];
  }
  function pricePerMeter(name){
    const p = profile(name);
    const ps = priceSettings(name);
    const value = Math.max(0, parseNumber(ps.value, 0));
    if(ps.type === 'stick') return value / STICK_LENGTH;
    if(ps.type === 'meter') return value;
    if(ps.type === 'kg') return value * p.kgPerM;
    if(ps.type === 'ton') return (value / 1000) * p.kgPerM;
    return value;
  }
  function pricePerStick(name){ return pricePerMeter(name) * STICK_LENGTH; }

  function storageGet(key){
    try { return window.localStorage ? window.localStorage.getItem(key) : null; }
    catch(e){ return null; }
  }
  function storageSet(key, value){
    try { if(window.localStorage){ window.localStorage.setItem(key, value); return true; } }
    catch(e){ return false; }
    return false;
  }

  function defaultRolesData(){
    const roles = {};
    ROLE_DEFS.forEach(def=>{ roles[def.key] = { enabled:def.defaultEnabled, paymentType:'hour', rate:def.defaultRate, people:def.defaultPeople, days:1, sum:0 }; });
    return roles;
  }
  function applyRolesData(roles){
    ROLE_DEFS.forEach(def=>{
      const r = (roles && roles[def.key]) || {};
      const d = { enabled:def.defaultEnabled, paymentType:'hour', rate:def.defaultRate, people:def.defaultPeople, days:1, sum:0 };
      const enabledEl = $('role_'+def.key+'_enabled');
      if(enabledEl) enabledEl.checked = (r.enabled !== undefined) ? r.enabled : d.enabled;
      setValue('role_'+def.key+'_paymentType', r.paymentType ?? d.paymentType);
      setValue('role_'+def.key+'_rate', r.rate ?? d.rate);
      setValue('role_'+def.key+'_people', r.people ?? d.people);
      setValue('role_'+def.key+'_days', r.days ?? d.days);
      setValue('role_'+def.key+'_sum', r.sum ?? d.sum);
      updateRoleVisibility(def.key);
    });
  }
  function readRolesData(){
    const cfg = readRolesConfig();
    const out = {};
    ROLE_DEFS.forEach(def=>{ const c=cfg[def.key]; out[def.key] = { enabled:c.enabled, paymentType:c.paymentType, rate:c.rate, people:c.people, days:c.days, sum:c.sum }; });
    return out;
  }
  function defaultSettings(){
    const prices = {};
    PROFILE_CATALOG.forEach(p=> prices[p.name] = { type:p.defaultType, value:p.defaultValue });
    return {
      prices,
      roles: defaultRolesData(),
      materialMarkupType:'percent', materialMarkupValue:30,
      laborMarkupType:'percent', laborMarkupValue:20,
      consumablesFixed:1500,
      consumablesRate:120
    };
  }
  function readProductSettings(){
    const fields = {};
    document.querySelectorAll('#paramsContainer input, #paramsContainer select, #profileSelects select').forEach(el=>{
      if(el.id) fields[el.id] = el.value;
    });
    syncTrussStateFromDom();
    return { product:state.product, preset:state.preset, fields, trussEnabled:state.trussEnabled, trussGroups:state.trussGroups };
  }
  function applyProductSettings(saved){
    if(!saved || !PRESETS[saved.product] || !PRESETS[saved.product][saved.preset]) return;
    setProduct(saved.product);
    setPreset(saved.preset);
    Object.entries(saved.fields || {}).forEach(([id, value])=>setValue(id, value));
    if(saved.trussGroups){
      state.trussEnabled = !!saved.trussEnabled;
      state.trussGroups = saved.trussGroups;
      renderTrussSection();
    }
  }
  function loadSettings(){
    const defaults = defaultSettings();
    let saved = {};
    try { saved = JSON.parse(storageGet(STORAGE_KEY) || '{}') || {}; } catch(e){ saved = {}; }
    state.prices = Object.assign({}, defaults.prices, saved.prices || {});
    PROFILE_CATALOG.forEach(p=>{ if(!state.prices[p.name]) state.prices[p.name] = {type:p.defaultType,value:p.defaultValue}; });
    renderPrices();
    ['materialMarkupType','materialMarkupValue','laborMarkupType','laborMarkupValue','consumablesFixed','consumablesRate'].forEach(k=>{
      setValue(k, saved[k] ?? defaults[k]);
    });
    applyRolesData(saved.roles || defaults.roles);
    applyProductSettings(saved.productSettings);
  }
  function readPriceCards(){
    PROFILE_CATALOG.forEach(p=>{
      const id = safeId(p.name);
      state.prices[p.name] = {
        type: selectValue('priceType_' + id, p.defaultType),
        value: Math.max(0, inputNumber('priceValue_' + id, p.defaultValue))
      };
    });
  }
  function saveSettings(){
    readPriceCards();
    const data = {
      prices: state.prices,
      roles: readRolesData(),
      productSettings: readProductSettings(),
      materialMarkupType: selectValue('materialMarkupType','percent'),
      materialMarkupValue: Math.max(0, inputNumber('materialMarkupValue', 30)),
      laborMarkupType: selectValue('laborMarkupType','percent'),
      laborMarkupValue: Math.max(0, inputNumber('laborMarkupValue', 20)),
      consumablesFixed: Math.max(0, inputNumber('consumablesFixed', 1500)),
      consumablesRate: Math.max(0, inputNumber('consumablesRate', 120))
    };
    const savedOk = storageSet(STORAGE_KEY, JSON.stringify(data));
    showMsg('settingsMsg', savedOk ? 'Сохранено на этом телефоне.' : 'Сохранено временно. Браузер не дал доступ к localStorage.');
  }
  function resetSettings(){
    const defaults = defaultSettings();
    state.prices = defaults.prices;
    storageSet(STORAGE_KEY, JSON.stringify(defaults));
    renderPrices();
    ['materialMarkupType','materialMarkupValue','laborMarkupType','laborMarkupValue','consumablesFixed','consumablesRate'].forEach(k=>setValue(k, defaults[k]));
    applyRolesData(defaults.roles);
    state.roleHoursOverrides = {};
    state.timeOverrides = {};
    state.trussEnabled = false;
    state.trussGroups = [defaultTrussGroup(1)];
    renderTrussSection();
    showMsg('settingsMsg', 'Настройки сброшены.');
  }
  function showMsg(id, text){ const el=$(id); if(el){ el.textContent=text; el.style.display='block'; setTimeout(()=>{el.style.display='none';}, 2500); } }

  function renderPrices(){
    const wrap = $('priceCards');
    wrap.innerHTML = PROFILE_CATALOG.map(p=>{
      const id = safeId(p.name);
      const ps = priceSettings(p.name);
      return `<div class="price-card" data-profile="${p.name}">
        <div class="price-title"><strong>${p.name}</strong><span>${fmt(p.kgPerM,2)} кг/м · rank ${p.rank}</span></div>
        <div class="grid2">
          <div><label for="priceType_${id}">Тип цены</label><select id="priceType_${id}" data-price-type="${p.name}">
            <option value="stick" ${ps.type==='stick'?'selected':''}>за хлыст 6 м</option>
            <option value="meter" ${ps.type==='meter'?'selected':''}>за метр</option>
            <option value="kg" ${ps.type==='kg'?'selected':''}>за кг</option>
            <option value="ton" ${ps.type==='ton'?'selected':''}>за тонну</option>
          </select></div>
          <div><label for="priceValue_${id}">Значение, ₽</label><input id="priceValue_${id}" data-price-value="${p.name}" type="text" inputmode="decimal" min="0" step="0.01" value="${ps.value}"></div>
        </div>
        <div class="price-live" id="priceLive_${id}">—</div>
      </div>`;
    }).join('');
    PROFILE_CATALOG.forEach(p=>updatePriceLive(p.name));
    attachNumericSanitizers();
  }
  function updatePriceLive(name){
    const id = safeId(name);
    const typeEl = $('priceType_' + id);
    const valueEl = $('priceValue_' + id);
    if(typeEl && valueEl){
      state.prices[name] = { type:typeEl.value, value:Math.max(0, parseNumber(valueEl.value,0)) };
    }
    const el = $('priceLive_' + id);
    if(el){ el.innerHTML = `<strong>${money(pricePerMeter(name))}/м</strong> · ${money(pricePerStick(name))}/хлыст`; }
  }


  // ── Фермы навеса ──────────────────────────────────────────────────────
  function trussTypeLabel(key){
    const t = TRUSS_TYPES.find(x=>x.key===key);
    return t ? t.short : key;
  }
  function trussPatternLabel(key){
    const t = TRUSS_WEB_PATTERNS.find(x=>x.key===key);
    return t ? t.label : key;
  }
  function canopySchemeLabel(key){
    if(key === 'wall_one_post') return 'Стена + 1 передняя стойка';
    if(key === 'wall_two_posts') return 'Стена + 2 передние стойки';
    if(key === 'free_posts') return 'Свободностоящий на стойках';
    return 'Авто / обычная';
  }
  function makeTrussId(){
    return 'truss_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*1000);
  }
  function defaultTrussGroup(i=1){
    return {
      id: makeTrussId(),
      name: i === 1 ? 'Основные фермы' : `Группа ферм ${i}`,
      type: 'straight_parallel',
      webPattern: 'triangle',
      count: 4,
      span: 6,
      height: 0.6,
      rise: 0.8,
      segments: 6,
      profileTop: '60x40x2',
      profileBottom: '60x40x2',
      profileWeb: '40x20x2',
      loadZone: 'standard',
      loadNote: 'обычная зона навеса',
      customText: ''
    };
  }
  function ensureTrussState(){
    if(!Array.isArray(state.trussGroups) || !state.trussGroups.length){
      state.trussGroups = [defaultTrussGroup(1)];
    }
    const seen = new Set();
    state.trussGroups = state.trussGroups.map((g, idx)=>{
      const safeExistingId = /^[a-zA-Z0-9_-]+$/.test(String(g.id || '')) ? String(g.id) : '';
      const id = safeExistingId && !seen.has(safeExistingId) ? safeExistingId : makeTrussId();
      seen.add(id);
      return Object.assign({}, g, { id, name: g.name || `Группа ферм ${idx+1}` });
    });
  }
  function trussSelectOptions(items, selected){
    return items.map(x=>`<option value="${x.key}" ${x.key===selected?'selected':''}>${x.label}</option>`).join('');
  }
  function profileOptions(selected){
    return PROFILE_CATALOG.map(p=>`<option value="${p.name}" ${p.name===selected?'selected':''}>${p.name}</option>`).join('');
  }
  function renderTrussSection(){
    const details = $('trussDetails');
    if(!details) return;
    details.classList.toggle('hidden', state.product !== 'naves');
    if(state.product !== 'naves') return;
    ensureTrussState();
    const defaultProfile = $('trussDefaultProfile');
    if(defaultProfile && !defaultProfile.innerHTML){
      defaultProfile.innerHTML = profileOptions(selectValue('profileBeam','60x40x2'));
    }
    const enabledEl = $('trussEnabled');
    if(enabledEl) enabledEl.value = state.trussEnabled ? 'yes' : 'no';
    const wrap = $('trussGroupsContainer');
    if(!wrap) return;
    wrap.innerHTML = state.trussGroups.map((g, idx)=>`
      <div class="truss-card" data-truss-id="${escapeAttr(g.id)}">
        <div class="truss-card-head">
          <strong>G${idx+1}. ${escapeHtml(g.name || 'Группа ферм')}</strong>
          <button class="btn secondary truss-remove" type="button" data-truss-remove="${escapeAttr(g.id)}">Удалить</button>
        </div>
        <div class="grid2">
          <div><label>Название группы</label><input id="truss_${g.id}_name" type="text" value="${escapeAttr(g.name || '')}"></div>
          <div><label>Тип фермы</label><select id="truss_${g.id}_type">${trussSelectOptions(TRUSS_TYPES, g.type)}</select></div>
          <div><label>Схема решётки</label><select id="truss_${g.id}_webPattern">${trussSelectOptions(TRUSS_WEB_PATTERNS, g.webPattern)}</select></div>
          <div><label>Количество, шт</label><input id="truss_${g.id}_count" type="text" inputmode="numeric" min="0" step="1" value="${g.count}"></div>
          <div><label>Пролёт, м</label><input id="truss_${g.id}_span" type="text" inputmode="decimal" min="0" step="0.1" value="${g.span}"></div>
          <div><label>Высота фермы, м</label><input id="truss_${g.id}_height" type="text" inputmode="decimal" min="0" step="0.05" value="${g.height}"></div>
          <div><label>Подъём дуги / конёк, м</label><input id="truss_${g.id}_rise" type="text" inputmode="decimal" min="0" step="0.05" value="${g.rise}"></div>
          <div><label>Сегментов решётки</label><input id="truss_${g.id}_segments" type="text" inputmode="numeric" min="1" step="1" value="${g.segments}"></div>
          <div><label>Верхний пояс</label><select id="truss_${g.id}_profileTop">${profileOptions(g.profileTop)}</select></div>
          <div><label>Нижний пояс</label><select id="truss_${g.id}_profileBottom">${profileOptions(g.profileBottom)}</select></div>
          <div><label>Раскосы / стойки</label><select id="truss_${g.id}_profileWeb">${profileOptions(g.profileWeb)}</select></div>
          <div><label>Зона нагрузки</label><select id="truss_${g.id}_loadZone">
            <option value="standard" ${g.loadZone==='standard'?'selected':''}>Обычная</option>
            <option value="reinforced" ${g.loadZone==='reinforced'?'selected':''}>Усиленная</option>
            <option value="decorative" ${g.loadZone==='decorative'?'selected':''}>Декоративная</option>
            <option value="custom" ${g.loadZone==='custom'?'selected':''}>Своя</option>
          </select></div>
        </div>
        <label>Примечание по нагрузке</label>
        <input id="truss_${g.id}_loadNote" type="text" value="${escapeAttr(g.loadNote || '')}">
        <label>Ручные элементы для пользовательской / нестандартной фермы</label>
        <textarea id="truss_${g.id}_customText" class="truss-custom" placeholder="Формат: профиль; длина одного элемента, м; количество на одну ферму&#10;Например: 40x20x2;1.2;8">${escapeHtml(g.customText || '')}</textarea>
        <p class="mini">Если тип «Пользовательская», приложение считает только ручные элементы. Для остальных типов ручные элементы добавляются сверху к ориентировочной геометрии.</p>
      </div>
    `).join('');
    attachNumericSanitizers();
  }
  function syncTrussStateFromDom(){
    ensureTrussState();
    const enabledEl = $('trussEnabled');
    state.trussEnabled = enabledEl ? enabledEl.value === 'yes' : false;
    if(!Array.isArray(state.trussGroups)) state.trussGroups = [];
    state.trussGroups = state.trussGroups.map(g=>{
      const id = g.id;
      return Object.assign({}, g, {
        name: inputText(`truss_${id}_name`, g.name),
        type: selectValue(`truss_${id}_type`, g.type),
        webPattern: selectValue(`truss_${id}_webPattern`, g.webPattern),
        count: Math.max(0, Math.round(inputNumber(`truss_${id}_count`, g.count))),
        span: Math.max(0, inputNumber(`truss_${id}_span`, g.span)),
        height: Math.max(0, inputNumber(`truss_${id}_height`, g.height)),
        rise: Math.max(0, inputNumber(`truss_${id}_rise`, g.rise)),
        segments: Math.max(1, Math.round(inputNumber(`truss_${id}_segments`, g.segments))),
        profileTop: selectValue(`truss_${id}_profileTop`, g.profileTop),
        profileBottom: selectValue(`truss_${id}_profileBottom`, g.profileBottom),
        profileWeb: selectValue(`truss_${id}_profileWeb`, g.profileWeb),
        loadZone: selectValue(`truss_${id}_loadZone`, g.loadZone),
        loadNote: inputText(`truss_${id}_loadNote`, g.loadNote),
        customText: inputText(`truss_${id}_customText`, g.customText)
      });
    });
  }
  function addTrussGroup(){
    syncTrussStateFromDom();
    const n = state.trussGroups.length + 1;
    const g = defaultTrussGroup(n);
    const def = selectValue('trussDefaultProfile', selectValue('profileBeam','60x40x2'));
    g.profileTop = def; g.profileBottom = def; g.profileWeb = selectValue('profileCross','40x20x2');
    state.trussGroups.push(g);
    renderTrussSection();
  }
  function removeTrussGroup(id){
    syncTrussStateFromDom();
    state.trussGroups = state.trussGroups.filter(g=>g.id !== id);
    if(!state.trussGroups.length) state.trussGroups = [defaultTrussGroup(1)];
    renderTrussSection();
    if(state.lastResult) calculate();
  }
  function parseCustomTrussElements(text, truss){
    const out = [];
    const warnings = [];
    String(text || '').split(/\n+/).forEach((row, idx)=>{
      const parts = row.split(';').map(x=>x.trim()).filter(Boolean);
      if(parts.length < 3) return;
      const prof = parts[0];
      const len = Math.max(0, parseNumber(parts[1], 0));
      const qty = Math.max(0, Math.round(parseNumber(parts[2], 0)));
      if(!prof || len <= 0 || qty <= 0) return;
      if(!profileExists(prof)){
        warnings.push(`Фермы ${truss.name || 'группа'}: ручной элемент ${idx+1} пропущен — профиль «${prof}» не найден в каталоге.`);
        return;
      }
      out.push({ label:`Фермы ${truss.name}: ручной элемент ${idx+1} (${qty} шт/ферму)`, profile:prof, length:len * qty * truss.count });
    });
    return { lines:out, warnings };
  }
  function archLengthByRise(span, rise){
    if(span <= 0) return 0;
    if(rise <= 0) return span * 1.05;
    const R = (span*span)/(8*rise) + rise/2;
    const theta = 2 * Math.asin(Math.min(1, span/(2*R)));
    return R * theta;
  }
  function webLengthForTruss(type, pattern, span, height, rise, segments){
    const seg = Math.max(1, segments);
    const h = Math.max(0.05, type === 'arched' ? Math.max(rise, height) : height);
    const step = span / seg;
    const diag = Math.sqrt(step*step + h*h);
    if(pattern === 'vertical') return Math.max(0, seg - 1) * h;
    if(pattern === 'diagonal' || pattern === 'triangle' || pattern === 'warren') return seg * diag;
    if(pattern === 'pratt') return Math.max(0, seg - 1) * h + seg * diag;
    if(pattern === 'fan') return seg * Math.sqrt(Math.pow(span/(2*seg),2) + h*h) * 1.15;
    if(pattern === 'decorative_arc') return seg * h * 1.55;
    if(pattern === 'reinforced') return (Math.max(0, seg - 1) * h + seg * diag) * 1.25;
    if(pattern === 'custom') return seg * diag * 0.75;
    return seg * diag;
  }
  function calcOneTrussGeometry(g){
    const span = Math.max(0, g.span);
    const height = Math.max(0.05, g.height);
    const rise = Math.max(0, g.rise);
    const segments = Math.max(1, g.segments);
    let topLen = span, bottomLen = span;
    if(g.type === 'mono_slope') topLen = Math.sqrt(span*span + Math.max(rise, height*0.5)**2);
    if(g.type === 'gable') topLen = 2 * Math.sqrt(Math.pow(span/2,2) + Math.max(rise, height)**2);
    if(g.type === 'arched') topLen = archLengthByRise(span, Math.max(rise, height));
    if(g.type === 'cantilever'){ topLen = span; bottomLen = span * 0.65; }
    if(g.type === 'combined'){ topLen = span * 1.12; bottomLen = span; }
    if(g.type === 'custom'){ topLen = 0; bottomLen = 0; }
    const webLen = g.type === 'custom' ? 0 : webLengthForTruss(g.type, g.webPattern, span, height, rise, segments);
    return { topLen, bottomLen, webLen };
  }
  function calculateTrussGroupsForProduct(defaultSpan, defaultDepth, defaultTopProfile, defaultWebProfile){
    syncTrussStateFromDom();
    if(!state.trussEnabled) return { enabled:false, groups:[], lines:[], summary:'', hasArched:false, warnings:[] };
    const warnings = [];
    const groups = state.trussGroups.map((g, i)=>{
      const groupName = g.name || `Группа ферм ${i+1}`;
      const topProfile = normalizeProfileName(g.profileTop, defaultTopProfile);
      const bottomProfile = normalizeProfileName(g.profileBottom, defaultTopProfile);
      const webProfile = normalizeProfileName(g.profileWeb, defaultWebProfile);
      if(g.profileTop && g.profileTop !== topProfile) warnings.push(`Фермы ${groupName}: верхний пояс «${g.profileTop}» не найден — принят ${topProfile}.`);
      if(g.profileBottom && g.profileBottom !== bottomProfile) warnings.push(`Фермы ${groupName}: нижний пояс «${g.profileBottom}» не найден — принят ${bottomProfile}.`);
      if(g.profileWeb && g.profileWeb !== webProfile) warnings.push(`Фермы ${groupName}: решётка «${g.profileWeb}» не найдена — принят ${webProfile}.`);
      return Object.assign({}, g, {
        name: groupName,
        span: g.span > 0 ? g.span : defaultSpan,
        height: g.height > 0 ? g.height : 0.6,
        rise: g.rise > 0 ? g.rise : 0.8,
        count: Math.max(0, Math.round(g.count || 0)),
        segments: Math.max(1, Math.round(g.segments || 6)),
        profileTop: topProfile,
        profileBottom: bottomProfile,
        profileWeb: webProfile
      });
    }).filter(g=>g.count>0 && g.span>0);
    const lines = [];
    const normalized = [];
    groups.forEach((g, i)=>{
      const geo = calcOneTrussGeometry(g);
      if(geo.topLen>0) lines.push({ label:`Фермы G${i+1} ${g.name}: верхний пояс`, profile:g.profileTop, length:geo.topLen * g.count });
      if(geo.bottomLen>0) lines.push({ label:`Фермы G${i+1} ${g.name}: нижний пояс`, profile:g.profileBottom, length:geo.bottomLen * g.count });
      if(geo.webLen>0) lines.push({ label:`Фермы G${i+1} ${g.name}: решётка ${trussPatternLabel(g.webPattern)}`, profile:g.profileWeb, length:geo.webLen * g.count });
      const custom = parseCustomTrussElements(g.customText, g);
      custom.lines.forEach(x=>lines.push(x));
      warnings.push(...custom.warnings);
      normalized.push(Object.assign({}, g, geo, { typeLabel:trussTypeLabel(g.type), patternLabel:trussPatternLabel(g.webPattern), number:i+1 }));
    });
    return {
      enabled:true,
      groups: normalized,
      lines,
      summary: normalized.map(g=>`G${g.number}: ${g.typeLabel}, ${g.count} шт`).join('; '),
      hasArched: normalized.some(g=>g.type==='arched'),
      warnings
    };
  }
  function trussGroupsHtml(groups){
    if(!groups || !groups.length) return '';
    return `<div class="note"><strong>Фермы навеса:</strong><br>${groups.map(g=>`G${g.number}: ${escapeHtml(g.name)} — ${escapeHtml(g.typeLabel)}, ${g.count} шт, пролёт ${fmt(g.span,2)} м, ${g.type==='arched'?'подъём '+fmt(g.rise,2)+' м':'высота '+fmt(g.height,2)+' м'}, решётка: ${escapeHtml(g.patternLabel)}`).join('<br>')}<br><span class="mini">Расчёт ферм предварительный. Несущая способность требует инженерной проверки.</span></div>`;
  }

  function renderParams(){
    const c = $('paramsContainer');
    if(state.product === 'naves'){
      c.innerHTML = `<div class="grid2-always">
        <div><label>Ширина, м</label><input id="width" type="text" inputmode="decimal" min="0" step="0.1" value="4"></div>
        <div><label>Вылет, м</label><input id="depth" type="text" inputmode="decimal" min="0" step="0.1" value="3"></div>
        <div><label>Высота у края, м</label><input id="height" type="text" inputmode="decimal" min="0" step="0.1" value="2.5"></div>
        <div><label>Высота у стены, м</label><input id="height2" type="text" inputmode="decimal" min="0" step="0.1" value="3"></div>
        <div><label>Кол-во стоек</label><input id="posts" type="text" inputmode="numeric" min="2" step="1" value="4"></div>
        <div><label>Шаг поперечин, м</label><input id="crossStep" type="text" inputmode="decimal" min="0.3" step="0.05" value="0.7"></div>
        <div><label>Примыкание к стене</label><select id="wallSide">
          <option value="none">Отдельностоящий</option>
          <option value="back">Одна стена (сзади)</option>
          <option value="back_left">Две стены (угол)</option>
          <option value="three">Три стены (П-образный)</option>
        </select></div>
        <div><label>Запас на резку, %</label><input id="waste" type="text" inputmode="decimal" min="0" step="1" value="10"></div>
        <div><label>Покрытие</label><select id="coverType"><option value="polycarb">Поликарбонат</option><option value="prof">Профнастил</option><option value="metalTile">Металлочерепица</option></select></div>
        <div><label>Цена покрытия, ₽/м²</label><input id="coverPrice" type="text" inputmode="decimal" min="0" step="10" value="600"></div>
        <div><label>Покраска</label><select id="paint"><option value="no">Нет</option><option value="yes">Да</option></select></div>
        <div><label>Монтаж</label><select id="mount"><option value="yes">Да</option><option value="no">Нет</option></select></div>
      </div>`;
    } else if(state.product === 'perila'){
      c.innerHTML = `<div class="grid2-always">
        <div><label>Горизонтальная длина / проекция, м</label><input id="length" type="text" inputmode="decimal" min="0" step="0.1" value="5"></div>
        <div><label>Высота перил, м</label><input id="height" type="text" inputmode="decimal" min="0" step="0.05" value="1"></div>
        <div><label>Шаг стоек, м</label><input id="postStep" type="text" inputmode="decimal" min="0.3" step="0.05" value="1"></div>
        <div><label>Угол перил, °</label><input id="railingAngle" type="text" inputmode="decimal" min="0" max="60" step="1" value="0"></div>
        <div><label>Запас на резку, %</label><input id="waste" type="text" inputmode="decimal" min="0" step="1" value="8"></div>
        <div><label>Тип перил</label><select id="railingType"><option value="straight">Прямые</option><option value="stair">Лестничные</option><option value="outdoor">Уличные</option><option value="balcony">Балконные</option></select></div>
        <p class="mini" style="grid-column:1/-1;margin:-4px 0 4px">Длина — это горизонтальное расстояние (проекция), а не длина вдоль наклона. При угле больше 0° поручень и направляющие будут длиннее заданной длины — приложение пересчитает их само. При выборе «Лестничные» угол подставится автоматически (30°), но его можно изменить.</p>
        <div><label>Заполнение</label><select id="fillType"><option value="vertical">Вертикальное</option><option value="horizontal">Горизонтальное</option><option value="none">Без заполнения</option></select></div>
        <div><label>Шаг заполнения, м</label><input id="fillStep" type="text" inputmode="decimal" min="0.05" step="0.01" value="0.15"></div>
        <div><label>Горизонтальных рядов</label><input id="horizontalRows" type="text" inputmode="numeric" min="1" step="1" value="3"></div>
        <div><label>Крепление</label><select id="mountType"><option value="top">Сверху</option><option value="side">Сбоку</option><option value="concrete">К бетону</option><option value="metal">К металлу</option><option value="wood">К дереву</option></select></div>
        <div><label>Покраска</label><select id="paint"><option value="no">Нет</option><option value="yes">Да</option></select></div>
        <div><label>Монтаж</label><select id="mount"><option value="yes">Да</option><option value="no">Нет</option></select></div>
      </div>`;
    } else {
      c.innerHTML = `<div class="grid2-always">
        <div><label>Высота подъёма, м</label><input id="totalHeight" type="text" inputmode="decimal" min="0" step="0.05" value="2.8"></div>
        <div><label>Длина проекции, м</label><input id="projectionLength" type="text" inputmode="decimal" min="0" step="0.05" value="3.5"></div>
        <div><label>Ширина лестницы, м</label><input id="stairWidth" type="text" inputmode="decimal" min="0.3" step="0.05" value="1"></div>
        <div><label>Ступеней (0 = авто)</label><input id="stepsCount" type="text" inputmode="numeric" min="0" step="1" value="0"></div>
        <div><label>Тип лестницы</label><select id="stairType"><option value="straight">Прямая</option><option value="withPlatform">С площадкой</option><option value="outdoor">Уличная</option><option value="indoor">Внутренняя</option></select></div>
        <div><label>Материал ступеней</label><select id="stepMaterial"><option value="metal">Металл</option><option value="wood">Дерево</option><option value="concrete">Бетон / уточнить</option></select></div>
        <div><label>Цена ступеней, ₽/м²</label><input id="stepMaterialPrice" type="text" inputmode="decimal" min="0" step="100" value="2500"></div>
        <div><label>Перила</label><select id="hasRailing"><option value="yes">Да</option><option value="no">Нет</option></select></div>
        <div><label>Запас на резку, %</label><input id="waste" type="text" inputmode="decimal" min="0" step="1" value="8"></div>
        <div><label>Покраска</label><select id="paint"><option value="no">Нет</option><option value="yes">Да</option></select></div>
        <div><label>Монтаж</label><select id="mount"><option value="yes">Да</option><option value="no">Нет</option></select></div>
      </div>`;
    }
  }
  function renderProfiles(){
    const options = PROFILE_CATALOG.map(p=>`<option value="${p.name}">${p.name}</option>`).join('');
    const wrap = $('profileSelects');
    if(state.product === 'naves'){
      wrap.innerHTML = `<div class="grid2"><div><label>Стойки</label><select id="profilePost">${options}</select></div><div><label>Балки / рама</label><select id="profileBeam">${options}</select></div><div><label>Поперечины</label><select id="profileCross">${options}</select></div></div>`;
    } else if(state.product === 'perila'){
      wrap.innerHTML = `<div class="grid2"><div><label>Стойки</label><select id="profilePost">${options}</select></div><div><label>Поручень</label><select id="profileHandrail">${options}</select></div><div><label>Заполнение</label><select id="profileFill">${options}</select></div></div>`;
    } else {
      wrap.innerHTML = `<div class="grid2"><div><label>Косоур</label><select id="profileStringer">${options}</select></div><div><label>Каркас ступеней</label><select id="profileStepFrame">${options}</select></div><div><label>Перила</label><select id="profileRailing">${options}</select></div></div>`;
    }
  }
  function setProduct(productName){
    state.product = productName;
    state.timeOverrides = {};
    state.roleHoursOverrides = {};
    document.querySelectorAll('[data-product]').forEach(btn=>{ const active = btn.dataset.product===productName; btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', active ? 'true' : 'false'); });
    renderParams();
    renderProfiles();
    renderTrussSection();
    updateConsumablesHint();
    applyPreset(state.preset);
    clearValidation();
    attachNumericSanitizers();
    attachRailingTypeHandler();
    if(state.lastResult) setTimeout(calculate, 0);
  }
  function attachRailingTypeHandler(){
    const sel = $('railingType');
    const angleEl = $('railingAngle');
    if(sel && !sel.dataset.angleBound){
      sel.dataset.angleBound = '1';
      sel.addEventListener('change', ()=>{
        const el = $('railingAngle');
        if(!el) return;
        const current = parseNumber(el.value, 0);
        if(sel.value === 'stair' && current === 0){
          el.value = '30';
        }
        if(state.lastResult) calculate();
      });
    }
    if(angleEl && !angleEl.dataset.recalcBound){
      angleEl.dataset.recalcBound = '1';
      angleEl.addEventListener('change', ()=>{ if(state.lastResult) calculate(); });
    }
  }
  function setPreset(presetName){
    state.preset = presetName;
    document.querySelectorAll('[data-preset]').forEach(btn=>{ const active = btn.dataset.preset===presetName; btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', active ? 'true' : 'false'); });
    applyPreset(presetName);
    if(state.lastResult) setTimeout(calculate, 0);
  }
  function applyPreset(presetName){
    const p = PRESETS[state.product][presetName];
    if(!p) return;
    if(state.product === 'naves'){
      setValue('profilePost', p.post); setValue('profileBeam', p.beam); setValue('profileCross', p.cross);
      setValue('crossStep', p.crossStep); setValue('waste', p.waste); setValue('posts', p.posts);
      const trussDefault = $('trussDefaultProfile');
      if(trussDefault) trussDefault.value = p.beam;
    } else if(state.product === 'perila'){
      setValue('profilePost', p.post); setValue('profileHandrail', p.handrail); setValue('profileFill', p.fill);
      setValue('postStep', p.postStep); setValue('waste', p.waste);
    } else {
      setValue('profileStringer', p.stringer); setValue('profileStepFrame', p.stepFrame); setValue('profileRailing', p.railing);
      setValue('waste', p.waste);
    }
  }
  function updateConsumablesHint(){
    const hint = $('consumablesHint');
    if(state.product === 'naves') hint.textContent = 'Для навеса переменные расходники считаются за м² площади.';
    if(state.product === 'perila') hint.textContent = 'Для перил переменные расходники считаются за погонный метр.';
    if(state.product === 'lestnica') hint.textContent = 'Для лестницы переменные расходники считаются за ступень.';
  }

  function calcPurchase(groups, wastePercent){
    const aggregated = {};
    groups.forEach(g=>{
      if(!g || !g.profile || !Number.isFinite(g.length) || g.length <= 0) return;
      if(!aggregated[g.profile]) aggregated[g.profile] = { profile:g.profile, rawLength:0, labels:[] };
      aggregated[g.profile].rawLength += g.length;
      aggregated[g.profile].labels.push(g.label);
    });
    const lines = Object.values(aggregated).map(line=>{
      const p = profile(line.profile);
      const lengthWithWaste = line.rawLength * (1 + wastePercent / 100);
      const sticks = lengthWithWaste > 0 ? Math.ceil(lengthWithWaste / STICK_LENGTH) : 0;
      const purchasedMeters = sticks * STICK_LENGTH;
      const leftoverMeters = Math.max(0, purchasedMeters - lengthWithWaste);
      const weight = lengthWithWaste * p.kgPerM;
      const purchaseWeight = purchasedMeters * p.kgPerM;
      const ppm = pricePerMeter(line.profile);
      const pps = pricePerStick(line.profile);
      const purchaseCost = sticks * pps;
      return Object.assign(line, { lengthWithWaste, sticks, purchasedMeters, leftoverMeters, weight, purchaseWeight, ppm, pps, purchaseCost, kgPerM:p.kgPerM });
    });
    return {
      lines,
      totalNeeded: lines.reduce((s,l)=>s+l.lengthWithWaste,0),
      totalSticks: lines.reduce((s,l)=>s+l.sticks,0),
      totalPurchased: lines.reduce((s,l)=>s+l.purchasedMeters,0),
      totalLeftover: lines.reduce((s,l)=>s+l.leftoverMeters,0),
      totalWeight: lines.reduce((s,l)=>s+l.weight,0),
      totalPurchaseWeight: lines.reduce((s,l)=>s+l.purchaseWeight,0),
      metalCost: lines.reduce((s,l)=>s+l.purchaseCost,0)
    };
  }
  function workSettings(){
    return {
      materialMarkupType: selectValue('materialMarkupType','percent'),
      materialMarkupValue: Math.max(0, inputNumber('materialMarkupValue',30)),
      laborMarkupType: selectValue('laborMarkupType','percent'),
      laborMarkupValue: Math.max(0, inputNumber('laborMarkupValue',20)),
      consumablesFixed: Math.max(0, inputNumber('consumablesFixed',1500)),
      consumablesRate: Math.max(0, inputNumber('consumablesRate',120))
    };
  }
  function applyMarkup(base, type, value){
    if(type === 'fixed') return base + Math.max(0, value);
    return base * (1 + Math.max(0, value)/100);
  }
  function makeTime(rawLen, basis, productSpecific){
    const paint = productSpecific.paint;
    const mount = productSpecific.mount;
    const time = [
      { label:'Замер', hours:1 },
      { label:'Подготовка / согласование', hours:1.5 },
      { label:'Закупка', hours:1.5 },
      { label:'Резка', hours:Math.max(1.5, rawLen * 0.055) },
      { label:'Сборка', hours:productSpecific.assembly },
      { label:'Сварка', hours:Math.max(2.5, rawLen * 0.085) },
      { label:'Зачистка', hours:Math.max(1.5, rawLen * 0.045) }
    ];
    if(paint) time.push({ label:'Покраска / грунтовка', hours:productSpecific.paintHours });
    if(mount) time.push({ label:'Монтаж', hours:productSpecific.mountHours });
    return time.map(x=>{
      const auto = Number.isFinite(x.hours) ? x.hours : 0;
      const ov = state.timeOverrides[x.label];
      const overridden = ov !== undefined && ov !== null && Number.isFinite(ov);
      return { label:x.label, hours: overridden ? ov : auto, autoHours: auto, overridden };
    });
  }
  function getProductValidationBase(){
    const errors = [], warnings = [];
    const rolesCfg = readRolesConfig();
    const enabledRoles = ROLE_DEFS.filter(d=>rolesCfg[d.key] && rolesCfg[d.key].enabled);
    if(!enabledRoles.length) warnings.push('Ни одна роль не включена — работа не будет учтена в цене.');
    enabledRoles.forEach(def=>{
      const cfg = rolesCfg[def.key];
      if(cfg.paymentType!=='order' && cfg.rate<=0) warnings.push(`Ставка роли «${def.label}» равна 0.`);
      if(cfg.paymentType==='order' && cfg.sum<=0) warnings.push(`Сумма за заказ для роли «${def.label}» равна 0.`);
    });
    PROFILE_CATALOG.forEach(p=>{
      const ps = priceSettings(p.name);
      if(parseNumber(ps.value,0) <= 0) warnings.push(`Цена профиля ${p.name} равна 0.`);
    });
    return {errors,warnings};
  }
  function checkSanity(v, value, max, label, unit){
    if(value <= max) return;
    if(unit === false){
      v.warnings.push(`${label}: ${fmt(value,0)} — необычно большое значение. Проверьте, не ошиблись ли вы в количестве.`);
    } else {
      v.warnings.push(`${label}: ${fmt(value,2)} м — необычно большое значение. Проверьте единицы: возможно, введены сантиметры вместо метров. Например, 700 см = 7 м.`);
    }
  }

  function calculateNaves(){
    const v = getProductValidationBase();
    let width=inputNumber('width',0), depth=inputNumber('depth',0);
    let height=inputNumber('height',0), height2=inputNumber('height2',0);
    let posts=Math.round(inputNumber('posts',4)), crossStep=inputNumber('crossStep',0.7), waste=inputNumber('waste',10);
    if(width<=0) v.errors.push('Ширина навеса должна быть больше 0.');
    if(depth<=0) v.errors.push('Вылет навеса должен быть больше 0.');
    if(height<=0) v.errors.push('Высота у края должна быть больше 0.');
    if(height2<=0){ v.warnings.push('Высота у стены не задана — принята равна высоте у края (плоская кровля).'); height2=height; }
    const wallSide = selectValue('wallSide','none');
    const canopySchemeType = selectValue('canopySchemeType','auto');
    if(height2 < height){
      if(wallSide === 'none'){
        const tmp=height2; height2=height; height=tmp;
        v.warnings.push('Высота у стены была меньше высоты у края — значения поменяны местами.');
      } else {
        v.warnings.push('Высота у стены меньше высоты у края — скат направлен от края к стене (вода стекает к стене). Проверьте, что это так и задумано.');
      }
    }
    if(posts<2){ v.warnings.push('Количество стоек было меньше 2 — для расчёта принято 2.'); posts=2; }
    if(crossStep<0.3){ v.warnings.push('Шаг поперечин был меньше 0.3 м — для расчёта принято 0.3 м.'); crossStep=0.3; }
    if(waste<0){ v.warnings.push('Запас на резку был отрицательный — для расчёта принято 0%.'); waste=0; }
    checkSanity(v, width, 15, 'Ширина навеса');
    checkSanity(v, depth, 8, 'Вылет навеса');
    checkSanity(v, height, 6, 'Высота у края');
    checkSanity(v, height2, 6, 'Высота у стены');
    checkSanity(v, posts, 40, 'Количество стоек', false);
    if(v.errors.length) return { validation:v };

    const area = width*depth;
    // Угол наклона кровли (от горизонтали) — по модулю перепада высот
    const rise = Math.abs(height2 - height);  // перепад высот (всегда ≥ 0)
    const roofAngleDeg = rise > 0 ? Math.atan(rise / depth) * (180/Math.PI) : 0;
    // Длина ската по наклону (конёк)
    const rafterLen = rise > 0 ? Math.sqrt(rise*rise + depth*depth) : depth;

    const coverType = selectValue('coverType','polycarb');
    const coverPrice = Math.max(0,inputNumber('coverPrice',600));
    const paint = selectValue('paint','no') === 'yes';
    const mount = selectValue('mount','yes') === 'yes';
    const postProfile = selectValue('profilePost','60x60x2');
    const beamProfile = selectValue('profileBeam','80x80x3');
    const crossProfile = selectValue('profileCross','60x40x2');
    const trussCalc = calculateTrussGroupsForProduct(width, depth, beamProfile, crossProfile);
    if(trussCalc.warnings && trussCalc.warnings.length) v.warnings.push(...trussCalc.warnings);

    // Стойки: часть у стены (высота2), часть у края (height)
    // При примыкании к стене — стоек у стены меньше или нет (крепятся к стене)
    const crossCount = Math.ceil(depth / crossStep) + 1;
    const hasFrontPosts = wallSide === 'none' || wallSide === 'back';
    const frontPostCount = (canopySchemeType === 'wall_one_post') ? 1 : Math.ceil(posts / 2);
    const backPostCount  = (wallSide === 'none') ? Math.max(2, posts - frontPostCount) : 0;  // у стены — анкеры/пластины, не стойки

    const frontPostLen = frontPostCount * height;   // стойки у края (низкая сторона)
    const backPostLen  = backPostCount  * height2;  // стойки сзади (высокая сторона, только если отдельностоящий)

    // Балки: продольные (по ширине) + поперечные по вылету (скатные балки)
    // При уклоне — скатные балки длиннее чем вылет (rafterLen)
    const beamLenAlong  = width * 2;            // два продольных прогона
    const beamLenRafter = rafterLen * (crossCount); // скатные балки (поперечины по вылету)
    const crossLen = crossCount * width;         // поперечины по ширине

    // Дополнительные балки у стены (если примыкание)
    const wallBeamLen = (wallSide !== 'none') ? width : 0;

    const braceLen = Math.max(posts,2) * 0.7;

    let groups = [
      { label:'Стойки у края', profile:postProfile, length:frontPostLen },
      ...(backPostLen>0 ? [{ label:'Стойки у стены', profile:postProfile, length:backPostLen }] : []),
      { label:'Продольные балки', profile:beamProfile, length:beamLenAlong },
      { label:'Скатные балки', profile:beamProfile, length:beamLenRafter },
      { label:'Поперечины', profile:crossProfile, length:crossLen },
      ...(wallBeamLen>0 ? [{ label:'Пристенный прогон', profile:beamProfile, length:wallBeamLen }] : []),
      { label:'Подкосы', profile:postProfile, length:braceLen }
    ];
    if(trussCalc.enabled && trussCalc.lines.length){
      groups = groups.concat(trussCalc.lines);
    }
    const rawLen = groups.reduce((s,g)=>s+g.length,0);
    if(canopySchemeType === 'wall_one_post'){
      groups.push({
        label:'Одинарная опора: раскосы/усиление стойки',
        profile: profileCross,
        length: Math.max(1.5, height * 1.2 + width * 0.15)
      });
    }

    const purchase = calcPurchase(groups, waste);
    const coverNames = {polycarb:'поликарбонат', prof:'профнастил', metalTile:'металлочерепица'};
    const coverArea = width * rafterLen;  // площадь по скату, не в плане
    const coverCost = coverArea * coverPrice;
    const time = makeTime(rawLen, area, { paint, mount, assembly:Math.max(2.5, area*0.25), paintHours:Math.max(2, area*0.35), mountHours:Math.max(4, area*0.55) });

    const risks = [];
    if(canopySchemeType === 'wall_one_post'){
      risks.push({level:'high', text:'Схема «стена + 1 стойка» требует проверки крепления к стене, узла одинарной стойки, анкеров и консольных ферм. Расчёт в приложении — закупочный и предварительный.'});
    }
    if(trussCalc.enabled){
      if(trussCalc.groups.length){
        risks.push({level:'info', text:`Фермы навеса учтены в расчёте материалов: ${trussCalc.summary}. Расчёт предварительный.`});
        if(trussCalc.hasArched) risks.push({level:'info', text:'Арочные фермы посчитаны ориентировочно для закупки металла и КП. Несущая способность требует инженерной проверки.'});
      } else {
        risks.push({level:'mid', text:'Фермы включены, но группы ферм не заполнены. Проверьте блок «Фермы навеса».'});
      }
    }
    // Уклон кровли
    if(roofAngleDeg < 3 && coverType === 'prof') risks.push({level:'high', text:'Уклон менее 3° — для профнастила минимум 8°, иначе затекает вода. Увеличьте перепад высот.'});
    else if(roofAngleDeg < 8 && coverType === 'prof') risks.push({level:'mid', text:`Уклон ${fmt(roofAngleDeg,1)}° — для профнастила рекомендуется от 8°. Проверьте нахлёст и герметизацию.`});
    if(roofAngleDeg < 5 && coverType === 'metalTile') risks.push({level:'high', text:'Уклон менее 5° — для металлочерепицы минимум 14°. Затечёт вода.'});
    else if(roofAngleDeg < 14 && coverType === 'metalTile') risks.push({level:'mid', text:`Уклон ${fmt(roofAngleDeg,1)}° — для металлочерепицы рекомендуется от 14°.`});
    if(roofAngleDeg === 0) risks.push({level:'mid', text:'Плоская кровля: необходим уклон хотя бы 2–3° для водоотвода. Задайте разные высоты у края и у стены.'});
    if(roofAngleDeg > 30) risks.push({level:'mid', text:`Крутой уклон ${fmt(roofAngleDeg,1)}° — проверьте снеговую нагрузку, ветровую и крепление покрытия.`});
    // Вылет
    if(depth>=4) risks.push({level:'high', text:'Большой вылет: нужны фермы / усиленные балки / дополнительные стойки. Проверить снег и прогиб.'});
    else if(depth>=3) risks.push({level:'mid', text:'Вылет 3 м+: проверить шаг поперечин, профиль балки и крепление.'});
    // Стойки
    if(width>=6 && posts<6) risks.push({level:'high', text:'Мало стоек для ширины 6 м+: рассмотреть 6 стоек или усиленную схему.'});
    else if(width>=4 && posts<4) risks.push({level:'high', text:'Мало стоек: для такой ширины лучше минимум 4 стойки.'});
    if(crossStep>0.8) risks.push({level:'mid', text:'Большой шаг поперечин: лучше 0.6–0.8 м, особенно под снег.'});
    if(profile(beamProfile).rank<5 && (width>=4 || depth>=3)) risks.push({level:'high', text:'Слабый профиль балок для выбранного размера. Рассмотреть усиленный профиль или ферму.'});
    if(area>=18) risks.push({level:'mid', text:'Большая площадь покрытия: учесть парусность, крепёж, уклон, водоотвод и снег.'});
    if(coverType==='metalTile' && depth>=3) risks.push({level:'mid', text:'Тяжёлое покрытие: проверить профиль и шаг поперечин.'});
    if(state.preset==='econom' && (width>=4 || depth>=3)) risks.push({level:'mid', text:'Эконом-вариант для такого размера может быть слабым. Проверьте стандартный или усиленный вариант.'});
    // Примыкание
    if(wallSide !== 'none') risks.push({level:'info', text:`Примыкание к стене (${wallSideLabel(wallSide)}): проверить материал стены, анкеровку пристенного прогона, герметизацию примыкания.`});

    return finalizeResult({ product:'Навес', validation:v,
      params:{ width, depth, height, height2, posts, frontPostCount, backPostCount, crossStep, waste, roofAngleDeg, rafterLen, coverType, coverName:coverNames[coverType], coverArea, coverPrice, paint, mount, wallSide,
      canopySchemeType, trussEnabled:trussCalc.enabled, trussGroups:trussCalc.groups, trussSummary:trussCalc.summary },
      groups, purchase, additionalMaterials:[{label:`Покрытие (${coverNames[coverType]})`, cost:coverCost, qty:`${fmt(coverArea,1)} м² по скату`}],
      time, risks, rawLen, basisValue:area, basisLabel:'м²' });
  }

  function calculatePerila(){
    const v = getProductValidationBase();
    let length=inputNumber('length',0), height=inputNumber('height',0), postStep=inputNumber('postStep',1), waste=inputNumber('waste',8), fillStep=inputNumber('fillStep',0.15), rows=Math.round(inputNumber('horizontalRows',3));
    let railingAngle=inputNumber('railingAngle',0);
    if(length<=0) v.errors.push('Горизонтальная длина перил должна быть больше 0.');
    if(height<=0) v.errors.push('Высота перил должна быть больше 0.');
    if(postStep<0.3){ v.warnings.push('Шаг стоек был меньше 0.3 м — для расчёта принято 0.3 м.'); postStep=0.3; }
    if(fillStep<0.05){ v.warnings.push('Шаг заполнения был меньше 0.05 м — для расчёта принято 0.05 м.'); fillStep=0.05; }
    if(rows<1){ v.warnings.push('Количество горизонтальных рядов было меньше 1 — для расчёта принят 1 ряд.'); rows=1; }
    if(waste<0){ v.warnings.push('Запас на резку был отрицательный — для расчёта принято 0%.'); waste=0; }
    if(railingAngle<0){ v.warnings.push('Угол перил был отрицательным — для расчёта принято 0°.'); railingAngle=0; }
    if(railingAngle>60){ v.warnings.push('Угол перил больше 60° — для расчёта ограничено 60°.'); railingAngle=60; }
    checkSanity(v, length, 50, 'Горизонтальная длина перил');
    checkSanity(v, height, 3, 'Высота перил');
    checkSanity(v, postStep, 5, 'Шаг стоек');
    if(v.errors.length) return { validation:v };
    const railingType=selectValue('railingType','straight'), fillType=selectValue('fillType','vertical'), mountType=selectValue('mountType','top');
    const paint=selectValue('paint','no')==='yes', mount=selectValue('mount','yes')==='yes';
    const postProfile=selectValue('profilePost','40x40x2'), handrailProfile=selectValue('profileHandrail','60x40x2'), fillProfile=selectValue('profileFill','40x20x2');
    // При наклоне поручень и направляющие идут по гипотенузе: длина / cos(угол)
    const angleRad = railingAngle * Math.PI / 180;
    const slopeFactor = railingAngle > 0 ? 1 / Math.cos(angleRad) : 1;
    const runLen = length * slopeFactor;  // наклонная длина пролёта
    const postsCount=Math.ceil(length/postStep)+1;
    const postsLen=postsCount*height;     // стойки всегда вертикальные
    const handrailLen=runLen;             // поручень по наклону
    const bottomLen=fillType==='none' ? 0 : runLen;
    let fillLen=0, fillInfo='без заполнения';
    if(fillType==='vertical') { const count=Math.ceil(length/fillStep); fillLen=count*height; fillInfo=`вертикальное, примерно ${count} элементов`; }
    if(fillType==='horizontal') { fillLen=rows*runLen; fillInfo=`горизонтальное, ${rows} ряд.`; }
    const groups=[
      {label:'Стойки', profile:postProfile, length:postsLen},
      {label:'Поручень', profile:handrailProfile, length:handrailLen}
    ];
    if(bottomLen>0) groups.push({label:'Нижняя направляющая', profile:handrailProfile, length:bottomLen});
    if(fillLen>0) groups.push({label:'Заполнение', profile:fillProfile, length:fillLen});
    const rawLen=groups.reduce((s,g)=>s+g.length,0);
    const purchase=calcPurchase(groups,waste);
    const time=makeTime(rawLen,length,{paint,mount,assembly:Math.max(2,length*0.45),paintHours:Math.max(1.5,length*0.25),mountHours:Math.max(2,length*0.35)});
    const risks=[];
    if(postStep>1.2) risks.push({level:'mid',text:'Слишком большой шаг стоек (>1.2 м). Рекомендация: уменьшить шаг.'});
    if(height>=1 && profile(postProfile).rank<3) risks.push({level:'mid',text:'Слабый профиль стоек при высоте 1 м+. Рекомендация: усилить стойки.'});
    if(mountType==='wood') risks.push({level:'mid',text:'Крепление к дереву — слабое основание. Проверить основание и крепёж.'});
    if(railingType==='outdoor') risks.push({level:'mid',text:'Уличные перила: учесть коррозию, грунт, покраску и крепления.'});
    if(railingType==='stair') risks.push({level:'mid',text:'Лестничные перила: проверить угол, крепления и высоту поручня.'});
    if(railingAngle>45) risks.push({level:'high',text:`Большой угол перил (${fmt(railingAngle,0)}°). Очень крутой марш — проверьте удобство, высоту поручня по нормали и крепления.`});
    else if(railingAngle>0 && railingAngle<20) risks.push({level:'info',text:`Небольшой угол перил (${fmt(railingAngle,0)}°). Проверьте, действительно ли перила наклонные — для прямых угол должен быть 0°.`});
    return finalizeResult({ product:'Перила', validation:v, params:{ length,height,postStep,waste,railingAngle,railingType:labelMap(railingType),fillInfo,mountType:labelMap(mountType),paint,mount }, groups, purchase, additionalMaterials:[], time, risks, rawLen, basisValue:length, basisLabel:'пог. м' });
  }

  function calculateLestnica(){
    const v = getProductValidationBase();
    let totalHeight=inputNumber('totalHeight',0), projection=inputNumber('projectionLength',0), stairWidth=inputNumber('stairWidth',1), steps=Math.round(inputNumber('stepsCount',0)), waste=inputNumber('waste',8);
    if(totalHeight<=0) v.errors.push('Высота подъёма должна быть больше 0.');
    if(projection<=0) v.errors.push('Длина проекции должна быть больше 0.');
    if(stairWidth<=0) v.errors.push('Ширина лестницы должна быть больше 0.');
    if(waste<0){ v.warnings.push('Запас на резку был отрицательный — для расчёта принято 0%.'); waste=0; }
    checkSanity(v, totalHeight, 10, 'Высота подъёма');
    checkSanity(v, projection, 30, 'Длина проекции');
    checkSanity(v, stairWidth, 5, 'Ширина лестницы');
    if(v.errors.length) return { validation:v };
    if(steps<=0) steps=Math.round(totalHeight/0.17);
    if(steps<2){ v.warnings.push('Количество ступеней было меньше 2 — для расчёта принято 2.'); steps=2; }
    checkSanity(v, steps, 150, 'Количество ступеней', false);
    const rise=totalHeight/steps, run=projection/steps, angle=Math.atan(totalHeight/projection)*(180/Math.PI);
    const stringerLen=Math.sqrt(totalHeight*totalHeight + projection*projection);
    const stringerProfile=selectValue('profileStringer','80x80x3'), stepFrameProfile=selectValue('profileStepFrame','60x40x2'), railingProfile=selectValue('profileRailing','40x40x2');
    const hasRailing=selectValue('hasRailing','yes')==='yes', paint=selectValue('paint','no')==='yes', mount=selectValue('mount','yes')==='yes';
    const stairType=selectValue('stairType','straight'), stepMaterial=selectValue('stepMaterial','metal'), stepMaterialPrice=Math.max(0,inputNumber('stepMaterialPrice',2500));
    const stringerTotal=stringerLen*2;
    const stepFrameLen=steps*(stairWidth*2 + run*2);
    const railingLen=hasRailing ? stringerLen*2 : 0;
    const groups=[{label:'Косоуры',profile:stringerProfile,length:stringerTotal},{label:'Каркас ступеней',profile:stepFrameProfile,length:stepFrameLen}];
    if(hasRailing) groups.push({label:'Перила лестницы',profile:railingProfile,length:railingLen});
    const rawLen=groups.reduce((s,g)=>s+g.length,0);
    const purchase=calcPurchase(groups,waste);
    const stepsArea=stairWidth*run*steps;
    const stepMaterialCost= stepMaterial==='concrete' ? 0 : stepsArea*stepMaterialPrice;
    const additionalMaterials=[];
    if(stepMaterialCost>0) additionalMaterials.push({label:`Материал ступеней (${labelMap(stepMaterial)})`, cost:stepMaterialCost, qty:`${fmt(stepsArea,1)} м²`});
    else additionalMaterials.push({label:`Материал ступеней (${labelMap(stepMaterial)})`, cost:0, qty:'уточнить отдельно'});
    const time=makeTime(rawLen,steps,{paint,mount,assembly:Math.max(4,steps*0.45),paintHours:Math.max(2,rawLen*0.05),mountHours:Math.max(4,steps*0.35)});
    const risks=[];
    if(angle>45) risks.push({level:'high',text:'Слишком крутая лестница (>45°). Увеличить длину проекции, добавить площадку или изменить конструкцию.'});
    if(rise>0.20) risks.push({level:'mid',text:'Высота ступени больше 20 см. Рекомендация: увеличить количество ступеней.'});
    if(run<0.23) risks.push({level:'mid',text:'Глубина ступени меньше 23 см. Рекомендация: увеличить проступь.'});
    if(stairWidth>1.2 && profile(stringerProfile).rank<5) risks.push({level:'mid',text:'Слабый косоур при большой ширине. Усилить косоур или добавить опору.'});
    if(stairType==='outdoor') risks.push({level:'mid',text:'Уличная лестница: учесть противоскольжение, коррозию, уклон, воду и покрытие.'});
    return finalizeResult({ product:'Лестница', validation:v, params:{ totalHeight, projection, stairWidth, steps, rise, run, angle, waste, stairType:labelMap(stairType), stepMaterialRaw:stepMaterial, stepMaterial:labelMap(stepMaterial), hasRailing, paint, mount }, groups, purchase, additionalMaterials, time, risks, rawLen, basisValue:steps, basisLabel:'ступ.' });
  }

  function labelMap(value){
    const map = { yes:'Да', no:'Нет', straight:'прямые', stair:'лестничные', outdoor:'уличные', balcony:'балконные', top:'сверху', side:'сбоку', concrete:'бетон', metal:'металл', wood:'дерево', vertical:'вертикальное', horizontal:'горизонтальное', none:'без заполнения', withPlatform:'с площадкой', indoor:'внутренняя', polycarb:'поликарбонат', prof:'профнастил', metalTile:'металлочерепица' };
    return map[value] || value;
  }
  function wallSideLabel(value){
    const map = { none:'отдельностоящий', back:'одна стена (сзади)', back_left:'две стены (угол)', three:'три стены (П-образный)' };
    return map[value] || value;
  }
  function roleDaysFor(row){
    if(!row || !row.enabled) return 0;
    if(row.paymentType === 'day') return Math.max(0, row.days);
    if(row.hours > 0) return Math.ceil(row.hours / 7);
    return 0;
  }
  function finalizeResult(input){
    const ws = workSettings();
    const totalHours = input.time.reduce((s,t)=>s+t.hours,0);
    const rolesCfg = readRolesConfig();
    const autoHours = computeRoleAutoHours(input.time, rolesCfg);
    const roleRows = ROLE_DEFS.map(def=>{
      const cfg = rolesCfg[def.key];
      let hours = 0, cost = 0;
      if(cfg.enabled){
        hours = roleEffectiveHours(def.key, autoHours);
        if(cfg.paymentType === 'hour'){
          cost = cfg.people * cfg.rate * hours;
        } else if(cfg.paymentType === 'day'){
          cost = cfg.people * cfg.rate * cfg.days;
        } else {
          cost = cfg.sum;
        }
      }
      return Object.assign({}, cfg, { hours, cost });
    });
    const enabledRoleRows = roleRows.filter(r=>r.enabled);
    const laborCost = enabledRoleRows.reduce((s,r)=>s+r.cost,0);
    const totalPeople = Math.max(1, enabledRoleRows.reduce((s,r)=>s+r.people,0));
    // Срок: сварщик, маляр и монтажник идут последовательно (нельзя красить невыполненную сварку,
    // нельзя монтировать непросохшую краску). Разнорабочий работает параллельно с остальными —
    // не продлевает и не сокращает срок сам по себе. Роль без часов (не участвует в операциях
    // этого изделия) добавляет 0 дней, а не «лишнего человека» в общий знаменатель.
    const sequentialKeys = ['welder','painter','mounter'];
    const days = Math.max(1, sequentialKeys.reduce((sum,key)=>sum + roleDaysFor(roleRows.find(r=>r.key===key)), 0));
    const additionalCost = input.additionalMaterials.reduce((s,a)=>s+a.cost,0);
    const consumablesCost = ws.consumablesFixed + input.basisValue * ws.consumablesRate;
    const materialsCost = input.purchase.metalCost + additionalCost;
    const materialsClientCost = applyMarkup(materialsCost, ws.materialMarkupType, ws.materialMarkupValue);
    const laborClientCost = applyMarkup(laborCost, ws.laborMarkupType, ws.laborMarkupValue);
    const clientPrice = materialsClientCost + laborClientCost + consumablesCost;
    const costPrice = materialsCost + laborCost + consumablesCost;
    const margin = clientPrice - costPrice;
    const riskLevel = input.risks.some(r=>r.level==='high') ? 'Высокий' : input.risks.some(r=>r.level==='mid') ? 'Средний' : 'Низкий';
    return Object.assign(input, { settings:ws, totalHours, days, totalPeople, roleRows, additionalCost, consumablesCost, materialsCost, materialsClientCost, laborCost, laborClientCost, costPrice, margin, clientPrice, riskLevel, buildDate:BUILD_DATE });
  }

  function calculate(){
    readPriceCards();
    let result;
    if(state.product==='naves') result = calculateNaves();
    else if(state.product==='perila') result = calculatePerila();
    else result = calculateLestnica();
    if(result.validation){ renderValidation(result.validation); }
    if(result.validation && result.validation.errors.length){ state.lastResult=null; clearResults(); return null; }
    state.lastResult=result;
    renderValidation(result.validation || {errors:[],warnings:[]});
    renderResult(result);
    return result;
  }
  function renderValidation(validation){
    const box=$('validationBox'), list=$('validationList');
    const items = [...(validation.errors||[]), ...(validation.warnings||[])];
    if(!items.length){ box.style.display='none'; list.innerHTML=''; return; }
    list.innerHTML = items.map(x=>`<li>${escapeHtml(x)}</li>`).join('');
    box.style.display='block';
  }
  function clearValidation(){ renderValidation({errors:[],warnings:[]}); }
  function clearResults(){
    $('clientPrice').textContent='—'; $('totalNeeded').textContent='—'; $('totalSticks').textContent='—'; $('totalLeftover').textContent='—'; $('totalWeight').textContent='—'; $('totalHours').textContent='—'; $('totalDays').textContent='—';
    $('schemeContainer').innerHTML='<p class="mini">Исправьте данные и нажмите «Рассчитать».</p>'; $('purchaseList').innerHTML='<p class="mini">Исправьте данные и нажмите «Рассчитать».</p>'; $('timeList').innerHTML='<p class="mini">Исправьте данные и нажмите «Рассчитать».</p>'; $('riskList').innerHTML='<p class="mini">Исправьте данные и нажмите «Рассчитать».</p>'; $('quoteText').textContent='Исправьте данные и повторите расчёт.';
  }
  function renderResult(r){
    refreshRoleAutoHours(r);
    $('clientPrice').textContent = money(r.clientPrice);
    $('totalNeeded').textContent = m(r.purchase.totalNeeded);
    $('totalSticks').textContent = r.purchase.totalSticks + ' шт.';
    $('totalLeftover').textContent = m(r.purchase.totalLeftover);
    $('totalWeight').textContent = kg(r.purchase.totalWeight);
    $('totalHours').textContent = fmt(r.totalHours,1) + ' ч';
    $('totalDays').textContent = r.days + ' ' + pluralDays(r.days);
    $('costBreakdown').innerHTML = costBreakdownHtml(r);
    $('purchaseList').innerHTML = r.purchase.lines.map(line=>`<div class="line-card"><h4>${escapeHtml(line.profile)}</h4><p class="mini">Входит: ${line.labels.map(escapeHtml).join(', ')}</p><div class="line-grid"><div><b>Нужно</b>${m(line.lengthWithWaste)}</div><div><b>Хлыстов</b>${line.sticks} шт.</div><div><b>Куплено</b>${m(line.purchasedMeters)}</div><div><b>Остаток</b>${m(line.leftoverMeters)}</div><div><b>Вес</b>${kg(line.weight)}</div><div><b>Закупка</b>${money(line.purchaseCost)}</div></div></div>`).join('') + additionalMaterialsHtml(r);
    $('timeList').innerHTML = `<table class="time-table">${r.time.map((t,i)=>`<tr><td>${escapeHtml(t.label)}${t.overridden?' <span class="time-manual">вручную</span>':''}</td><td class="time-input-cell"><input type="text" inputmode="decimal" class="time-input" data-time-label="${escapeAttr(t.label)}" value="${fmt(t.hours,1)}"><span class="time-unit">ч</span></td></tr>`).join('')}</table>`
      + `<div class="time-foot"><span class="note-inline">Итого: <strong>${fmt(r.totalHours,1)} чел-часов</strong> · срок: ${r.days} ${pluralDays(r.days)} по ролям</span>${hasTimeOverrides()?'<button type="button" class="btn secondary time-reset-btn" id="resetTimeBtn">Сбросить к авто</button>':''}</div>`
      + `<p class="mini" style="margin-top:6px">Срок считается по ролям: сварка, покраска и монтаж идут последовательно. Помощник не сокращает срок автоматически.</p>`
      + `<p class="mini" style="margin-top:6px">Часы можно поправить вручную — изменённое значение используется в расчёте цены и срока.</p>`;
    attachTimeInputs();
    if(r.risks.length){
      $('riskList').innerHTML = r.risks.map(x=>{
        const cls = x.level==='high'?'high':x.level==='info'?'info':'mid';
        const label = x.level==='high'?'Высокий риск':x.level==='info'?'Информация':'Средний риск';
        return `<div class="risk ${cls}"><strong>${label}:</strong> ${escapeHtml(x.text)}</div>`;
      }).join('') + `<div class="note">Уровень риска: ${escapeHtml(r.riskLevel)}</div>`;
    } else {
      $('riskList').innerHTML = `<div class="risk low"><strong>Низкий риск:</strong> критичных предупреждений не выявлено по предварительной проверке.</div>`;
    }
    renderScheme(r);
    $('quoteText').textContent = generateQuote(r);
  }
  function additionalMaterialsHtml(r){
    let html='';
    r.additionalMaterials.forEach(a=>{ html += `<div class="line-card"><h4>${escapeHtml(a.label)}</h4><div class="line-grid"><div><b>Объём</b>${escapeHtml(a.qty)}</div><div><b>Стоимость</b>${money(a.cost)}</div></div></div>`; });
    if(r.product === 'Навес' && r.params.trussEnabled) html += trussGroupsHtml(r.params.trussGroups);
    html += `<div class="note">Расчётный вес металла (с запасом): ${kg(r.purchase.totalWeight)} · Ориентировочный вес закупки: ${kg(r.purchase.totalPurchaseWeight)}</div>`;
    html += `<div class="note">Металл: ${money(r.purchase.metalCost)} · Доп. материалы: ${money(r.additionalCost)} · Расходники: ${money(r.consumablesCost)}</div>`;
    return html;
  }
  function roleResultLabel(key){
    const map = { welder:'Работа сварщика', painter:'Покраска / маляр', mounter:'Монтаж / установщик', helper:'Разнорабочий / помощник' };
    return map[key] || key;
  }
  function roleQuoteLabel(key){
    const map = { welder:'Сварщик', painter:'Маляр', mounter:'Установщик / монтажник', helper:'Разнорабочий / помощник' };
    return map[key] || key;
  }
  function pluralPeople(n){
    const x = Math.abs(Math.round(n));
    const mod10 = x % 10, mod100 = x % 100;
    if(mod100 >= 11 && mod100 <= 14) return 'человек';
    if(mod10 === 1) return 'человек';
    if(mod10 >= 2 && mod10 <= 4) return 'человека';
    return 'человек';
  }
  function roleFormatLine(x){
    if(x.paymentType === 'hour') return `${x.people} ${pluralPeople(x.people)} × ${money(x.rate)}/час × ${fmt(x.hours,1)} ч = ${money(x.cost)}`;
    if(x.paymentType === 'day') return `${x.people} ${pluralPeople(x.people)} × ${money(x.rate)}/день × ${x.days} ${pluralDays(x.days)} = ${money(x.cost)}`;
    return `${money(x.cost)} за заказ`;
  }
  function costBreakdownHtml(r){
    const rows = [{ label:'Материалы', value:r.materialsClientCost }];
    r.roleRows.filter(x=>x.enabled && x.cost>0).forEach(x=>{
      const share = r.laborCost>0 ? (x.cost / r.laborCost) * r.laborClientCost : 0;
      rows.push({ label:roleResultLabel(x.key), value:share });
    });
    rows.push({ label:'Расходники', value:r.consumablesCost });
    let html = rows.map(x=>`<div class="cost-row"><span>${escapeHtml(x.label)}</span><b>${money(x.value)}</b></div>`).join('');
    html += `<div class="cost-row"><span>Себестоимость</span><b>${money(r.costPrice)}</b></div>`;
    html += `<div class="cost-row"><span>Маржа</span><b>${money(r.margin)}</b></div>`;
    html += `<div class="cost-row total"><span>Цена клиенту</span><b>${money(r.clientPrice)}</b></div>`;
    return html;
  }
  function paramsRu(r){
    const p=r.params;
    if(r.product==='Навес') return [
      `Ширина: ${fmt(p.width,2)} м`,
      `Вылет: ${fmt(p.depth,2)} м`,
      `Высота у края: ${fmt(p.height,2)} м`,
      `Высота у стены: ${fmt(p.height2,2)} м`,
      `Уклон кровли: ${fmt(p.roofAngleDeg,1)}°`,
      `Площадь по скату: ${fmt(p.coverArea,1)} м²`,
      p.wallSide === 'none'
        ? `Стойки: ${p.frontPostCount + p.backPostCount} (${p.frontPostCount} у края + ${p.backPostCount} у стены)`
        : `Стойки: ${p.frontPostCount} у края + пристенный прогон`,
      `Шаг поперечин: ${fmt(p.crossStep,2)} м`,
      `Примыкание: ${wallSideLabel(p.wallSide)}`,
      `Покрытие: ${p.coverName}`,
      p.trussEnabled ? `Фермы: ${p.trussGroups && p.trussGroups.length ? p.trussGroups.map(g=>`G${g.number} ${g.typeLabel} × ${g.count} шт`).join('; ') : 'включены, но не заполнены'}` : 'Фермы: не учитываются',
      `Запас на резку: ${fmt(p.waste,0)}%`,
      `Покраска: ${p.paint?'да':'нет'}`,
      `Монтаж: ${p.mount?'да':'нет'}`
    ];
    if(r.product==='Перила') return [`Горизонтальная длина (проекция): ${fmt(p.length,2)} м`,`Высота: ${fmt(p.height,2)} м`,`Шаг стоек: ${fmt(p.postStep,2)} м`,`Угол перил: ${p.railingAngle>0?fmt(p.railingAngle,0)+'°':'0° / прямые'}`,`Тип: ${p.railingType}`,`Заполнение: ${p.fillInfo}`,`Крепление: ${p.mountType}`,`Запас на резку: ${fmt(p.waste,0)}%`,`Покраска: ${p.paint?'да':'нет'}`,`Монтаж: ${p.mount?'да':'нет'}`];
    return [`Высота подъёма: ${fmt(p.totalHeight,2)} м`,`Длина проекции: ${fmt(p.projection,2)} м`,`Ширина: ${fmt(p.stairWidth,2)} м`,`Ступеней: ${p.steps}`,`Высота ступени: ${fmt(p.rise,2)} м`,`Глубина ступени: ${fmt(p.run,2)} м`,`Угол: ${fmt(p.angle,1)}°`,`Тип: ${p.stairType}`,`Материал ступеней: ${p.stepMaterial}`,`Перила: ${p.hasRailing?'да':'нет'}`,`Запас на резку: ${fmt(p.waste,0)}%`,`Покраска: ${p.paint?'да':'нет'}`,`Монтаж: ${p.mount?'да':'нет'}`];
  }

  function escSvg(value){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function svgText(x,y,text,cls='scheme-label',anchor='middle',rotate){
    const t = rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : '';
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}"${t}>${escSvg(text)}</text>`;
  }
  function svgLine(x1,y1,x2,y2,cls='scheme-element'){
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
  }
  function svgRect(x,y,w,h,cls='scheme-thin'){
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" class="${cls}"/>`;
  }
  function svgCircle(x,y,r,cls='scheme-post'){
    return `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>`;
  }
  function svgPolyline(points,cls='scheme-element'){
    return `<polyline points="${points.map(p=>p.join(',')).join(' ')}" class="${cls}"/>`;
  }
  function svgDimLine(x1,y1,x2,y2,label){
    const midX=(x1+x2)/2, midY=(y1+y2)/2;
    const isVertical = Math.abs(x1-x2) < 1;
    const line = svgLine(x1,y1,x2,y2,'scheme-dim');
    if(isVertical){
      // Текст идёт вдоль линии (повёрнут на -90°), сбоку от неё — не пересекает конструкцию
      return line + svgText(midX-7, midY, label, 'scheme-dimtext', 'middle', -90);
    }
    return line + svgText(midX, midY-9, label, 'scheme-dimtext', 'middle');
  }
  function schemeBox(title, subtitle, svg){
    return `<div class="scheme-box"><div class="scheme-title"><strong>${escSvg(title)}</strong><span>${escSvg(subtitle)}</span></div>${svg}</div>`;
  }
  function wrapSvg(viewBox, inner){
    return `<svg class="scheme-svg" viewBox="${viewBox}" role="img" aria-label="Схема по размерам" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
  }
  function renderScheme(r){
    const el = $('schemeContainer');
    if(!el || !r){ return; }
    let html = '';
    if(r.product === 'Навес') html = renderNavesScheme(r);
    else if(r.product === 'Перила') html = renderPerilaScheme(r);
    else if(r.product === 'Лестница') html = renderLestnicaScheme(r);
    else html = '<p class="mini">Схема для этого изделия пока не поддерживается.</p>';
    el.innerHTML = html + '<div class="note">Схема предварительная. Не является чертежом КМ/КМД и не заменяет инженерный расчёт.</div>';
  }

  function trussPathPoints(g, x0, yBase, w, h){
    const type = g.type;
    if(type === 'arched') return {
      top:`M ${x0} ${yBase} Q ${x0+w/2} ${yBase-h*1.25} ${x0+w} ${yBase}`,
      bottom:[[x0,yBase+26],[x0+w,yBase+26]]
    };
    if(type === 'gable') return {
      top:[[x0,yBase],[x0+w/2,yBase-h],[x0+w,yBase]],
      bottom:[[x0,yBase+26],[x0+w,yBase+26]]
    };
    if(type === 'mono_slope') return {
      top:[[x0,yBase+6],[x0+w,yBase-h]],
      bottom:[[x0,yBase+26],[x0+w,yBase+26]]
    };
    if(type === 'cantilever') return {
      top:[[x0,yBase+2],[x0+w,yBase-h*0.25]],
      bottom:[[x0,yBase+26],[x0+w*0.65,yBase+26]]
    };
    if(type === 'combined') return {
      top:[[x0,yBase+4],[x0+w*0.35,yBase-h*0.35],[x0+w*0.7,yBase-h*0.15],[x0+w,yBase-4]],
      bottom:[[x0,yBase+26],[x0+w,yBase+26]]
    };
    return {
      top:[[x0,yBase],[x0+w,yBase]],
      bottom:[[x0,yBase+26],[x0+w,yBase+26]]
    };
  }
  function renderTrussMini(g, index){
    const x0=48, y=92, w=230, h=48;
    let svg='';
    const p = trussPathPoints(g, x0, y, w, h);
    if(Array.isArray(p.top)) svg += svgPolyline(p.top,'scheme-truss'); else svg += `<path d="${p.top}" class="scheme-truss"/>`;
    svg += svgPolyline(p.bottom,'scheme-truss');
    const seg = Math.max(2, Math.min(10, Math.round(g.segments || 6)));
    for(let i=0;i<=seg;i++){
      const x = x0 + w*i/seg;
      const bottomY = y+26;
      let topY = y;
      if(g.type==='gable') topY = i<=seg/2 ? y - h*(i/(seg/2)) : y - h*((seg-i)/(seg/2));
      if(g.type==='arched') topY = y - Math.sin(Math.PI*i/seg)*h*0.95;
      if(g.type==='mono_slope') topY = y+6 - (h+6)*i/seg;
      if(g.type==='cantilever') topY = y+2 - h*0.25*i/seg;
      if(g.webPattern==='vertical' || g.webPattern==='pratt' || i===0 || i===seg) svg += svgLine(x, topY, x, bottomY, 'scheme-web');
      if(i<seg && g.webPattern!=='vertical'){
        const x2 = x0 + w*(i+1)/seg;
        let topY2 = y;
        if(g.type==='gable') topY2 = (i+1)<=seg/2 ? y - h*((i+1)/(seg/2)) : y - h*((seg-i-1)/(seg/2));
        if(g.type==='arched') topY2 = y - Math.sin(Math.PI*(i+1)/seg)*h*0.95;
        if(g.type==='mono_slope') topY2 = y+6 - (h+6)*(i+1)/seg;
        if(g.type==='cantilever') topY2 = y+2 - h*0.25*(i+1)/seg;
        if(g.webPattern==='fan') svg += svgLine(x0+w/2, bottomY, x2, topY2, 'scheme-web');
        else svg += svgLine(x, bottomY, x2, topY2, 'scheme-web');
      }
    }
    svg += svgCircle(24,24,12,'scheme-group-mark');
    svg += svgText(24,28,`G${index+1}`,'scheme-dimtext');
    svg += svgText(165,24,`${g.typeLabel} · ${g.count} шт · ${g.patternLabel}`,'scheme-label');
    svg += svgText(165,142,`пролёт ${fmt(g.span,2)} м · ${g.type==='arched'?'подъём '+fmt(g.rise,2)+' м':'высота '+fmt(g.height,2)+' м'} · ${g.loadNote || 'зона нагрузки не указана'}`,'scheme-small');
    return schemeBox(`Ферма G${index+1}: ${g.name}`, `${g.profileTop} / ${g.profileBottom} / ${g.profileWeb}`, wrapSvg('0 0 330 160', svg));
  }
  function renderTrussGroupsScheme(r){
    const groups = r.params && r.params.trussGroups ? r.params.trussGroups : [];
    if(!r.params.trussEnabled || !groups.length) return '';
    let out = schemeBox('Фермы навеса — состав групп', groups.map(g=>`G${g.number}: ${g.typeLabel} × ${g.count}`).join(' · '),
      wrapSvg('0 0 330 115',
        groups.slice(0,6).map((g,i)=>{
          const x = 36 + i*48;
          return svgCircle(x,46,12,'scheme-group-mark') + svgText(x,50,`G${g.number}`,'scheme-dimtext') + svgText(x,78,`${g.count} шт`,'scheme-small');
        }).join('') + svgText(165,22,'Группы ферм, учтённые в расчёте','scheme-label') + svgText(165,104,'Мини-схемы ниже показывают форму и решётку каждой группы','scheme-small')
      )
    );
    groups.slice(0,8).forEach((g,i)=>{ out += renderTrussMini(g,i); });
    return out;
  }

  function renderNavesScheme(r){
    const p = r.params;
    const W = Math.max(0.1, p.width), D = Math.max(0.1, p.depth);
    const Hedge = Math.max(0.1, p.height), Hwall = Math.max(0.1, p.height2 || p.height);
    const Hmax = Math.max(Hedge, Hwall);
    const wallSide = p.wallSide || 'none';
    const postCount = Math.max(2, Math.round(p.posts || 4));
    const crossCount = Math.max(2, Math.ceil(D / Math.max(0.3, p.crossStep)) + 1);
    const actualPostCount = Math.max(2, (p.frontPostCount || 0) + (p.backPostCount || 0));
    const postSchemeLabel = (p.canopySchemeType === 'wall_one_post') ? '1 передняя стойка + пристенное крепление' : wallSide === 'none'
      ? `стойки: ${actualPostCount}`
      : `стойки у края: ${p.frontPostCount || actualPostCount} + пристенный прогон`;

    // ── ВИД СВЕРХУ ─────────────────────────────────────────────────────
    const tW=240, tH=130, tx0=48, ty0=40;
    let top='';
    // Основной прямоугольник навеса
    top += svgRect(tx0,ty0,tW,tH,'scheme-element');
    // Поперечины (по ширине)
    for(let i=1;i<crossCount-1;i++){
      const x = tx0 + tW*i/(crossCount-1);
      top += svgLine(x,ty0,x,ty0+tH,'scheme-thin');
    }
    // Стойки
    const ptsFront=[], ptsBack=[];
    if(postCount<=2){ ptsFront.push([tx0,ty0+tH],[tx0+tW,ty0+tH]); }
    else if(postCount===4){ ptsFront.push([tx0,ty0+tH],[tx0+tW,ty0+tH]); ptsBack.push([tx0,ty0],[tx0+tW,ty0]); }
    else {
      const nf=Math.ceil(postCount/2), nb=Math.floor(postCount/2);
      for(let i=0;i<nf;i++) ptsFront.push([tx0+tW*i/Math.max(1,nf-1),ty0+tH]);
      for(let i=0;i<nb;i++) ptsBack.push([tx0+tW*i/Math.max(1,nb-1),ty0]);
    }
    // У стены — анкеры (крестики), у края — полные стойки (круги)
    ptsFront.forEach(pt=>top += svgCircle(pt[0],pt[1],4,'scheme-post'));
    if(wallSide==='none'){
      ptsBack.forEach(pt=>top += svgCircle(pt[0],pt[1],4,'scheme-post'));
    } else {
      // пристенный прогон — жирная линия по задней стороне
      top += svgLine(tx0,ty0,tx0+tW,ty0,'scheme-element');
      // засечки анкеров
      ptsBack.forEach(pt=>{ top += svgLine(pt[0]-5,pt[1]-5,pt[0]+5,pt[1]+5,'scheme-wall'); top += svgLine(pt[0]+5,pt[1]-5,pt[0]-5,pt[1]+5,'scheme-wall'); });
      // боковые стены если угол или П-образный
      if(wallSide==='back_left' || wallSide==='three'){
        top += svgLine(tx0,ty0,tx0,ty0+tH,'scheme-element');
      }
      if(wallSide==='three'){
        top += svgLine(tx0+tW,ty0,tx0+tW,ty0+tH,'scheme-element');
      }
      // Обозначение стены: штриховка
      const hatchY = ty0-8;
      for(let x=tx0;x<=tx0+tW;x+=12) top += svgLine(x,hatchY,x+6,hatchY+6,'scheme-wall');
      top += svgLine(tx0,hatchY,tx0+tW,hatchY,'scheme-wall');
      if(wallSide==='back_left'||wallSide==='three'){
        for(let y=ty0;y<=ty0+tH;y+=12) top += svgLine(tx0-8,y,tx0-2,y+6,'scheme-wall');
        top += svgLine(tx0-8,ty0,tx0-8,ty0+tH,'scheme-wall');
      }
      if(wallSide==='three'){
        for(let y=ty0;y<=ty0+tH;y+=12) top += svgLine(tx0+tW+8,y,tx0+tW+2,y+6,'scheme-wall');
        top += svgLine(tx0+tW+8,ty0,tx0+tW+8,ty0+tH,'scheme-wall');
      }
    }
    if(p.trussEnabled && p.trussGroups && p.trussGroups.length){
      p.trussGroups.slice(0,6).forEach((g,i)=>{
        const x = tx0 + tW*(i+1)/(Math.min(6,p.trussGroups.length)+1);
        top += svgLine(x,ty0,x,ty0+tH,'scheme-truss');
        top += svgCircle(x,ty0+18,10,'scheme-group-mark');
        top += svgText(x,ty0+22,`G${g.number}`,'scheme-dimtext');
      });
      top += svgText(tx0+tW/2,ty0+tH+42,'G1/G2 — группы ферм в расчёте','scheme-small');
    }
    top += svgDimLine(tx0,ty0+tH+22,tx0+tW,ty0+tH+22,`ширина ${fmt(W,2)} м`);
    top += svgDimLine(tx0-20,ty0,tx0-20,ty0+tH,`вылет ${fmt(D,2)} м`);
    const wallLabel = {none:'отдельностоящий',back:'примыкание: 1 стена',back_left:'примыкание: 2 стены (угол)',three:'П-образный (3 стены)'}[wallSide]||'';
    top += svgText(tx0+tW/2,26,`Вид сверху · ${postSchemeLabel} · поперечины: ${crossCount}`,'scheme-label');
    top += svgText(tx0+tW/2,210,wallLabel,'scheme-small');
    const topSvg = wrapSvg('0 0 330 225', top);

    // ── ВИД СБОКУ ──────────────────────────────────────────────────────
    // Левая сторона = край, правая = стена/дальняя стойка. Масштаб по Hmax.
    const sW=195, sMaxH=110;
    const sx0=80, sy0=178;
    const scaleH = sMaxH / Math.max(Hmax, 0.1);
    const shEdge = Math.round(Hedge * scaleH);   // высота у края (слева)
    const shWall = Math.round(Hwall * scaleH);   // высота у стены (справа)
    const sx1 = sx0 + sW;

    const py_edge = sy0 - shEdge;   // верх у края
    const py_wall = sy0 - shWall;   // верх у стены
    const diff = Math.abs(Hwall - Hedge);

    let side='';
    side += svgLine(sx0-10, sy0, sx1+10, sy0, 'scheme-thin');   // земля

    // Левая стойка (край)
    side += svgLine(sx0, sy0, sx0, py_edge, 'scheme-element');
    // Правая сторона: стена (примыкание) или стойка (отдельностоящий)
    if(wallSide==='none'){
      side += svgLine(sx1, sy0, sx1, py_wall, 'scheme-element');
    } else {
      const wallTop = Math.min(py_wall, py_edge) - 14;
      side += svgLine(sx1, sy0-10, sx1, wallTop, 'scheme-element');
      for(let y=sy0-10; y>wallTop; y-=10){ side += svgLine(sx1, y, sx1+8, y, 'scheme-thin'); }
      side += svgLine(sx1, wallTop, sx1+10, wallTop, 'scheme-thin');
      side += svgLine(sx1, py_wall, sx1+10, py_wall, 'scheme-element');  // анкер
      side += svgCircle(sx1+10, py_wall, 3, 'scheme-post');
    }

    // Скатная кровля + заливка (цвет зависит от материала покрытия)
    side += svgLine(sx0, py_edge, sx1, py_wall, 'scheme-element');
    const coverFillCls = p.coverType==='prof' ? 'scheme-fill-prof' : p.coverType==='metalTile' ? 'scheme-fill-tile' : 'scheme-fill';
    side += `<polygon points="${sx0},${py_edge} ${sx1},${py_wall} ${sx1},${py_wall+10} ${sx0},${py_edge+10}" class="${coverFillCls}" opacity="0.55"/>`;

    // Размерные линии высот (всегда обе оси, слева)
    side += svgDimLine(sx0-18, sy0, sx0-18, py_edge, `${fmt(Hedge,2)} м`);
    if(diff > 0.02){
      side += svgLine(sx0-34, py_wall, sx0-34, sy0, 'scheme-dim');
      side += svgLine(sx0-38, sy0, sx0-30, sy0, 'scheme-thin');
      side += svgLine(sx0-38, py_wall, sx0-30, py_wall, 'scheme-thin');
      side += svgText(sx0-34, (sy0+py_wall)/2, `${fmt(Hwall,2)} м`, 'scheme-dimtext', 'middle', -90);
    }
    side += svgDimLine(sx0, sy0+22, sx1, sy0+22, `вылет ${fmt(D,2)} м`);

    // Угол уклона / плоская — подпись строго рядом с линией ската, не пересекая её
    if(p.roofAngleDeg > 0.5){
      const at = 0.20;
      const lineYAt = py_edge + (py_wall - py_edge) * at;
      const angleX = sx0 + sW * at;
      const angleY = lineYAt - 13;
      side += svgText(angleX, angleY, `${fmt(p.roofAngleDeg,1)}°`, 'scheme-warn');
    } else {
      side += svgText(sx0+sW/2, py_edge-12, 'плоская кровля', 'scheme-warn');
    }

    // Подписи
    side += svgText((sx0+sx1)/2, (py_edge+py_wall)/2 - 8, p.coverName || 'покрытие', 'scheme-small');
    side += svgText(165, 24, 'Вид сбоку · слева край, справа ' + (wallSide==='none'?'дальняя стойка':'стена'), 'scheme-label');

    const angleLabel = p.roofAngleDeg > 0.5 ? `уклон ${fmt(p.roofAngleDeg,1)}°` : 'плоская';
    const sideSvg = wrapSvg('0 0 330 220', side);
    return schemeBox('Навес — вид сверху', `${fmt(W,2)}×${fmt(D,2)} м · ${wallLabel||'отдельностоящий'}`, topSvg)
         + schemeBox('Навес — вид сбоку', `край ${fmt(Hedge,2)} м · стена ${fmt(Hwall,2)} м · ${angleLabel}`, sideSvg)
         + renderTrussGroupsScheme(r);
  }
  function renderPerilaScheme(r){
    const p = r.params;
    const L = Math.max(0.1,p.length), H = Math.max(0.1,p.height), postStep = Math.max(0.3,p.postStep || 1);
    const angle = Math.max(0, Math.min(60, p.railingAngle || 0));
    const postsCount = Math.ceil(L/postStep)+1;
    const x0=44, w=244;
    // Базовая линия пола: при угле наклоняем верх. Левый низ пола фиксирован.
    const yFloorL = 178;                         // пол слева
    const angleRad = angle * Math.PI/180;
    const totalRise = Math.min(86, w * Math.tan(angleRad)); // подъём пола справа (ограничен)
    const yFloorR = yFloorL - totalRise;          // пол справа выше при наклоне
    const ph = 92;                                // высота перил в пикселях (фикс для читаемости)
    let s='';
    // Пол (наклонный при угле)
    s += svgLine(x0,yFloorL,x0+w,yFloorR,'scheme-thin');
    // Поручень — параллельно полу, выше на ph (цвет отличает поручень от стоек)
    const yRailL = yFloorL - ph, yRailR = yFloorR - ph;
    s += svgLine(x0,yRailL,x0+w,yRailR,'scheme-rail');
    // Стойки — вертикальные, от пола до поручня
    for(let i=0;i<postsCount;i++){
      const t = i/Math.max(1,postsCount-1);
      const x = x0 + w*t;
      const yFloor = yFloorL - totalRise*t;
      const yRail = yFloor - ph;
      s += svgLine(x,yFloor,x,yRail,'scheme-element');
    }
    // Заполнение
    if(String(p.fillInfo||'').includes('вертик')){
      const count = Math.min(18, Math.max(2, Math.ceil(L/Math.max(0.12, inputNumber('fillStep',0.15)))));
      for(let i=1;i<count;i++){
        const t=i/count;
        const x=x0 + w*t;
        const yFloor=yFloorL - totalRise*t;
        s += svgLine(x,yFloor-6,x,yFloor-ph+8,'scheme-thin');
      }
    } else if(String(p.fillInfo||'').includes('гориз')){
      const rows = Math.min(6, Math.max(1, Math.round(inputNumber('horizontalRows',3))));
      for(let i=1;i<=rows;i++){
        const off = ph*i/(rows+1);
        s += svgLine(x0,yFloorL-off,x0+w,yFloorR-off,'scheme-thin');
      }
    }
    // Размерные линии
    s += svgDimLine(x0,yFloorL+24,x0+w,yFloorL+24,`длина (проекция) ${fmt(L,2)} м`);
    s += svgDimLine(x0-18,yFloorL-ph,x0-18,yFloorL,`${fmt(H,2)} м`);
    // Угол — позиция точно над линией пола, не пересекает её
    if(angle>0){
      const at = 0.16;
      const floorYAt = yFloorL - totalRise*at;
      s += svgText(x0+w*at, floorYAt-12, `угол ${fmt(angle,0)}°`, 'scheme-warn');
    }
    s += svgText(x0+w/2,28,`Вид сбоку · стойки: ${postsCount}${angle>0?' · наклон '+fmt(angle,0)+'°':''}`,'scheme-label');
    s += svgText(x0+w/2,212,`шаг стоек ${fmt(postStep,2)} м · ${p.fillInfo}`,'scheme-small');
    return schemeBox('Перила — '+(angle>0?'наклонные':'вид спереди'), `${fmt(L,2)} м · ${fmt(H,2)} м${angle>0?' · '+fmt(angle,0)+'°':''}`, wrapSvg('0 0 330 224', s));
  }
  function renderLestnicaScheme(r){
    const p = r.params;
    const height = Math.max(0.1,p.totalHeight), projection=Math.max(0.1,p.projection), steps=Math.max(2,Math.round(p.steps||2));
    const x0=66, y0=170, w=217, h=120;
    let s='';
    const pts=[];
    for(let i=0;i<=steps;i++){
      const x=x0 + w*i/steps;
      const y=y0 - h*i/steps;
      if(i===0) pts.push([x,y]);
      else { pts.push([x, pts[pts.length-1][1]]); pts.push([x,y]); }
    }
    // Заливка под лестницей цветом материала ступеней
    const stepFillCls = p.stepMaterialRaw==='wood' ? 'scheme-step-wood' : p.stepMaterialRaw==='concrete' ? 'scheme-step-concrete' : 'scheme-step-metal';
    const fillPts = [...pts, [x0+w,y0], [x0,y0]];
    s += `<polygon points="${fillPts.map(pt=>pt.join(',')).join(' ')}" class="${stepFillCls}" opacity="0.55"/>`;
    s += svgPolyline(pts,'scheme-element');
    s += svgLine(x0,y0,x0+w,y0-h,'scheme-element');
    s += svgLine(x0,y0,x0+w,y0,'scheme-thin');
    s += svgLine(x0+w,y0,x0+w,y0-h,'scheme-thin');
    if(p.hasRailing){
      s += svgLine(x0+10,y0-28,x0+w-5,y0-h-28,'scheme-rail');
      s += svgLine(x0+25,y0-15,x0+25,y0-42,'scheme-rail');
      s += svgLine(x0+w-25,y0-h-15,x0+w-25,y0-h-42,'scheme-rail');
    }
    s += svgDimLine(x0,y0+24,x0+w,y0+24,`проекция ${fmt(projection,2)} м`);
    s += svgDimLine(x0-18,y0-h,x0-18,y0,`подъём ${fmt(height,2)} м`);
    s += svgText(165,26,`Боковая схема · ${steps} ступ.`,'scheme-label');
    // Угол — в коридоре над косоуром (и под перилами, если они есть), не задевает ступени
    const at = 0.30;
    const stringerYAt = y0 - h*at;
    const angleX = x0 + w*at;
    const angleY = stringerYAt - (p.hasRailing ? 14 : 16);
    s += svgText(angleX,angleY,`угол ${fmt(p.angle,1)}°`,'scheme-warn');
    s += svgText(165,198,`ступень: ${fmt(p.rise,2)} м × ${fmt(p.run,2)} м`,'scheme-small');
    return schemeBox('Лестница — вид сбоку', `угол ${fmt(p.angle,1)}°`, wrapSvg('0 0 330 220', s));
  }

  function generateQuote(r){
    const client = inputText('clientName','').trim() || 'клиент';
    const phone = inputText('clientPhone','').trim() || '—';
    const addr = inputText('clientAddr','').trim() || '—';
    const comment = inputText('clientComment','').trim() || '—';
    const lines = [];
    lines.push('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ');
    lines.push('Metal OS / Welding OS v0.17');
    lines.push('');
    lines.push(`Изделие: ${r.product}`);
    lines.push(`Клиент: ${client}`);
    lines.push(`Телефон: ${phone}`);
    lines.push(`Объект: ${addr}`);
    lines.push('');
    lines.push('Размеры и параметры:');
    paramsRu(r).forEach(x=>lines.push('— ' + x));
    lines.push('');
    lines.push('Схема по размерам сформирована в приложении.');
    if(r.product === 'Навес' && r.params.trussEnabled && r.params.trussGroups && r.params.trussGroups.length){
      lines.push('');
      lines.push('Фермы навеса:');
      r.params.trussGroups.forEach(g=>{
        lines.push(`— G${g.number}. ${g.name}: ${g.typeLabel}, ${g.count} шт, пролёт ${fmt(g.span,2)} м, ${g.type==='arched'?'подъём '+fmt(g.rise,2)+' м':'высота '+fmt(g.height,2)+' м'}, решётка ${g.patternLabel}. Профили: верх ${g.profileTop}, низ ${g.profileBottom}, решётка ${g.profileWeb}.`);
      });
      lines.push('— Расчёт ферм предварительный для закупки металла и КП. Несущая способность требует отдельной инженерной проверки.');
    }
    lines.push('');
    lines.push('Закупка металла по профилям:');
    r.purchase.lines.forEach(l=>lines.push(`— ${l.profile}: нужно ${m(l.lengthWithWaste)}, купить ${l.sticks} хлыст. по 6 м, остаток ${m(l.leftoverMeters)}, вес ${kg(l.weight)}, закупка ${money(l.purchaseCost)}. Входит: ${l.labels.join(', ')}`));
    r.additionalMaterials.forEach(a=>lines.push(`— ${a.label}: ${a.qty}, ${money(a.cost)}`));
    lines.push(`— Расчётный вес металла (с запасом): ${kg(r.purchase.totalWeight)}`);
    lines.push(`— Ориентировочный вес закупки: ${kg(r.purchase.totalPurchaseWeight)}`);
    lines.push('');
    lines.push('Работы:');
    r.time.forEach(t=>lines.push(`— ${t.label}: ${fmt(t.hours,1)} ч`));
    lines.push(`— Итого: ${fmt(r.totalHours,1)} чел-часов`);
    lines.push('');
    lines.push('Работа и оплата:');
    const kpRoles = r.roleRows.filter(x=>x.enabled && x.cost>0);
    if(kpRoles.length){
      kpRoles.forEach(x=>lines.push(`— ${roleQuoteLabel(x.key)}: ${roleFormatLine(x)}`));
    } else {
      lines.push('— Работа не учтена в цене (роли не включены).');
    }
    lines.push(`— Ориентировочный срок: ${r.days} ${pluralDays(r.days)} по ролям: сварка, покраска и монтаж считаются последовательно`);
    lines.push('');
    lines.push('Стоимость:');
    lines.push(`— Материалы с наценкой: ${money(r.materialsClientCost)}`);
    lines.push(`— Работа: ${money(r.laborClientCost)}`);
    lines.push(`— Расходники: ${money(r.consumablesCost)}`);
    lines.push(`— ИТОГО предварительно: ${money(r.clientPrice)}`);
    lines.push('');
    lines.push('Риски и рекомендации:');
    if(r.risks.length) r.risks.forEach(x=>lines.push(`— ${x.level==='high'?'Высокий риск':x.level==='info'?'Информация':'Средний риск'}: ${x.text}`));
    else lines.push('— Критичных предупреждений не выявлено по предварительной проверке.');
    lines.push('');
    lines.push(`Комментарий: ${comment}`);
    lines.push('');
    lines.push('Важно: расчёт предварительный. После точного замера, проверки основания, креплений и условий монтажа стоимость и конструктив могут быть уточнены. Для ответственных конструкций нужен инженерный расчёт.');
    return lines.join('\n');
  }
  function copyQuote(){
    const text = $('quoteText').textContent;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(()=>showMsg('copyMsg','КП скопировано.')).catch(()=>fallbackCopy(text));
    } else fallbackCopy(text);
  }
  function fallbackCopy(text){
    const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); showMsg('copyMsg','КП скопировано.'); }
    catch(e){ showMsg('copyMsg','Не получилось скопировать автоматически. Выделите текст КП вручную и скопируйте.'); }
    document.body.removeChild(ta);
  }
  function handlePhoto(e){
    const file = e.target.files && e.target.files[0];
    const preview = $('photoPreview');
    if(!file){ preview.style.display='none'; preview.removeAttribute('src'); return; }
    const reader = new FileReader();
    reader.onload = ev => { preview.src=ev.target.result; preview.style.display='block'; };
    reader.readAsDataURL(file);
  }
  function boot(){
    renderRolesSection();
    setProduct('naves');
    setPreset('standard');
    loadSettings();
    attachNumericSanitizers();
    document.querySelectorAll('[data-product]').forEach(btn=>btn.addEventListener('click',()=>setProduct(btn.dataset.product)));
    document.querySelectorAll('[data-preset]').forEach(btn=>btn.addEventListener('click',()=>setPreset(btn.dataset.preset)));
    const priceCards = $('priceCards');
    if(priceCards){
      priceCards.addEventListener('input', e=>{ const name=e.target.dataset.priceType || e.target.dataset.priceValue; if(name) updatePriceLive(name); });
      priceCards.addEventListener('change', e=>{ const name=e.target.dataset.priceType || e.target.dataset.priceValue; if(name) updatePriceLive(name); });
    }
    const saveSettingsBtn = $('saveSettingsBtn');
    if(saveSettingsBtn) saveSettingsBtn.addEventListener('click',saveSettings);
    const resetSettingsBtn = $('resetSettingsBtn');
    if(resetSettingsBtn) resetSettingsBtn.addEventListener('click',resetSettings);
    const addTrussGroupBtn = $('addTrussGroupBtn');
    if(addTrussGroupBtn) addTrussGroupBtn.addEventListener('click', addTrussGroup);
    const trussDetails = $('trussDetails');
    if(trussDetails){
      trussDetails.addEventListener('input', ()=>{ syncTrussStateFromDom(); });
      trussDetails.addEventListener('change', ()=>{ syncTrussStateFromDom(); if(state.lastResult) calculate(); });
      trussDetails.addEventListener('click', e=>{
        const id = e.target && e.target.dataset ? e.target.dataset.trussRemove : null;
        if(id) removeTrussGroup(id);
      });
    }
    $('calcBtnBottom').addEventListener('click',()=>{ calculate(); $('resultsCard').scrollIntoView({behavior:'smooth', block:'start'}); });

    const printPdfBtn = $('printPdfBtn');
    if(printPdfBtn) printPdfBtn.addEventListener('click', ()=>window.print());

    $('jumpQuoteBtn').addEventListener('click',()=>{ calculate(); $('quoteCard').scrollIntoView({behavior:'smooth', block:'start'}); });
    $('copyQuoteBtn').addEventListener('click',copyQuote);
    $('photoInput').addEventListener('change',handlePhoto);
    calculate();
  }
  window.MetalOS = { calculate, setProduct, setPreset, state, pricePerMeter, pricePerStick, BUILD_DATE, TRUSS_TYPES, TRUSS_WEB_PATTERNS };
  document.addEventListener('DOMContentLoaded',boot);
})();
