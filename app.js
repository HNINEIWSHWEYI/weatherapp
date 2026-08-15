/* Skycast — a small weather site on top of the Open-Meteo public API.
   No API key, no build step. Just open index.html. */

const GEO_URL      = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REVERSE_URL  = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

const els = {
  form:      document.getElementById('search-form'),
  input:     document.getElementById('search-input'),
  locate:    document.getElementById('locate-btn'),
  sugList:   document.getElementById('suggestions'),
  units:     document.querySelectorAll('.unit-toggle button'),
  status:    document.getElementById('status'),
  content:   document.getElementById('content'),
  place:     document.getElementById('place'),
  localtime: document.getElementById('localtime'),
  icon:      document.getElementById('current-icon'),
  temp:      document.getElementById('temp'),
  condition: document.getElementById('condition'),
  feels:     document.getElementById('feels'),
  humidity:  document.getElementById('m-humidity'),
  wind:      document.getElementById('m-wind'),
  precip:    document.getElementById('m-precip'),
  pressure:  document.getElementById('m-pressure'),
  sunrise:   document.getElementById('m-sunrise'),
  sunset:    document.getElementById('m-sunset'),
  hourly:    document.getElementById('hourly'),
  daily:     document.getElementById('daily'),
  bg:        document.getElementById('weather-bg'),
};

const state = {
  unit: localStorage.getItem('skycast.unit') || 'celsius',
  place: null,       // { name, admin1, country, latitude, longitude }
  suggestions: [],
  activeSug: -1,
};

/* ------------------------------------------------------------------ *
 * WMO weather codes → label + icon
 * ------------------------------------------------------------------ */

const WMO = {
  0:  'Clear sky',              1:  'Mainly clear',
  2:  'Partly cloudy',          3:  'Overcast',
  45: 'Fog',                    48: 'Rime fog',
  51: 'Light drizzle',          53: 'Drizzle',            55: 'Heavy drizzle',
  56: 'Freezing drizzle',       57: 'Freezing drizzle',
  61: 'Light rain',             63: 'Rain',               65: 'Heavy rain',
  66: 'Freezing rain',          67: 'Freezing rain',
  71: 'Light snow',             73: 'Snow',               75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',          81: 'Showers',            82: 'Violent showers',
  85: 'Snow showers',           86: 'Heavy snow showers',
  95: 'Thunderstorm',           96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail',
};

const describe = (code) => WMO[code] ?? 'Unknown';

/* --- SVG icon pieces (64×64 viewBox) --- */

const rays = (cx, cy, r) => {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    const x1 = cx + Math.cos(a) * (r + 4), y1 = cy + Math.sin(a) * (r + 4);
    const x2 = cx + Math.cos(a) * (r + 9), y2 = cy + Math.sin(a) * (r + 9);
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  }
  return `<g stroke="#fbbf24" stroke-width="3" stroke-linecap="round">${out.join('')}</g>`;
};

const sun  = (cx = 32, cy = 32, r = 12) => `<circle class="wi-sun" cx="${cx}" cy="${cy}" r="${r}"/>${rays(cx, cy, r)}`;
const moon = () => `<path class="wi-moon" d="M44 43a19 19 0 0 1-19-19c0-4.3 1.4-8.2 3.8-11.4A21 21 0 1 0 55.4 39.2 18.9 18.9 0 0 1 44 43z"/>`;

const cloud = (dx = 0, dy = 0, cls = 'wi-cloud', s = 1) => `
  <g class="${cls}" transform="translate(${dx} ${dy}) scale(${s})" transform-origin="32 32">
    <circle cx="24" cy="34" r="11"/>
    <circle cx="38" cy="30" r="13"/>
    <circle cx="47" cy="38" r="8"/>
    <rect x="16" y="36" width="35" height="12" rx="6"/>
  </g>`;

const drops = (n = 3) => {
  const xs = n === 2 ? [26, 38] : [22, 32, 42];
  return `<g class="wi-rain">${xs.map((x, i) =>
    `<line x1="${x}" y1="${50 + (i % 2) * 2}" x2="${x - 4}" y2="${59 + (i % 2) * 2}"/>`).join('')}</g>`;
};

const flakes = () => `<g class="wi-snow">${[22, 32, 42].map((x, i) => {
  const y = 54 + (i % 2) * 3;
  return `<line x1="${x - 4}" y1="${y}" x2="${x + 4}" y2="${y}"/>
          <line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}"/>
          <line x1="${x - 3}" y1="${y - 3}" x2="${x + 3}" y2="${y + 3}"/>
          <line x1="${x + 3}" y1="${y - 3}" x2="${x - 3}" y2="${y + 3}"/>`;
}).join('')}</g>`;

const bolt = () => `<polygon class="wi-bolt" points="34,46 24,62 31,62 28,74 42,54 34,54 40,46"/>`;

const svg = (inner) => `<svg viewBox="0 0 64 70" xmlns="http://www.w3.org/2000/svg" role="img">${inner}</svg>`;

function iconFor(code, isDay = 1) {
  const orb = isDay ? sun() : moon();
  const smallOrb = isDay ? sun(24, 22, 9) : `<path class="wi-moon" d="M31 32a13 13 0 0 1-13-13c0-2.9.9-5.6 2.6-7.8A14.4 14.4 0 1 0 38.8 29 13 13 0 0 1 31 32z"/>`;

  if (code === 0) return svg(orb);
  if (code === 1) return svg(smallOrb + cloud(4, 6, 'wi-cloud', 0.82));
  if (code === 2) return svg(smallOrb + cloud(2, 4));
  if (code === 3) return svg(cloud(0, 0, 'wi-cloud-dark') + cloud(-6, -6, 'wi-cloud', 0.8));
  if (code === 45 || code === 48) {
    return svg(cloud(0, -6) + `<g class="wi-fog">
      <line x1="16" y1="50" x2="48" y2="50"/>
      <line x1="20" y1="57" x2="52" y2="57"/>
      <line x1="16" y1="64" x2="44" y2="64"/></g>`);
  }
  if (code >= 51 && code <= 57) return svg(cloud(0, -4) + drops(2));
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return svg(cloud(0, -4, 'wi-cloud-dark') + drops(3));
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return svg(cloud(0, -4) + flakes());
  if (code >= 95) return svg(cloud(0, -6, 'wi-cloud-dark') + bolt());
  return svg(cloud());
}

/* ------------------------------------------------------------------ *
 * Animated background — CSS-driven, built from DOM particles.
 * Swaps in clouds/rain/snow/stars/fog/lightning based on the current
 * WMO code and day/night, instead of embedding external GIFs.
 * ------------------------------------------------------------------ */

const WX_THEMES = ['wx-clear-day', 'wx-clear-night', 'wx-cloudy', 'wx-rain', 'wx-snow', 'wx-storm', 'wx-fog'];
let flashTimer = null;

const rand = (min, max) => Math.random() * (max - min) + min;

function spawn(className, count, propsFn) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = className;
    const props = propsFn(i);
    for (const key in props) el.style.setProperty(key, props[key]);
    frag.appendChild(el);
  }
  els.bg.appendChild(frag);
}

function scheduleFlash(flash) {
  flashTimer = setTimeout(() => {
    flash.classList.remove('hit');
    void flash.offsetWidth; // restart the CSS animation
    flash.classList.add('hit');
    scheduleFlash(flash);
  }, rand(3500, 9000));
}

function setWeatherBackground(code, isDay) {
  els.bg.innerHTML = '';
  document.body.classList.remove(...WX_THEMES);
  clearTimeout(flashTimer);

  const night = !isDay;
  const cloudLayer = (count, opts = {}) => spawn('bg-cloud', count, () => ({
    '--top': rand(opts.topMin ?? 0, opts.topMax ?? 45) + '%',
    '--dur': rand(opts.durMin ?? 50, opts.durMax ?? 90) + 's',
    '--delay': -rand(0, 70) + 's',
    '--o': rand(opts.oMin ?? 0.12, opts.oMax ?? 0.24),
  }));
  const starLayer = (count) => spawn('bg-star', count, () => ({
    '--top': rand(0, 65) + '%',
    '--left': rand(0, 100) + '%',
    '--size': rand(1, 3) + 'px',
    '--dur': rand(2, 5) + 's',
    '--delay': rand(0, 5) + 's',
  }));
  const rainLayer = (count) => spawn('bg-rain', count, () => ({
    '--left': rand(0, 100) + '%',
    '--dur': rand(0.5, 1.1) + 's',
    '--delay': rand(0, 2) + 's',
  }));

  if (code === 0) {
    document.body.classList.add(night ? 'wx-clear-night' : 'wx-clear-day');
    if (night) starLayer(70);
    const glow = document.createElement('div');
    glow.className = night ? 'bg-moon-glow' : 'bg-sun-glow';
    els.bg.appendChild(glow);
  } else if (code === 1 || code === 2) {
    document.body.classList.add(night ? 'wx-clear-night' : 'wx-clear-day');
    if (night) starLayer(40);
    const glow = document.createElement('div');
    glow.className = night ? 'bg-moon-glow' : 'bg-sun-glow';
    els.bg.appendChild(glow);
    cloudLayer(code === 1 ? 2 : 4);
  } else if (code === 3) {
    document.body.classList.add('wx-cloudy');
    cloudLayer(6, { topMax: 60, oMin: 0.16, oMax: 0.3 });
  } else if (code === 45 || code === 48) {
    document.body.classList.add('wx-fog');
    spawn('bg-fog-band', 5, () => ({
      '--top': rand(0, 90) + '%',
      '--dur': rand(25, 45) + 's',
      '--delay': rand(0, 10) + 's',
    }));
  } else if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    document.body.classList.add('wx-rain');
    cloudLayer(4, { topMax: 30 });
    const heavy = code === 65 || code === 82 ? 100 : code >= 61 ? 75 : 45;
    rainLayer(heavy);
  } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    document.body.classList.add('wx-snow');
    cloudLayer(3, { topMax: 25 });
    spawn('bg-snow', 60, () => ({
      '--left': rand(0, 100) + '%',
      '--size': rand(3, 7) + 'px',
      '--o': rand(0.5, 0.9),
      '--dur': rand(6, 14) + 's',
      '--delay': rand(0, 10) + 's',
    }));
  } else if (code >= 95) {
    document.body.classList.add('wx-storm');
    cloudLayer(5, { topMax: 30, oMin: 0.18, oMax: 0.32 });
    rainLayer(90);
    const flash = document.createElement('div');
    flash.className = 'bg-flash';
    els.bg.appendChild(flash);
    scheduleFlash(flash);
  }
}

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */

const isC = () => state.unit === 'celsius';
const degUnit  = () => (isC() ? '°C' : '°F');
const windUnit = () => (isC() ? 'km/h' : 'mph');
const rainUnit = () => (isC() ? 'mm' : 'in');

const round = (n) => (n == null ? '—' : Math.round(n));
const deg   = (n) => (n == null ? '—' : `${Math.round(n)}°`);

/* Open-Meteo returns local-to-the-location times like "2026-08-08T14:00".
   Parsing them as naive dates keeps the wall-clock reading intact. */
const parseLocal = (s) => new Date(s);

const fmtHour = (d) => d.toLocaleTimeString([], { hour: 'numeric' });
const fmtClock = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDayName = (d) => d.toLocaleDateString([], { weekday: 'short' });
const fmtDayDate = (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });

function compass(degrees) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}

function placeLabel(p) {
  return [p.name, p.admin1, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
}

/* ------------------------------------------------------------------ *
 * Networking
 * ------------------------------------------------------------------ */

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

async function geocode(query) {
  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const data = await getJSON(url);
  return data.results ?? [];
}

async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '7',
    temperature_unit: state.unit,
    wind_speed_unit: isC() ? 'kmh' : 'mph',
    precipitation_unit: isC() ? 'mm' : 'inch',
  });
  return getJSON(`${FORECAST_URL}?${params}`);
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function showStatus(message, isError = false, spinner = false) {
  els.content.hidden = true;
  els.status.hidden = false;
  els.status.classList.toggle('error', isError);
  els.status.innerHTML = (spinner ? '<div class="spinner"></div>' : '') + message;
}

function render(place, data) {
  const c = data.current;

  els.place.textContent = placeLabel(place);
  els.localtime.textContent = `Local time ${fmtClock(parseLocal(c.time))} · ${data.timezone_abbreviation}`;
  els.icon.innerHTML = iconFor(c.weather_code, c.is_day);
  setWeatherBackground(c.weather_code, c.is_day);

  els.temp.textContent = `${round(c.temperature_2m)}${degUnit()}`;
  els.condition.textContent = describe(c.weather_code);
  els.feels.textContent = `Feels like ${deg(c.apparent_temperature)}`;

  els.humidity.textContent = `${round(c.relative_humidity_2m)}%`;
  els.wind.textContent     = `${round(c.wind_speed_10m)} ${windUnit()} ${compass(c.wind_direction_10m)}`;
  els.precip.textContent   = `${c.precipitation ?? 0} ${rainUnit()}`;
  els.pressure.textContent = `${round(c.surface_pressure)} hPa`;
  els.sunrise.textContent  = fmtClock(parseLocal(data.daily.sunrise[0]));
  els.sunset.textContent   = fmtClock(parseLocal(data.daily.sunset[0]));

  renderHourly(data);
  renderDaily(data);

  els.status.hidden = true;
  els.content.hidden = false;
}

function renderHourly(data) {
  const h = data.hourly;
  const now = parseLocal(data.current.time);
  let start = h.time.findIndex((t) => parseLocal(t) >= now) - 1;
  if (start < 0) start = 0;

  const slice = h.time.slice(start, start + 24);
  els.hourly.innerHTML = slice.map((t, i) => {
    const idx = start + i;
    const d = parseLocal(t);
    const pop = h.precipitation_probability?.[idx] ?? 0;
    return `
      <li class="${i === 0 ? 'now' : ''}">
        <div class="h-time">${i === 0 ? 'Now' : fmtHour(d)}</div>
        ${iconFor(h.weather_code[idx], h.is_day[idx])}
        <div class="h-temp">${deg(h.temperature_2m[idx])}</div>
        <div class="h-pop">${pop >= 10 ? pop + '%' : ''}</div>
      </li>`;
  }).join('');
}

function renderDaily(data) {
  const d = data.daily;
  const lo = Math.min(...d.temperature_2m_min);
  const hi = Math.max(...d.temperature_2m_max);
  const span = Math.max(hi - lo, 1);

  els.daily.innerHTML = d.time.map((t, i) => {
    const date = parseLocal(t);
    const left  = ((d.temperature_2m_min[i] - lo) / span) * 100;
    const width = ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span) * 100;
    return `
      <li>
        <div class="d-day">${i === 0 ? 'Today' : fmtDayName(date)}<small>${fmtDayDate(date)}</small></div>
        ${iconFor(d.weather_code[i], 1)}
        <div class="d-bar"><span style="left:${left.toFixed(1)}%;width:${Math.max(width, 4).toFixed(1)}%"></span></div>
        <div class="d-temps">${deg(d.temperature_2m_max[i])}<span class="lo">${deg(d.temperature_2m_min[i])}</span></div>
      </li>`;
  }).join('');
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

async function loadPlace(place) {
  state.place = place;
  localStorage.setItem('skycast.place', JSON.stringify(place));
  showStatus(`Loading weather for ${placeLabel(place)}…`, false, true);
  try {
    const data = await fetchForecast(place.latitude, place.longitude);
    render(place, data);
  } catch (err) {
    showStatus(`Couldn't load the forecast. ${err.message}`, true);
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    showStatus('Your browser does not support location lookup. Try searching for a city.', true);
    return;
  }
  showStatus('Finding your location…', false, true);
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const place = {
        name: 'My location',
        latitude: coords.latitude,
        longitude: coords.longitude,
      };
      // Nice-to-have: turn the coordinates into a place name. Optional — ignore failures.
      try {
        const r = await getJSON(`${REVERSE_URL}?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=en`);
        if (r.city || r.locality) {
          place.name = r.city || r.locality;
          place.admin1 = r.principalSubdivision;
          place.country = r.countryName;
        }
      } catch { /* keep the generic label */ }
      loadPlace(place);
    },
    (err) => showStatus(`Location unavailable (${err.message}). Try searching for a city instead.`, true),
    { timeout: 10000, maximumAge: 300000 }
  );
}

/* ------------------------------------------------------------------ *
 * Search suggestions
 * ------------------------------------------------------------------ */

function closeSuggestions() {
  els.sugList.hidden = true;
  els.sugList.innerHTML = '';
  els.input.setAttribute('aria-expanded', 'false');
  state.suggestions = [];
  state.activeSug = -1;
}

function showSuggestions(results) {
  state.suggestions = results;
  state.activeSug = -1;

  if (!results.length) {
    els.sugList.innerHTML = '<li aria-disabled="true"><span class="sug-name">No matches</span></li>';
  } else {
    els.sugList.innerHTML = results.map((r, i) => `
      <li role="option" data-index="${i}">
        <span class="sug-name">${r.name}</span>
        <span class="sug-region">${[r.admin1, r.country].filter(Boolean).join(', ')}</span>
      </li>`).join('');
  }
  els.sugList.hidden = false;
  els.input.setAttribute('aria-expanded', 'true');
}

function highlight(index) {
  const items = [...els.sugList.querySelectorAll('li[data-index]')];
  if (!items.length) return;
  state.activeSug = (index + items.length) % items.length;
  items.forEach((li, i) => li.setAttribute('aria-selected', i === state.activeSug));
  items[state.activeSug].scrollIntoView({ block: 'nearest' });
}

function choose(index) {
  const r = state.suggestions[index];
  if (!r) return;
  els.input.value = r.name;
  closeSuggestions();
  loadPlace(r);
}

let searchTimer;
els.input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = els.input.value.trim();
  if (q.length < 2) return closeSuggestions();
  searchTimer = setTimeout(async () => {
    try {
      showSuggestions(await geocode(q));
    } catch {
      closeSuggestions();
    }
  }, 300);
});

els.input.addEventListener('keydown', (e) => {
  if (els.sugList.hidden) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); highlight(state.activeSug + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(state.activeSug - 1); }
  else if (e.key === 'Escape') closeSuggestions();
  else if (e.key === 'Enter' && state.activeSug >= 0) { e.preventDefault(); choose(state.activeSug); }
});

els.sugList.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-index]');
  if (li) choose(Number(li.dataset.index));
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) closeSuggestions();
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = els.input.value.trim();
  if (!q) return;
  closeSuggestions();
  showStatus('Searching…', false, true);
  try {
    const results = await geocode(q);
    if (!results.length) return showStatus(`No place found for “${q}”. Check the spelling and try again.`, true);
    loadPlace(results[0]);
  } catch (err) {
    showStatus(`Search failed. ${err.message}`, true);
  }
});

els.locate.addEventListener('click', useMyLocation);

/* ------------------------------------------------------------------ *
 * Unit toggle
 * ------------------------------------------------------------------ */

els.units.forEach((btn) => {
  btn.classList.toggle('active', btn.dataset.unit === state.unit);
  btn.addEventListener('click', () => {
    if (btn.dataset.unit === state.unit) return;
    state.unit = btn.dataset.unit;
    localStorage.setItem('skycast.unit', state.unit);
    els.units.forEach((b) => b.classList.toggle('active', b.dataset.unit === state.unit));
    if (state.place) loadPlace(state.place);
  });
});

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

(async function init() {
  const saved = localStorage.getItem('skycast.place');
  if (saved) {
    try { return loadPlace(JSON.parse(saved)); } catch { /* fall through */ }
  }

  // Only auto-locate if the user already granted permission — never prompt on first paint.
  try {
    const perm = await navigator.permissions?.query({ name: 'geolocation' });
    if (perm?.state === 'granted') return useMyLocation();
  } catch { /* Permissions API unavailable */ }

  loadPlace({ name: 'London', admin1: 'England', country: 'United Kingdom', latitude: 51.5085, longitude: -0.1257 });
})();
