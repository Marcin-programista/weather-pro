/* Weather Pro PWA — Open-Meteo + RainViewer */
const $ = (sel) => document.querySelector(sel);

const state = {
  place: null,           // {name, admin1, country, latitude, longitude}
  favorites: [],
  theme: "dark",
  radarOn: true,
  map: null,
  radarLayer: null,
  baseLayer: null,
  lastRadarTs: null
};

const LS_KEYS = {
  place: "wp_place",
  favorites: "wp_favorites",
  theme: "wp_theme",
  cache: "wp_last_payload"
};

function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.style.display = "none", 2600);
}

function setTheme(theme){
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  localStorage.setItem(LS_KEYS.theme, state.theme);
  $("#themeIcon").textContent = theme === "light" ? "☀️" : "🌙";
}

function loadStorage(){
  try{
    const theme = localStorage.getItem(LS_KEYS.theme);
    if(theme) setTheme(theme);
    else setTheme("dark");

    const fav = JSON.parse(localStorage.getItem(LS_KEYS.favorites) || "[]");
    state.favorites = Array.isArray(fav) ? fav : [];

    const place = JSON.parse(localStorage.getItem(LS_KEYS.place) || "null");
    if(place && place.latitude && place.longitude) state.place = place;
  }catch(e){
    console.warn("Storage error", e);
  }
}

function savePlace(place){
  state.place = place;
  localStorage.setItem(LS_KEYS.place, JSON.stringify(place));
}

function renderFavorites(){
  const el = $("#favoritesChips");
  el.innerHTML = "";
  state.favorites.forEach((p, idx) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<span>${escapeHtml(p.name)}</span><small>${escapeHtml(p.country || "")}</small>`;
    chip.onclick = () => { savePlace(p); refreshAll(); };
    chip.oncontextmenu = (ev) => { ev.preventDefault(); removeFavorite(idx); };
    el.appendChild(chip);
  });

  $("#hint").textContent = state.favorites.length
    ? "Tip: dłuższe przytrzymanie / prawy klik na ulubionym usuwa."
    : "Dodaj ulubione miejsca ⭐, aby szybko się przełączać.";
}

function addFavorite(){
  if(!state.place) return;
  const exists = state.favorites.some(f => samePlace(f, state.place));
  if(exists){
    toast("To miejsce już jest w ulubionych.");
    return;
  }
  state.favorites.unshift(state.place);
  state.favorites = state.favorites.slice(0, 10);
  localStorage.setItem(LS_KEYS.favorites, JSON.stringify(state.favorites));
  renderFavorites();
  toast("Dodano do ulubionych ⭐");
}

function removeFavorite(idx){
  const removed = state.favorites.splice(idx,1);
  localStorage.setItem(LS_KEYS.favorites, JSON.stringify(state.favorites));
  renderFavorites();
  toast(`Usunięto: ${removed?.[0]?.name || "miejsce"}`);
}

function samePlace(a,b){
  return (a && b &&
    Math.abs(a.latitude - b.latitude) < 0.0001 &&
    Math.abs(a.longitude - b.longitude) < 0.0001);
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* --- Weather code mapping (Open-Meteo WMO) --- */
function wmoText(code){
  const c = Number(code);
  const map = new Map([
    [0, "Bezchmurnie"],
    [1, "Przeważnie pogodnie"],
    [2, "Częściowe zachmurzenie"],
    [3, "Pochmurno"],
    [45, "Mgła"],
    [48, "Szadź / mgła osadzająca"],
    [51, "Mżawka słaba"],
    [53, "Mżawka umiarkowana"],
    [55, "Mżawka silna"],
    [56, "Marznąca mżawka słaba"],
    [57, "Marznąca mżawka silna"],
    [61, "Deszcz słaby"],
    [63, "Deszcz umiarkowany"],
    [65, "Deszcz silny"],
    [66, "Marznący deszcz słaby"],
    [67, "Marznący deszcz silny"],
    [71, "Śnieg słaby"],
    [73, "Śnieg umiarkowany"],
    [75, "Śnieg silny"],
    [77, "Ziarnisty śnieg"],
    [80, "Przelotny deszcz słaby"],
    [81, "Przelotny deszcz umiarkowany"],
    [82, "Przelotny deszcz silny"],
    [85, "Przelotny śnieg słaby"],
    [86, "Przelotny śnieg silny"],
    [95, "Burza"],
    [96, "Burza z gradem (słaba)"],
    [99, "Burza z gradem (silna)"],
  ]);
  return map.get(c) || "Warunki zmienne";
}

function wmoIcon(code, isDay=true){
  const c = Number(code);
  if([0].includes(c)) return isDay ? "☀️" : "🌙";
  if([1,2].includes(c)) return isDay ? "🌤️" : "☁️";
  if([3].includes(c)) return "☁️";
  if([45,48].includes(c)) return "🌫️";
  if([51,53,55,56,57].includes(c)) return "🌦️";
  if([61,63,65,80,81,82].includes(c)) return "🌧️";
  if([66,67].includes(c)) return "🧊🌧️";
  if([71,73,75,77,85,86].includes(c)) return "🌨️";
  if([95,96,99].includes(c)) return "⛈️";
  return "⛅";
}

/* --- API calls --- */
async function geocode(query){
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "pl");
  url.searchParams.set("format", "json");
  const res = await fetch(url, {cache:"no-store"});
  if(!res.ok) throw new Error("Błąd geokodowania");
  return res.json();
}

async function fetchWeather(lat, lon){
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("current", [
    "temperature_2m","apparent_temperature","relative_humidity_2m",
    "is_day","weather_code","wind_speed_10m","wind_direction_10m",
    "precipitation","rain","showers","snowfall"
  ].join(","));
  url.searchParams.set("hourly", [
    "temperature_2m","precipitation_probability","precipitation",
    "wind_speed_10m","weather_code","is_day"
  ].join(","));
  url.searchParams.set("daily", [
    "weather_code","temperature_2m_max","temperature_2m_min",
    "precipitation_probability_max","sunrise","sunset","uv_index_max"
  ].join(","));
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("past_days", "0");
  const res = await fetch(url, {cache:"no-store"});
  if(!res.ok) throw new Error("Błąd pobierania pogody");
  return res.json();
}

async function fetchAir(lat, lon){
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("hourly", ["pm10","pm2_5","us_aqi","european_aqi"].join(","));
  const res = await fetch(url, {cache:"no-store"});
  if(!res.ok) throw new Error("Błąd pobierania jakości powietrza");
  return res.json();
}

/* --- Render --- */
function fmtNum(v, digits=0){
  if(v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return n.toFixed(digits);
}

function degToDir(deg){
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  const i = Math.round((deg % 360) / 45) % 8;
  return dirs[i];
}

function renderCurrent(place, w){
  const c = w.current;
  const isDay = !!c.is_day;

  $("#placeName").textContent = `${place.name}${place.admin1 ? ", " + place.admin1 : ""} • ${place.country || ""}`;
  $("#tempNow").textContent = fmtNum(c.temperature_2m,0);
  $("#feelsLike").textContent = `${fmtNum(c.apparent_temperature,0)}°C`;
  $("#humidity").textContent = `${fmtNum(c.relative_humidity_2m,0)}%`;
  $("#wind").textContent = `${fmtNum(c.wind_speed_10m,0)} km/h ${degToDir(c.wind_direction_10m)}`;
  $("#precip").textContent = `${fmtNum(c.precipitation,1)} mm`;
  $("#summaryNow").textContent = wmoText(c.weather_code);
  $("#wxIcon").textContent = wmoIcon(c.weather_code, isDay);

  const now = new Date(w.current.time);
  $("#updatedAt").textContent = `Aktualizacja: ${now.toLocaleString("pl-PL", {dateStyle:"medium", timeStyle:"short"})}`;
}

function renderHourly(w){
  const el = $("#hourly");
  el.innerHTML = "";
  const times = w.hourly.time;
  const temp = w.hourly.temperature_2m;
  const pop = w.hourly.precipitation_probability;
  const pr = w.hourly.precipitation;
  const code = w.hourly.weather_code;
  const isDay = w.hourly.is_day;

  const now = Date.now();
  // pick next 24 hours
  let start = 0;
  for(let i=0;i<times.length;i++){
    const t = new Date(times[i]).getTime();
    if(t >= now){ start = i; break; }
  }
  for(let i=start;i<Math.min(start+24, times.length);i++){
    const dt = new Date(times[i]);
    const card = document.createElement("div");
    card.className = "hour";
    const hour = dt.toLocaleTimeString("pl-PL", {hour:"2-digit", minute:"2-digit"});
    const day = dt.toLocaleDateString("pl-PL", {weekday:"short"});
    card.innerHTML = `
      <div class="t">${fmtNum(temp[i],0)}°</div>
      <div class="m">${day} • ${hour}</div>
      <div class="row">
        <div class="icon">${wmoIcon(code[i], !!isDay?.[i])}</div>
        <div class="m">${fmtNum(pop?.[i] ?? 0,0)}% opadów</div>
      </div>
      <div class="p">${fmtNum(pr[i],1)} mm • wiatr ${fmtNum(w.hourly.wind_speed_10m[i],0)} km/h</div>
    `;
    el.appendChild(card);
  }
}

function renderDaily(w){
  const el = $("#daily");
  el.innerHTML = "";
  const t = w.daily.time;
  for(let i=0;i<t.length;i++){
    const dt = new Date(t[i]);
    const name = dt.toLocaleDateString("pl-PL", {weekday:"long"});
    const icon = wmoIcon(w.daily.weather_code[i], true);
    const desc = wmoText(w.daily.weather_code[i]);
    const tmax = fmtNum(w.daily.temperature_2m_max[i],0);
    const tmin = fmtNum(w.daily.temperature_2m_min[i],0);
    const pop = fmtNum(w.daily.precipitation_probability_max[i] ?? 0,0);

    const row = document.createElement("div");
    row.className = "day";
    row.innerHTML = `
      <div class="left">
        <div class="icon">${icon}</div>
        <div>
          <div class="name" style="text-transform:capitalize">${name}</div>
          <div class="desc">${desc} • ${pop}% opadów</div>
        </div>
      </div>
      <div class="temps">${tmax}° <span>/ ${tmin}°</span></div>
    `;
    el.appendChild(row);
  }
}

function aqiInfo(usAqi){
  const aqi = Number(usAqi);
  if(!Number.isFinite(aqi)) return {label:"—", colorClass:"", text:"Brak danych.", advice:"—"};
  if(aqi <= 50) return {label:"Dobra", colorClass:"ok", text:"Powietrze jest czyste.", advice:"Okno: tak • Aktywność: tak"};
  if(aqi <= 100) return {label:"Umiarkowana", colorClass:"warning", text:"Dla wrażliwych może być odczuwalne.", advice:"Okno: ostrożnie • Aktywność: ok"};
  if(aqi <= 150) return {label:"Niezdrowa (wrażliwi)", colorClass:"warning", text:"Ogranicz wysiłek na zewnątrz, jeśli jesteś wrażliwy.", advice:"Okno: krócej • Aktywność: lekka"};
  if(aqi <= 200) return {label:"Niezdrowa", colorClass:"danger", text:"Rozważ ograniczenie przebywania na zewnątrz.", advice:"Okno: nie • Aktywność: ogranicz"};
  if(aqi <= 300) return {label:"Bardzo niezdrowa", colorClass:"danger", text:"Zalecane pozostanie w domu.", advice:"Okno: nie • Aktywność: nie"};
  return {label:"Niebezpieczna", colorClass:"danger", text:"Unikaj wychodzenia na zewnątrz.", advice:"Okno: nie • Aktywność: nie"};
}

function renderAir(a){
  // choose nearest hour to now
  const times = a.hourly.time;
  const now = Date.now();
  let idx = 0;
  for(let i=0;i<times.length;i++){
    const t = new Date(times[i]).getTime();
    if(t >= now){ idx = i; break; }
  }
  const pm25 = a.hourly.pm2_5?.[idx];
  const pm10 = a.hourly.pm10?.[idx];
  const us = a.hourly.us_aqi?.[idx];
  const eu = a.hourly.european_aqi?.[idx];

  const info = aqiInfo(us);
  $("#aqiBadge").textContent = Number.isFinite(Number(us)) ? String(Math.round(us)) : "—";
  $("#aqiTitle").textContent = `AQI: ${info.label}`;
  $("#aqiSub").textContent = info.text;
  $("#pm25").textContent = `${fmtNum(pm25,1)} µg/m³`;
  $("#pm10").textContent = `${fmtNum(pm10,1)} µg/m³`;
  $("#euAqi").textContent = `${fmtNum(eu,0)}`;
  $("#aqiNote").textContent = info.advice;

  $("#aqiBadge").style.background = "var(--panel-2)";
  $("#aqiBadge").style.borderColor = "var(--border)";
  $("#aqiBadge").style.color = "var(--text)";

  // add subtle class coloring via inline outline
  const cls = info.colorClass;
  if(cls === "ok") $("#aqiBadge").style.boxShadow = "0 0 0 2px rgba(34,197,94,0.35) inset";
  if(cls === "warning") $("#aqiBadge").style.boxShadow = "0 0 0 2px rgba(251,191,36,0.35) inset";
  if(cls === "danger") $("#aqiBadge").style.boxShadow = "0 0 0 2px rgba(251,113,133,0.35) inset";
}

function renderAlerts(w, a){
  const el = $("#alerts");
  el.innerHTML = "";

  const c = w.current;
  const alerts = [];

  // Simple practical alerts
  if(Number(c.wind_speed_10m) >= 45){
    alerts.push({type:"warning", title:"Silny wiatr", text:`Wiatr ${fmtNum(c.wind_speed_10m,0)} km/h. Uważaj na luźne przedmioty i drzewa.`});
  }
  if(Number(c.temperature_2m) <= -5){
    alerts.push({type:"warning", title:"Mróz", text:`Temperatura ${fmtNum(c.temperature_2m,0)}°C. Ślisko — zachowaj ostrożność.`});
  }
  if(Number(c.temperature_2m) >= 30){
    alerts.push({type:"warning", title:"Upał", text:`Temperatura ${fmtNum(c.temperature_2m,0)}°C. Pij wodę i unikaj słońca w południe.`});
  }
  if([95,96,99].includes(Number(c.weather_code))){
    alerts.push({type:"danger", title:"Burza", text:"Możliwe wyładowania. Unikaj otwartych przestrzeni i drzew."});
  }

  // AQI based
  try{
    const times = a.hourly.time;
    const now = Date.now();
    let idx = 0;
    for(let i=0;i<times.length;i++){
      const t = new Date(times[i]).getTime();
      if(t >= now){ idx = i; break; }
    }
    const us = a.hourly.us_aqi?.[idx];
    if(Number(us) >= 120){
      alerts.push({type:"warning", title:"Słaba jakość powietrza", text:`AQI ${Math.round(us)}. Rozważ ograniczenie aktywności na zewnątrz.`});
    }
  }catch(e){}

  if(!alerts.length){
    alerts.push({type:"ok", title:"Warunki stabilne", text:"Brak istotnych ostrzeżeń w tej chwili."});
  }

  alerts.slice(0,3).forEach(a => {
    const div = document.createElement("div");
    div.className = `alert ${a.type}`;
    div.innerHTML = `<strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.text)}</span>`;
    el.appendChild(div);
  });
}

function setFavBtnLabel(){
  const btn = $("#favBtn");
  const exists = state.place && state.favorites.some(f => samePlace(f, state.place));
  btn.textContent = exists ? "⭐ W ulubionych" : "⭐ Dodaj do ulubionych";
}

/* --- Map / Radar --- */
async function initMap(){
  if(state.map) return;

  const map = L.map("map", {zoomControl: true});
  state.map = map;

  state.baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  map.setView([52.2297, 21.0122], 8); // default Warsaw
  await refreshRadarLayer();
}

async function refreshRadarLayer(){
  try{
    const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", {cache:"no-store"});
    if(!res.ok) throw new Error("Radar unavailable");
    const data = await res.json();
    const frames = data?.radar?.past;
    if(!frames?.length) throw new Error("No frames");
    const latest = frames[frames.length-1].time;
    state.lastRadarTs = latest;

    const tileUrl = `https://tilecache.rainviewer.com/v2/radar/${latest}/256/{z}/{x}/{y}/2/1_1.png?color=2&smooth=1&snow=1`;

    if(state.radarLayer){
      state.radarLayer.setUrl(tileUrl);
      return;
    }
    state.radarLayer = L.tileLayer(tileUrl, {opacity: 0.75, zIndex: 20});
    if(state.radarOn) state.radarLayer.addTo(state.map);
  }catch(e){
    console.warn(e);
    toast("Radar opadów niedostępny (spróbuj później).");
  }
}

function setRadar(on){
  state.radarOn = on;
  if(!state.map) return;
  if(on){
    if(state.radarLayer) state.radarLayer.addTo(state.map);
  }else{
    if(state.radarLayer) state.map.removeLayer(state.radarLayer);
  }
  $("#radarToggleBtn").textContent = on ? "⛈️ Radar: ON" : "⛈️ Radar: OFF";
}

function centerMap(){
  if(!state.map) return;
  if(state.place){
    state.map.setView([state.place.latitude, state.place.longitude], 9);
  }
}

/* --- Suggestions UI --- */
let suggestTimer = null;
function showSuggestions(items){
  const box = $("#suggestions");
  box.innerHTML = "";
  if(!items?.length){
    box.style.display = "none";
    return;
  }
  items.forEach(p => {
    const opt = document.createElement("div");
    opt.className = "option";
    opt.setAttribute("role","option");
    const meta = [p.admin1, p.country].filter(Boolean).join(", ");
    opt.innerHTML = `<div class="name">${escapeHtml(p.name)}</div><div class="meta">${escapeHtml(meta)}</div>`;
    opt.onclick = () => {
      box.style.display = "none";
      $("#searchInput").value = `${p.name}`;
      savePlace(p);
      refreshAll();
    };
    box.appendChild(opt);
  });
  box.style.display = "block";
}

async function onSearchInput(){
  clearTimeout(suggestTimer);
  const q = $("#searchInput").value.trim();
  if(q.length < 2){
    showSuggestions([]);
    return;
  }
  suggestTimer = setTimeout(async () => {
    try{
      const data = await geocode(q);
      const results = (data.results || []).map(r => ({
        name: r.name,
        admin1: r.admin1,
        country: r.country,
        latitude: r.latitude,
        longitude: r.longitude
      }));
      showSuggestions(results);
    }catch(e){
      showSuggestions([]);
    }
  }, 250);
}

/* --- Main refresh --- */
async function refreshAll(){
  if(!state.place){
    $("#placeName").textContent = "Wybierz lokalizację";
    return;
  }

  $("#subtitle").textContent = `${state.place.name} • ${state.place.country || ""}`;
  setFavBtnLabel();

  // Center map if already created
  if(state.map){
    state.map.setView([state.place.latitude, state.place.longitude], 9);
  }

  try{
    $("#searchBtn").disabled = true;
    $("#searchBtn").textContent = "Ładowanie…";

    const [w, a] = await Promise.all([
      fetchWeather(state.place.latitude, state.place.longitude),
      fetchAir(state.place.latitude, state.place.longitude)
    ]);

    renderCurrent(state.place, w);
    renderHourly(w);
    renderDaily(w);
    renderAir(a);
    renderAlerts(w,a);

    // store last successful payload (offline friendly)
    localStorage.setItem(LS_KEYS.cache, JSON.stringify({place: state.place, weather: w, air: a, savedAt: Date.now()}));

    // map init lazy
    await initMap();
    centerMap();

    // refresh radar periodically (light)
    await refreshRadarLayer();

  }catch(e){
    console.warn(e);
    // fallback to cached payload
    const cached = localStorage.getItem(LS_KEYS.cache);
    if(cached){
      try{
        const payload = JSON.parse(cached);
        renderCurrent(payload.place, payload.weather);
        renderHourly(payload.weather);
        renderDaily(payload.weather);
        renderAir(payload.air);
        renderAlerts(payload.weather, payload.air);
        toast("Offline: pokazuję ostatnie zapisane dane.");
      }catch(err){
        toast("Nie udało się wczytać danych.");
      }
    }else{
      toast("Nie udało się pobrać danych. Sprawdź internet.");
    }
  }finally{
    $("#searchBtn").disabled = false;
    $("#searchBtn").textContent = "Szukaj";
  }
}

/* --- Geolocation --- */
function locateMe(){
  if(!navigator.geolocation){
    toast("Twoja przeglądarka nie wspiera geolokalizacji.");
    return;
  }
  toast("Pobieram lokalizację…");
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    // Reverse geocoding: use Open-Meteo search with lat/lon is not directly supported, so approximate by searching nearest place name:
    // We'll call geocode with empty? Instead: use Nominatim for reverse (no key) — minimal.
    try{
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format","jsonv2");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("accept-language","pl");
      const res = await fetch(url, {headers: {"User-Agent":"WeatherProPWA/1.0 (student project)"}, cache:"no-store"});
      const data = await res.json();
      const name = data?.address?.city || data?.address?.town || data?.address?.village || data?.address?.municipality || "Twoja lokalizacja";
      const country = data?.address?.country || "";
      const admin1 = data?.address?.state || "";
      savePlace({name, country, admin1, latitude: lat, longitude: lon});
      refreshAll();
    }catch(e){
      savePlace({name:"Twoja lokalizacja", country:"", admin1:"", latitude: lat, longitude: lon});
      refreshAll();
    }
  }, () => {
    toast("Nie udało się pobrać lokalizacji (brak zgody?).");
  }, {enableHighAccuracy: true, timeout: 12000});
}

/* --- Share --- */
async function sharePlace(){
  if(!state.place) return;
  const url = new URL(location.href);
  url.searchParams.set("lat", String(state.place.latitude));
  url.searchParams.set("lon", String(state.place.longitude));
  url.searchParams.set("name", state.place.name);
  const shareData = {title:"Weather Pro", text:`Pogoda: ${state.place.name}`, url: url.toString()};
  try{
    if(navigator.share){
      await navigator.share(shareData);
    }else{
      await navigator.clipboard.writeText(url.toString());
      toast("Skopiowano link do schowka.");
    }
  }catch(e){
    // ignore
  }
}

/* --- URL params (deep-link) --- */
function loadFromUrl(){
  const sp = new URLSearchParams(location.search);
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const name = sp.get("name");
  if(Number.isFinite(lat) && Number.isFinite(lon) && name){
    savePlace({name, country:"", admin1:"", latitude: lat, longitude: lon});
  }
}

/* --- SW register --- */
async function registerSW(){
  if("serviceWorker" in navigator){
    try{
      await navigator.serviceWorker.register("sw.js");
    }catch(e){
      console.warn("SW register failed", e);
    }
  }
}

/* --- Init --- */
function wireUI(){
  $("#searchInput").addEventListener("input", onSearchInput);
  $("#searchInput").addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      $("#suggestions").style.display = "none";
      runSearch();
    }
  });
  $("#searchBtn").addEventListener("click", runSearch);
  $("#locateBtn").addEventListener("click", locateMe);
  $("#favBtn").addEventListener("click", () => { addFavorite(); setFavBtnLabel(); });
  $("#shareBtn").addEventListener("click", sharePlace);
  $("#themeBtn").addEventListener("click", () => setTheme(state.theme === "light" ? "dark" : "light"));

  $("#radarToggleBtn").addEventListener("click", () => {
    setRadar(!state.radarOn);
  });
  $("#centerMapBtn").addEventListener("click", centerMap);

  document.addEventListener("click", (e) => {
    const sug = $("#suggestions");
    if(!sug.contains(e.target) && e.target !== $("#searchInput")){
      sug.style.display = "none";
    }
  });
}

async function runSearch(){
  const q = $("#searchInput").value.trim();
  if(q.length < 2){
    toast("Wpisz co najmniej 2 znaki.");
    return;
  }
  try{
    const data = await geocode(q);
    const first = data?.results?.[0];
    if(!first){
      toast("Nie znaleziono lokalizacji.");
      return;
    }
    savePlace({
      name: first.name,
      admin1: first.admin1,
      country: first.country,
      latitude: first.latitude,
      longitude: first.longitude
    });
    $("#suggestions").style.display = "none";
    refreshAll();
  }catch(e){
    toast("Błąd wyszukiwania. Spróbuj ponownie.");
  }
}

window.addEventListener("load", async () => {
  loadFromUrl();
  loadStorage();
  renderFavorites();
  wireUI();
  await registerSW();

  // Default place: Warsaw if none
  if(!state.place){
    savePlace({name:"Warszawa", admin1:"Mazowieckie", country:"Polska", latitude:52.2297, longitude:21.0122});
  }
  await refreshAll();

  // Keep radar up to date occasionally
  setInterval(() => { if(state.map) refreshRadarLayer(); }, 10 * 60 * 1000);
});
