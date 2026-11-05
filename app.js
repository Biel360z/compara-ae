const KEY = 'precolitro:v2';
const SETTINGS_KEY = 'precolitro:settings:v1';
const PROFILE_KEY = 'precolitro:profile:v1';
const CONTRIBUTIONS_KEY = 'precolitro:contributions:v1';
const HERO_DISMISSED_KEY = 'precolitro:hero-dismissed';
const $ = id => document.getElementById(id);
const M = 60000;
let stations, sortBy = 'gas', here = null, doAnim = false, touched = null;
let sharedDataClient = null, sharedDataState = 'connecting';
if(window.supabase && window.COMPARAAE_SUPABASE){
  try{
    sharedDataClient = window.supabase.createClient(
      window.COMPARAAE_SUPABASE.url,
      window.COMPARAAE_SUPABASE.publishableKey
    );
  }catch(error){
    console.error('Não foi possível inicializar o cliente Supabase.', error);
  }
}
function readLocal(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){ return fallback; }
}
function readSettings(){
  const data = readLocal(SETTINGS_KEY, {});
  const saved = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const theme = ['system','light','dark'].includes(saved.theme) ? saved.theme : 'system';
  const value = Number(saved.limit);
  return {
    theme,
    limit: Number.isFinite(value) ? Math.min(90, Math.max(50, value)) : 70,
    city: typeof saved.city === 'string' ? saved.city.trim().slice(0, 50) : ''
  };
}
function readProfile(){
  const data = readLocal(PROFILE_KEY, {});
  const saved = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return {name: typeof saved.name === 'string' ? saved.name.slice(0, 30) : ''};
}
function readContributions(){
  const saved = readLocal(CONTRIBUTIONS_KEY, []);
  if(!Array.isArray(saved)) return [];
  return saved.filter(item => item && typeof item.detail === 'string' && typeof item.stationName === 'string' && Number.isFinite(item.time))
    .slice(0, 500);
}
let settings = readSettings(), profile = readProfile(), contributionEvents = readContributions();
function applyTheme(theme){
  if(theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}
applyTheme(settings.theme);
function saveSettings(){
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; }
  catch(e){ toast('Não foi possível salvar as configurações neste navegador.'); return false; }
}
function recordContribution(detail, station){
  const entry = {detail, stationName: station.name, stationId: station.id, time: Date.now()};
  const next = [entry, ...contributionEvents].slice(0, 500);
  try{
    localStorage.setItem(CONTRIBUTIONS_KEY, JSON.stringify(next));
    contributionEvents = next;
    return true;
  }catch(e){
    return false;
  }
}
const menuToggle = $('menuToggle');
function closeMenu(){
  document.body.classList.remove('menu-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Abrir menu');
}
menuToggle.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});
$('menuClose').addEventListener('click', closeMenu);
$('menuBackdrop').addEventListener('click', closeMenu);
$('sidebar').addEventListener('click', e => {
  if(e.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') closeMenu();
});

function load(){
  let parsed;
  try{
    const stored = localStorage.getItem(KEY);
    if(!stored) return [];
    parsed = JSON.parse(stored);
  }catch(e){
    toast('Não foi possível ler os postos salvos. A lista começa vazia.');
    return [];
  }
  if(!Array.isArray(parsed)){
    toast('Os dados salvos dos postos são inválidos. A lista começa vazia.');
    return [];
  }
  const demoIds = new Set(parsed.filter(s => s && s.demo === true).map(s => String(s.id)));
  const data = parsed.filter(s => s && s.demo !== true);
  if(data.length !== parsed.length){
    try{ localStorage.setItem(KEY, JSON.stringify(data)); }
    catch(e){ toast('Os postos de exemplo foram ocultados, mas não foi possível removê-los do armazenamento.'); }
    const history = contributionEvents.filter(item => !demoIds.has(String(item.stationId)));
    if(history.length !== contributionEvents.length){
      try{
        localStorage.setItem(CONTRIBUTIONS_KEY, JSON.stringify(history));
        contributionEvents = history;
      }catch(e){
        contributionEvents = history;
        toast('As ações dos postos de exemplo foram ocultadas, mas não foi possível limpar o histórico salvo.');
      }
    }
  }
  return data;
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(stations)); return true; }catch(e){ return false; } }

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl = v => v == null ? '—' : v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const kmTxt = k => k == null ? 'distância não informada' : (k < 1 ? Math.round(k*1000) + ' m' : k.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}) + ' km');
function distKm(s){
  if(here && s.lat != null){
    const r = Math.PI/180, dLat = (s.lat-here.lat)*r, dLng = (s.lng-here.lng)*r;
    const a = Math.sin(dLat/2)**2 + Math.cos(here.lat*r)*Math.cos(s.lat*r)*Math.sin(dLng/2)**2;
    return 12742*Math.asin(Math.sqrt(a));
  }
  return s.km == null ? null : s.km;
}
const distTxt = s => kmTxt(distKm(s));
const mapLink = s => `<a class="map" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=${s.lat != null ? s.lat + ',' + s.lng : encodeURIComponent(s.name)}">Ver no mapa</a>`;
function ago(t){
  const m = Math.round((Date.now()-t)/M);
  if(m < 2) return 'agora há pouco';
  if(m < 60) return 'há ' + m + ' min';
  const h = Math.round(m/60);
  return h < 24 ? 'há ' + h + ' h' : 'há ' + Math.round(h/24) + ' d';
}
const isOld = t => Date.now()-t > 24*60*M;
const limit = () => Math.min(90, Math.max(50, parseFloat($('limit').value) || 70)) / 100;

function cheapest(key){
  let best = null;
  stations.forEach(s => { const f = s[key]; if(f && (!best || f.p < best.f.p)) best = {s, f}; });
  return best;
}
function verdict(g, e){
  if(g == null || e == null) return null;
  const r = e / g;
  return {r, pct: Math.round(r*100), eth: r <= limit()};
}

function renderBoard(){
  [['gas','bGas'],['eth','bEth']].forEach(([k,id]) => {
    const b = cheapest(k);
    const el = $(id+'P'), txt = b ? brl(b.f.p) : '—';
    el.classList.remove('sk');
    if(el.textContent !== txt){ el.textContent = txt; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    $(id+'W').textContent = b ? b.s.name : 'Sem preços ainda';
    $(id+'T').textContent = b ? distTxt(b.s) + ' · ' + ago(b.f.t) : '';
  });
  const g = cheapest('gas'), e = cheapest('eth');
  const v = verdict(g && g.f.p, e && e.f.p);
  const t = $('vText'), sub = $('vSub');
  if(!v){ t.textContent = 'Faltam preços para comparar'; t.className = 'big num'; sub.textContent = ''; return; }
  t.textContent = v.eth ? 'Hoje compensa abastecer com etanol' : 'Hoje compensa abastecer com gasolina';
  t.className = 'big num ' + (v.eth ? 'pos-eth' : 'pos-gas');
  sub.textContent = 'Nos menores preços, o etanol custa ' + v.pct + '% do preço da gasolina. O limite para compensar é ' + Math.round(limit()*100) + '%.';
}

function cell(s, key, label, minP){
  const f = s[key];
  const cls = key;
  if(!f) return `<div class="cell"><div class="lab"><span class="dot" style="background:var(--${cls})"></span>${label}</div><div class="price num">—</div><div class="age">Sem preço informado</div></div>`;
  const best = minP != null && f.p === minP ? `<span class="pill ${cls}">menor preço</span>` : '';
  return `<div class="cell"><div class="lab"><span class="dot" style="background:var(--${cls})"></span>${label}${best}</div>
    <div class="price num">${brl(f.p)}</div>
    <div class="age ${isOld(f.t)?'old':''}">${ago(f.t)}${isOld(f.t)?' · pode estar desatualizado':''}</div>
    <button class="ok" data-ok="${s.id}:${key}" aria-label="Confirmar preço de ${label.toLowerCase()} em ${esc(s.name)}">Confere · ${f.c}</button></div>`;
}

function renderList(){
  $('list').classList.toggle('enter', doAnim); doAnim = false;
  const t = touched; touched = null;
  const val = s => sortBy === 'km' ? distKm(s) : (s[sortBy] ? s[sortBy].p : null);
  const sorted = [...stations].sort((a,b) => {
    const x = val(a), y = val(b);
    if(x == null && y == null) return 0;
    if(x == null) return 1;
    if(y == null) return -1;
    return x - y;
  });
  const minG = cheapest('gas'), minE = cheapest('eth');
  $('list').innerHTML = sorted.map((s, i) => {
    const v = verdict(s.gas && s.gas.p, s.eth && s.eth.p);
    const vt = v ? `<div class="v ${v.eth?'eth':'gas'}">${v.eth?'Etanol compensa':'Gasolina compensa'} · ${v.pct}%</div>` : `<div class="v none">Faltam preços para comparar</div>`;
    return `<li class="row${s.id === t ? ' pulse' : ''}" style="--i:${i}"><div class="who"><a class="wl" href="#posto-${s.id}">${logoHtml(s)}<span><strong>${esc(s.name)}${badge(s)}</strong><span class="km">${distTxt(s)}</span>${miniRate(s)}</span></a>${routeBtn(s, true)}</div>
      ${cell(s,'gas','Gasolina', minG && minG.f.p)}${cell(s,'eth','Etanol', minE && minE.f.p)}${vt}</li>`;
  }).join('') || '<li class="empty-state"><p>Ainda não há postos cadastrados.</p><a href="#informar">Seja o primeiro a informar um preço</a></li>';
  $('fStation').innerHTML = stations.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('') + '<option value="new">Outro posto…</option>';
  syncNew();
}
function skeleton(){
  ['bGasP','bEthP'].forEach(id => { $(id).textContent = '0,00'; $(id).classList.add('sk'); });
  ['bGasW','bEthW'].forEach(id => { $(id).innerHTML = '<div class="sk sk-line" style="width:60%"></div>'; });
  ['bGasT','bEthT'].forEach(id => { $(id).textContent = ''; });
  $('vText').textContent = 'Calculando…'; $('vSub').textContent = '';
  $('send').disabled = true;
  $('list').innerHTML = [1,2,3,4].map(() => '<li class="row skel"><div class="who"><div class="sk sk-line" style="width:70%"></div><div class="sk sk-line" style="width:40%"></div></div><div class="cell"><div class="sk sk-line" style="width:80%;height:30px"></div></div><div class="cell"><div class="sk sk-line" style="width:80%;height:30px"></div></div><div class="sk" style="height:38px"></div></li>').join('');
}
function render(){ $('send').disabled = false; renderBoard(); renderList(); }
function renderContributions(){
  const summary = $('contributionsSummary'), list = $('contributionsList');
  summary.textContent = contributionEvents.length + (contributionEvents.length === 1 ? ' contribuição registrada' : ' contribuições registradas');
  list.innerHTML = contributionEvents.length ? contributionEvents.map(item => {
    const station = stations.find(s => String(s.id) === String(item.stationId));
    const stationName = station ? `<a href="#posto-${encodeURIComponent(station.id)}">${esc(item.stationName)}</a>` : esc(item.stationName);
    const date = new Date(item.time);
    return `<li><p><strong>${esc(item.detail)}</strong></p><span class="km">${stationName} · <time datetime="${date.toISOString()}">${date.toLocaleString('pt-BR')}</time></span></li>`;
  }).join('') : '<li class="fine">Ainda não há contribuições neste navegador. Seus preços, confirmações, avaliações e comentários aparecerão aqui.</li>';
}
function renderProfile(){
  $('profileName').value = profile.name;
  $('profileStatus').textContent = profile.name ? 'Seu perfil local está salvo como “' + profile.name + '”.' : 'Você ainda não definiu um nome de exibição.';
}
function renderCity(){
  $('cityEyebrow').textContent = 'Compara Aê · ' + (settings.city || 'sua cidade');
  $('cityInput').value = settings.city;
}
renderCity();

let tt;
function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2400); }
function setSharedStatus(state, message){
  sharedDataState = state;
  $('backendStatus').textContent = message;
  if(state === 'online'){
    $('homeNote').textContent = 'Postos e preços são compartilhados sem seu nome. Confira o valor diretamente na bomba.';
    $('contributionNote').textContent = 'Preencha pelo menos um combustível. Seu nome e perfil não são enviados. Para salvar a localização de um posto novo, use primeiro “Usar minha localização”.';
  }else if(state === 'offline'){
    $('homeNote').textContent = 'O serviço compartilhado está indisponível. Confira o valor diretamente na bomba.';
    $('contributionNote').textContent = 'Preencha pelo menos um combustível. Sem conexão com o serviço, o envio fica somente neste navegador. Seu nome e perfil não são enviados.';
  }
}
async function ensureAnonymousSession(){
  if(!sharedDataClient) throw new Error('O cliente Supabase não foi carregado.');
  const {data, error} = await sharedDataClient.auth.getSession();
  if(error) throw error;
  if(data.session) return;
  const result = await sharedDataClient.auth.signInAnonymously();
  if(result.error) throw result.error;
}
async function fetchSharedStations(){
  const {data: stationRows, error: stationError} = await sharedDataClient
    .from('stations')
    .select('id,name,addr,lat,lng,created_at')
    .order('created_at', {ascending: false})
    .limit(1000);
  if(stationError) throw stationError;

  const {data: priceRows, error: priceError} = await sharedDataClient
    .from('latest_station_prices')
    .select('station_id,fuel_type,price,reported_at,report_count')
    .limit(1000);
  if(priceError) throw priceError;

  const oldByCloudId = new Map(stations.filter(s => s.cloudId).map(s => [String(s.cloudId), s]));
  const pricesByStation = new Map();
  (priceRows || []).forEach(row => {
    const prices = pricesByStation.get(String(row.station_id)) || {};
    prices[row.fuel_type] = {
      p: Number(row.price),
      t: new Date(row.reported_at).getTime(),
      c: Number(row.report_count)
    };
    pricesByStation.set(String(row.station_id), prices);
  });
  const remoteStations = (stationRows || []).map(row => {
    const old = oldByCloudId.get(String(row.id));
    const prices = pricesByStation.get(String(row.id)) || {};
    return {
      ...(old || {}),
      id: old ? old.id : row.id,
      cloudId: row.id,
      name: row.name,
      addr: row.addr,
      lat: row.lat,
      lng: row.lng,
      gas: prices.gas || null,
      eth: prices.eth || null
    };
  });
  const remoteIds = new Set(remoteStations.map(s => String(s.cloudId)));
  const cachedCloudStations = stations.filter(s => s.cloudId && !remoteIds.has(String(s.cloudId)));
  const localStations = stations.filter(s => !s.cloudId);
  stations = [...remoteStations, ...cachedCloudStations, ...localStations];
  if(!save()) console.warn('Os dados compartilhados foram carregados, mas não puderam ser armazenados em cache neste navegador.');
}
async function initializeSharedData(){
  if(!sharedDataClient){
    setSharedStatus('offline', 'Não foi possível carregar o serviço compartilhado. Os dados locais continuam disponíveis.');
    return;
  }
  try{
    await ensureAnonymousSession();
    await fetchSharedStations();
    setSharedStatus('online', 'Conectado: postos e preços compartilhados carregados.');
    render();
    route();
  }catch(error){
    console.error('Não foi possível carregar os dados compartilhados.', error);
    setSharedStatus('offline', 'Não foi possível conectar aos dados compartilhados. Seus dados locais continuam disponíveis.');
  }
}
async function submitSharedPrices(station, prices){
  await ensureAnonymousSession();
  const {data, error} = await sharedDataClient.rpc('submit_station_prices', {
    p_station_id: station && station.cloudId ? station.cloudId : null,
    p_name: station ? station.name : prices.name,
    p_addr: station && station.addr ? station.addr : null,
    p_lat: station && Number.isFinite(station.lat) ? station.lat : null,
    p_lng: station && Number.isFinite(station.lng) ? station.lng : null,
    p_gas_price: prices.gas == null ? null : prices.gas,
    p_eth_price: prices.eth == null ? null : prices.eth
  });
  if(error) throw error;
  return data;
}
async function refreshSharedStations(){
  try{
    await fetchSharedStations();
    setSharedStatus('online', 'Conectado: postos e preços compartilhados atualizados.');
    render();
    route();
  }catch(error){
    console.error('O envio foi recebido, mas a lista compartilhada não atualizou.', error);
    $('backendStatus').textContent = 'O preço foi enviado, mas a lista compartilhada não atualizou. Tente recarregar a página.';
  }
}
async function confirmPrice(s, key){
  const previous = {...s[key]};
  let shared = false;
  if(sharedDataClient){
    try{
      const remoteId = await submitSharedPrices(s, {gas: key === 'gas' ? s.gas.p : null, eth: key === 'eth' ? s.eth.p : null});
      if(!s.cloudId) s.cloudId = remoteId;
      shared = true;
    }catch(error){
      console.error('Não foi possível compartilhar a confirmação do preço.', error);
      setSharedStatus('offline', 'A confirmação não foi compartilhada. Os dados locais continuam disponíveis.');
    }
  }
  s[key].c++; s[key].t = Date.now();
  if(!save() && !shared){
    s[key] = previous;
    toast('Não foi possível salvar a confirmação.');
    return;
  }
  const logged = recordContribution('Confirmou o preço de ' + (key === 'gas' ? 'gasolina' : 'etanol'), s);
  if(shared) setSharedStatus('online', 'Sua confirmação foi compartilhada.');
  route();
  toast(shared ? (logged ? 'Preço confirmado e compartilhado' : 'Preço compartilhado, mas não entrou no histórico') : 'Confirmação salva só neste navegador');
  if(shared) refreshSharedStations();
}
try{
  if(sessionStorage.getItem(HERO_DISMISSED_KEY) === 'true') $('homeHero').hidden = true;
}catch(e){
  toast('Não foi possível restaurar as preferências desta sessão.');
}
$('dismissHero').addEventListener('click', () => {
  $('homeHero').hidden = true;
  try{
    sessionStorage.setItem(HERO_DISMISSED_KEY, 'true');
    toast('Chamada dispensada até o fim desta sessão.');
  }catch(e){
    toast('Chamada dispensada, mas a preferência não será mantida após recarregar a página.');
  }
});
const parsePrice = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };

function route(){
  const hash = location.hash;
  const m = hash.match(/^#posto-([a-z0-9-]+)$/i), s = m && stations.find(x => String(x.id) === m[1]);
  const page = {'#perfil':'page-perfil','#configuracoes':'page-configuracoes','#contribuicoes':'page-contribuicoes','#sobre':'page-sobre'}[hash];
  $('home').hidden = !!s || !!page;
  $('detail').hidden = !s;
  $('pages').hidden = !!s || !page;
  document.querySelectorAll('.page-view').forEach(el => { el.hidden = el.id !== page; });
  document.querySelectorAll('.sidebar nav a').forEach(link => {
    if(link.getAttribute('href') === hash) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if(s){ showDetail(s); window.scrollTo(0, 0); return; }
  if(page){
    if(page === 'page-perfil') renderProfile();
    if(page === 'page-configuracoes') renderCity();
    if(page === 'page-contribuicoes') renderContributions();
    window.scrollTo(0, 0);
    return;
  }
  if(ready) render();
  const t = hash.length > 1 && document.getElementById(hash.slice(1));
  if(t) t.scrollIntoView();
}

$('list').addEventListener('click', e => {
  const b = e.target.closest('[data-ok]'); if(!b) return;
  const [id, key] = b.dataset.ok.split(':');
  const s = stations.find(x => String(x.id) === id);
  if(s && s[key]) confirmPrice(s, key);
});
document.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => {
  sortBy = b.dataset.sort;
  document.querySelectorAll('[data-sort]').forEach(x => x.setAttribute('aria-pressed', x === b));
  if(sortBy === 'km' && !here) toast('Use sua localização para ver as distâncias reais');
  doAnim = true; renderList();
}));
$('limit').value = settings.limit;
$('limit').addEventListener('input', () => {
  const value = Number($('limit').value);
  if(Number.isFinite(value)){
    const previous = settings.limit;
    settings.limit = Math.min(90, Math.max(50, value));
    if(!saveSettings()){ settings.limit = previous; $('limit').value = previous; }
  }
  render();
});
$('themeSelect').value = settings.theme;
$('themeSelect').addEventListener('change', () => {
  const previous = settings.theme;
  settings.theme = $('themeSelect').value;
  applyTheme(settings.theme);
  if(!saveSettings()){ settings.theme = previous; $('themeSelect').value = previous; applyTheme(previous); }
});
$('cityInput').addEventListener('change', () => {
  const previous = settings.city;
  settings.city = $('cityInput').value.trim().slice(0, 50);
  if(!saveSettings()){
    settings.city = previous;
    $('cityInput').value = previous;
    return;
  }
  renderCity();
});
$('profileForm').addEventListener('submit', e => {
  e.preventDefault();
  const previous = profile;
  profile = {name: $('profileName').value.trim().slice(0, 30)};
  try{
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    renderProfile();
    toast('Perfil salvo neste navegador.');
  }catch(err){
    profile = previous;
    renderProfile();
    toast('Não foi possível salvar o perfil neste navegador.');
  }
});
function syncNew(){ const n = $('fStation').value === 'new'; $('newWrap').hidden = !n; $('hereWrap').hidden = !n; $('fHere').disabled = !here; }
$('fStation').addEventListener('change', syncNew);
$('send').addEventListener('click', async () => {
  const g = parsePrice($('fGas').value), e = parsePrice($('fEth').value);
  const bad = v => v != null && (v < 2 || v > 15);
  if(g == null && e == null){ toast('Informe o preço de pelo menos um combustível'); return; }
  if(bad(g) || bad(e)){ toast('Use preços entre R$ 2,00 e R$ 15,00'); return; }
  const previous = JSON.parse(JSON.stringify(stations));
  let s;
  if($('fStation').value === 'new'){
    const name = $('fNew').value.trim();
    if(!name){ toast('Digite o nome do posto'); return; }
    s = {id: Date.now(), name, km: null, gas: null, eth: null};
    if($('fHere').checked && here){ s.lat = here.lat; s.lng = here.lng; }
    stations.push(s);
  } else { s = stations.find(x => x.id == $('fStation').value); }
  if(!s){ toast('Selecione um posto válido.'); return; }
  const send = $('send');
  send.disabled = true;
  let shared = false;
  if(sharedDataClient){
    try{
      const remoteId = await submitSharedPrices(s, {gas: g, eth: e});
      if(!s.cloudId) s.cloudId = remoteId;
      shared = true;
      setSharedStatus('online', 'Seu envio foi compartilhado.');
    }catch(error){
      console.error('Não foi possível compartilhar os preços.', error);
      setSharedStatus('offline', 'Este envio não foi compartilhado. Os dados locais continuam disponíveis.');
    }
  }
  const now = Date.now();
  if(g != null) s.gas = {p: g, t: now, c: shared ? (s.gas ? s.gas.c + 1 : 1) : 1};
  if(e != null) s.eth = {p: e, t: now, c: shared ? (s.eth ? s.eth.c + 1 : 1) : 1};
  const saved = save();
  if(!saved && !shared){ stations = previous; send.disabled = false; render(); toast('Não foi possível salvar os preços neste navegador.'); return; }
  let historySaved = true;
  if(g != null) historySaved = recordContribution('Informou gasolina: ' + brl(g), s) && historySaved;
  if(e != null) historySaved = recordContribution('Informou etanol: ' + brl(e), s) && historySaved;
  send.disabled = false;
  $('fGas').value = ''; $('fEth').value = ''; $('fNew').value = ''; $('fHere').checked = false;
  touched = s.id; render();
  toast(shared ? (saved ? 'Preços enviados e compartilhados' : 'Preços compartilhados, mas não salvos em cache') : (saved ? 'Salvos só neste navegador; não foram compartilhados' : 'Não foi possível salvar os preços neste navegador'));
  if(!historySaved) toast('Preços enviados, mas o histórico não foi salvo');
  if(shared) refreshSharedStations();
});
$('locBtn').addEventListener('click', () => {
  const msg = $('locMsg');
  if(!navigator.geolocation){ msg.textContent = 'Este navegador não oferece localização.'; return; }
  msg.textContent = 'Buscando sua localização…';
  $('locBtn').disabled = true; $('locBtn').innerHTML = '<span class="spin"></span>Buscando…'; skeleton();
  navigator.geolocation.getCurrentPosition(p => {
    here = {lat: p.coords.latitude, lng: p.coords.longitude};
    $('locBtn').disabled = false; $('locBtn').textContent = 'Atualizar localização'; doAnim = true;
    msg.textContent = 'Distâncias em linha reta a partir da sua posição. Postos sem localização cadastrada podem não ter distância precisa.';
    render();
  }, err => {
    $('locBtn').disabled = false; $('locBtn').textContent = here ? 'Atualizar localização' : 'Usar minha localização'; render();
    msg.textContent = err.code === 1 ? 'Localização bloqueada. Libere o acesso no navegador para ver as distâncias.' : 'Não foi possível obter sua localização aqui. Tente abrir a página em uma aba própria.';
  }, {enableHighAccuracy: true, timeout: 10000, maximumAge: 60000});
});

const VER = 10;
const confirms = s => ((s.gas && s.gas.c) || 0) + ((s.eth && s.eth.c) || 0);
const verified = s => confirms(s) >= VER;
const badge = s => verified(s) ? '<span class="vbtn" role="button" tabindex="0" aria-label="Posto verificado. Toque para saber mais"><svg class="vb" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.2l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z" fill="#1D9BF0"/><path d="M8 12.3l2.8 2.8 5.4-5.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' : '';
const fmt1 = n => n.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const avg = s => s.rs && s.rs.n ? s.rs.sum / s.rs.n : null;
const star = on => '<svg class="st" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="' + (on ? '#F5A623' : 'none') + '" stroke="#F5A623" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const miniRate = s => avg(s) == null ? '' : '<span class="mr">' + star(true) + fmt1(avg(s)) + '</span>';
function avgHtml(s){
  const a = avg(s);
  if(a == null) return '<span class="km">Sem avaliações ainda</span>';
  return [1,2,3,4,5].map(i => star(i <= Math.round(a))).join('') + ' <b>' + fmt1(a) + '</b> <span class="km">(' + s.rs.n + ' avaliações)</span>';
}
function reviewsHtml(s){
  const cm = [...(s.cm || [])].sort((a, b) => b.t - a.t);
  return `<h2 style="margin-top:28px">Avaliações e comentários</h2>
  <div class="mine"><span>${s.mine ? 'Sua avaliação' : 'Avalie este posto'}</span>
    <div class="pick" role="radiogroup" aria-label="Sua nota de 1 a 5">${[1,2,3,4,5].map(i => `<button type="button" role="radio" aria-checked="${s.mine === i}" aria-label="${i} ${i === 1 ? 'estrela' : 'estrelas'}" data-star="${i}">${star(i <= (s.mine || 0))}</button>`).join('')}</div></div>
  <div class="cform"><label>Seu nome (opcional)<input id="cName" maxlength="30" placeholder="Como quer aparecer" value="${esc(profile.name)}"></label>
    <label>Comentário<textarea id="cText" maxlength="300" rows="3" placeholder="Conte como foi abastecer aqui"></textarea></label>
    <button class="primary" id="cSend" type="button">Publicar comentário</button></div>
  <ul class="cms">${cm.length ? cm.map(c => `<li><div class="cav" aria-hidden="true">${esc((c.n || 'V')[0].toUpperCase())}</div><div><b>${esc(c.n || 'Visitante')}</b> <span class="km">${ago(c.t)}</span><p>${esc(c.x)}</p></div></li>`).join('') : '<li class="fine">Nenhum comentário ainda. Seja a primeira pessoa a comentar.</li>'}</ul>`;
}
const routeBtn = (s, mini) => {
  const ico = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-8-8 18-2-8z"/></svg>';
  const dest = s.lat != null ? s.lat + ',' + s.lng : encodeURIComponent(s.name + (s.addr ? ', ' + s.addr : ''));
  return '<a class="route' + (mini ? ' mini' : '') + '" target="_blank" rel="noopener" aria-label="Rotas até ' + esc(s.name) + '" title="Rotas" href="https://www.google.com/maps/dir/?api=1&amp;destination=' + dest + '&amp;travelmode=driving">' + ico + (mini ? '' : 'Rotas') + '</a>';
};
const SERV = ['Loja de conveniência','Calibragem','Troca de óleo','Lavagem','Banheiro','Caixa eletrônico','Aceita Pix'];
let ready = false;
function logoHtml(s, big){
  const c = 'logo' + (big ? ' big' : '');
  if(s.logo) return `<img class="${c}" src="${s.logo}" alt="">`;
  const ini = s.name.split(/\s+/).filter(w => w.length > 2).slice(0,2).map(w => w[0]).join('').toUpperCase() || s.name[0].toUpperCase();
  return `<span class="${c} ini" aria-hidden="true">${esc(ini)}</span>`;
}
function toUrl(file, max, type, q){
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); res(c.toDataURL(type, q));
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('img')); };
    img.src = u;
  });
}
function showDetail(s){
  const v = verdict(s.gas && s.gas.p, s.eth && s.eth.p), ph = s.photos || [], sv = s.serv || [];
  const info = (k, label, hint) => `<label>${label}<input data-info="${k}" maxlength="80" placeholder="${hint}" value="${esc(s[k] || '')}"></label>`;
  $('detail').innerHTML = `<div class="fade">
  <a class="back" href="#postos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>Voltar aos postos</a>
  <div class="dhead"><label class="picker" aria-label="Trocar logo do posto">${logoHtml(s, true)}<span class="tag">Trocar</span><input type="file" accept="image/*" data-logo hidden></label>
    <div><h1>${esc(s.name)}${badge(s)}</h1><span class="km">${distTxt(s)}</span>${mapLink(s)}<div class="rate">${avgHtml(s)}</div><div class="rbar">${routeBtn(s)}</div></div></div>
  ${verified(s) ? '' : '<p class="fine">Faltam ' + (VER - confirms(s)) + ' confirmações para este posto ser verificado.</p>'}
  <div class="dprices">${cell(s,'gas','Gasolina',null)}${cell(s,'eth','Etanol',null)}</div>
  ${v ? `<div class="v ${v.eth ? 'eth' : 'gas'}">${v.eth ? 'Etanol compensa' : 'Gasolina compensa'} · ${v.pct}%</div>` : ''}
  <h2 style="margin-top:28px">Informações</h2>
  <div class="fields" style="margin-bottom:24px">${info('addr','Endereço','Rua, número, bairro')}${info('hours','Horário','Ex.: 24 horas')}${info('tel','Telefone','(00) 00000-0000')}</div>
  <h2>Serviços</h2>
  <div class="chips">${SERV.map((n, i) => `<label class="chip"><input type="checkbox" data-serv="${i}"${sv.includes(n) ? ' checked' : ''}>${n}</label>`).join('')}</div>
  <h2>Fotos</h2>
  <div class="gal">${ph.map((p, i) => `<figure><img src="${p}" alt="Foto ${i+1} de ${esc(s.name)}" loading="lazy"><button type="button" data-rm="${i}" aria-label="Remover foto ${i+1}">×</button></figure>`).join('')}${ph.length < 6 ? '<label class="add">Adicionar foto<input type="file" accept="image/*" data-photo hidden></label>' : ''}</div>
  ${reviewsHtml(s)}</div>`;
}
const curStation = () => stations.find(x => x.id == location.hash.slice(7));
$('detail').addEventListener('click', e => {
  const s = curStation(); if(!s) return;
  const ok = e.target.closest('[data-ok]'), rm = e.target.closest('[data-rm]'), st = e.target.closest('[data-star]');
  if(ok){
    const k = ok.dataset.ok.split(':')[1];
    if(s[k]) confirmPrice(s, k);
  }
  else if(rm){ (s.photos || []).splice(+rm.dataset.rm, 1); save(); showDetail(s); toast('Foto removida'); }
  else if(st){
    const previous = JSON.parse(JSON.stringify(s));
    const v = +st.dataset.star; s.rs = s.rs || {sum: 0, n: 0};
    if(s.mine) s.rs.sum += v - s.mine; else { s.rs.sum += v; s.rs.n++; }
    s.mine = v;
    if(!save()){
      Object.keys(s).forEach(key => { if(!(key in previous)) delete s[key]; });
      Object.assign(s, previous);
      toast('Não foi possível salvar sua avaliação.');
      return;
    }
    const logged = recordContribution('Avaliou o posto com ' + v + (v === 1 ? ' estrela' : ' estrelas'), s);
    showDetail(s); toast(logged ? 'Avaliação enviada' : 'Avaliação enviada, mas não entrou no histórico');
  }
  else if(e.target.id === 'cSend'){
    const x = $('cText').value.trim();
    if(!x){ toast('Escreva um comentário'); return; }
    const name = $('cName').value.trim() || profile.name;
    s.cm = s.cm || []; s.cm.push({n: name, x, t: Date.now()});
    if(!save()){ s.cm.pop(); toast('Sem espaço no navegador'); return; }
    const logged = recordContribution('Publicou um comentário', s);
    showDetail(s); toast(logged ? 'Comentário publicado' : 'Comentário publicado, mas não entrou no histórico');
  }
});
$('detail').addEventListener('change', async e => {
  const t = e.target, s = curStation(); if(!s) return;
  if(t.dataset.info){ s[t.dataset.info] = t.value.trim(); save(); return; }
  if('serv' in t.dataset){ const n = SERV[+t.dataset.serv], cur = s.serv || []; s.serv = t.checked ? [...new Set([...cur, n])] : cur.filter(x => x !== n); save(); return; }
  if(t.files && t.files[0]){
    const f = t.files[0]; t.value = '';
    try{
      if('logo' in t.dataset){
        const old = s.logo; s.logo = await toUrl(f, 160, 'image/png');
        if(!save()){ s.logo = old; toast('Sem espaço no navegador para essa imagem'); return; }
      } else {
        s.photos = s.photos || [];
        if(s.photos.length >= 6){ toast('Limite de 6 fotos por posto'); return; }
        s.photos.push(await toUrl(f, 900, 'image/jpeg', 0.72));
        if(!save()){ s.photos.pop(); toast('Sem espaço no navegador para essa imagem'); return; }
      }
      showDetail(s); toast('Imagem adicionada');
    }catch(err){ toast('Não foi possível ler essa imagem'); }
  }
});
const tip = $('tip'); let tipOwner = null, tipSticky = false;
function showTip(el){
  tip.textContent = 'Verificado: os preços deste posto foram confirmados por ' + VER + ' ou mais pessoas.';
  tip.hidden = false;
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  const x = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12));
  let y = r.bottom + 8; if(y + h > innerHeight - 12) y = r.top - h - 8;
  tip.style.left = x + 'px'; tip.style.top = y + 'px'; tipOwner = el;
}
function hideTip(){ tip.hidden = true; tipOwner = null; tipSticky = false; }
document.addEventListener('mouseover', e => { const b = e.target.closest('.vbtn'); if(b && !tipSticky && tipOwner !== b) showTip(b); });
document.addEventListener('mouseout', e => { if(e.target.closest('.vbtn') && !tipSticky) hideTip(); });
document.addEventListener('click', e => {
  const b = e.target.closest('.vbtn');
  if(b){ e.preventDefault(); if(tipSticky && tipOwner === b) hideTip(); else { tipSticky = true; showTip(b); } }
  else hideTip();
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') hideTip();
  const b = e.target.closest && e.target.closest('.vbtn');
  if(b && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); b.click(); }
});
const clock = $('clock');
function tick(){
  const d = new Date();
  clock.dateTime = d.toISOString();
  clock.textContent = d.toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long'}) + ', ' + d.toLocaleTimeString('pt-BR');
}
tick(); setInterval(tick, 1000);
window.addEventListener('scroll', hideTip, {passive: true});
window.addEventListener('hashchange', hideTip);
window.addEventListener('hashchange', route);

stations = load();
skeleton();
setTimeout(() => { ready = true; doAnim = true; render(); }, 650);
initializeSharedData();
route();
