// Filee web page. The desktop app's flow in a browser: bring files (drag, pick, paste, share, link), choose a format
// on the donut (front/back faces, groups, greyed-out slices with their reason), follow the progress ring and download.
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('filee.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('filee.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ───────────────────────── texts ─────────────────────────
// Page texts in French and English; preset names, reasons and errors come from the server in every app language.
const UI = {
  fr: {
    'nav.home': 'Accueil', 'nav.presets': 'Préréglages', 'nav.engines': 'Moteurs', 'nav.settings': 'Réglages',
    'home.drop_title': 'Déposez des fichiers ici', 'home.pick': 'Choisir des fichiers', 'home.url': 'Depuis un lien', 'home.url_go': 'Convertir',
    'web.drop_hint': "Le donut s'ouvre sous votre curseur : lâchez le fichier sur un format. Sur mobile, touchez pour choisir. Vous pouvez aussi coller (Ctrl+V).",
    'home.recent': 'Conversions récentes', 'home.clear_history': 'Effacer', 'home.recent_empty': 'Vos fichiers convertis apparaîtront ici.',
    'web.drop_hint': "Le donut s'ouvre sous votre curseur : lâchez le fichier sur un format. Sur mobile, touchez pour choisir. Vous pouvez aussi coller (Ctrl+V).",
    'home.no_matches': 'Aucune conversion ne correspond.', 'home.expired': 'expiré', 'home.files': '{0} fichiers', 'home.failed_files': '{0} en échec',
    'common.search': 'Rechercher', 'common.close': 'Fermer', 'common.cancel': 'Annuler', 'common.ok': 'OK', 'common.reset': 'Réinitialiser',
    'common.delete': 'Supprimer', 'common.save': 'Enregistrer', 'common.edit': 'Modifier', 'common.download': 'Télécharger', 'common.share': 'Partager',
    'donut.options': 'Options', 'donut.other': 'Autre format…', 'donut.back': '← Retour', 'donut.flip': '↻ Retourner', 'donut.drop_here': 'Lâchez sur un format',
    'options.title': 'Options de conversion', 'options.quality': 'Qualité', 'options.quality_override': 'Remplacer la qualité du préréglage',
    'options.resize': 'Taille', 'options.resize_none': 'Inchangée', 'options.rotate': 'Rotation', 'options.flip': 'Miroir',
    'options.merge': 'PDF : fusionner en un seul fichier', 'options.pages': 'Pages (PDF)', 'options.active': 'Options ({0})',
    'presets.mine': 'Mes préréglages', 'presets.new': 'Nouveau', 'presets.import': 'Importer', 'presets.export': 'Exporter',
    'presets.mine_hint': "Gardés dans ce navigateur. Épinglez-les sur le donut d'un type de fichier.", 'presets.library': 'Bibliothèque',
    'presets.edit': 'Préréglage', 'presets.name': 'Nom', 'presets.target': 'Format', 'presets.pin': 'Épingler sur le donut',
    'presets.pin_none': 'Aucun (seulement « Autre format »)', 'presets.pattern': 'Nom des fichiers', 'presets.none': 'Aucun préréglage pour le moment.',
    'presets.imported': '{0} préréglage(s) importé(s)', 'presets.back': 'verso',
    'engines.hint': 'Les moteurs installés sur le serveur. Les conversions passent par le chemin le moins coûteux (3 étapes au plus).',
    'engines.formats': 'Formats', 'engines.read_only': 'lecture seule',
    'settings.language': 'Langue', 'settings.theme': 'Thème', 'settings.theme_auto': 'Automatique', 'settings.theme_light': 'Clair', 'settings.theme_dark': 'Sombre',
    'settings.autodownload': 'Télécharger automatiquement le résultat', 'settings.zip': 'Plusieurs résultats : un seul ZIP',
    'job.uploading': 'Envoi… {0}', 'job.queued': 'En attente', 'job.converting': 'Conversion…', 'job.downloading': 'Téléchargement du lien…',
    'job.zip': 'Tout (ZIP)', 'job.details': 'Détails', 'job.done': 'Terminé', 'job.failed': 'Échec', 'job.n_results': '{0} résultat(s)',
    'job.upload_failed': "L'envoi a échoué", 'job.too_large': 'Fichiers trop volumineux (max {0})', 'job.kept': 'Gardé {0} min sur le serveur',
    'crop.free': 'Libre', 'crop.not_image': "Ce fichier ne s'ouvre pas dans le navigateur",
    'about': 'Filee {0} · conversions sur le serveur, fichiers supprimés après {1} min · ',
  },
  en: {
    'nav.home': 'Home', 'nav.presets': 'Presets', 'nav.engines': 'Engines', 'nav.settings': 'Settings',
    'home.drop_title': 'Drop files here', 'home.pick': 'Choose files', 'home.url': 'From a link', 'home.url_go': 'Convert',
    'web.drop_hint': 'The donut opens at your cursor: drop the file on a format. On a phone, tap to choose. You can also paste (Ctrl+V).',
    'home.recent': 'Recent conversions', 'home.clear_history': 'Clear', 'home.recent_empty': 'Your converted files will show up here.',
    'web.drop_hint': 'The donut opens at your cursor: drop the file on a format. On a phone, tap to choose. You can also paste (Ctrl+V).',
    'home.no_matches': 'No recent conversion matches the search.', 'home.expired': 'expired', 'home.files': '{0} files', 'home.failed_files': '{0} failed',
    'common.search': 'Search', 'common.close': 'Close', 'common.cancel': 'Cancel', 'common.ok': 'OK', 'common.reset': 'Reset',
    'common.delete': 'Delete', 'common.save': 'Save', 'common.edit': 'Edit', 'common.download': 'Download', 'common.share': 'Share',
    'donut.options': 'Options', 'donut.other': 'Other format…', 'donut.back': '← Back', 'donut.flip': '↻ Flip', 'donut.drop_here': 'Drop on a format',
    'options.title': 'Conversion options', 'options.quality': 'Quality', 'options.quality_override': "Override the preset's quality",
    'options.resize': 'Size', 'options.resize_none': 'Unchanged', 'options.rotate': 'Rotate', 'options.flip': 'Mirror',
    'options.merge': 'PDF: merge into one file', 'options.pages': 'Pages (PDF)', 'options.active': 'Options ({0})',
    'presets.mine': 'My presets', 'presets.new': 'New', 'presets.import': 'Import', 'presets.export': 'Export',
    'presets.mine_hint': "Kept in this browser. Pin them on a file type's donut.", 'presets.library': 'Library',
    'presets.edit': 'Preset', 'presets.name': 'Name', 'presets.target': 'Format', 'presets.pin': 'Pin on the donut',
    'presets.pin_none': 'None (only "Other format")', 'presets.pattern': 'File names', 'presets.none': 'No presets yet.',
    'presets.imported': '{0} preset(s) imported', 'presets.back': 'back',
    'engines.hint': 'Engines installed on the server. Conversions take the cheapest route (3 steps at most).',
    'engines.formats': 'Formats', 'engines.read_only': 'read only',
    'settings.language': 'Language', 'settings.theme': 'Theme', 'settings.theme_auto': 'Automatic', 'settings.theme_light': 'Light', 'settings.theme_dark': 'Dark',
    'settings.autodownload': 'Download the result automatically', 'settings.zip': 'Several results: one ZIP',
    'job.uploading': 'Uploading… {0}', 'job.queued': 'Queued', 'job.converting': 'Converting…', 'job.downloading': 'Downloading the link…',
    'job.zip': 'All (ZIP)', 'job.details': 'Details', 'job.done': 'Done', 'job.failed': 'Failed', 'job.n_results': '{0} result(s)',
    'job.upload_failed': 'Upload failed', 'job.too_large': 'Files too large (max {0})', 'job.kept': 'Kept {0} min on the server',
    'crop.free': 'Free', 'crop.not_image': "This file doesn't open in the browser",
    'about': 'Filee {0} · converted on the server, files deleted after {1} min · ',
  },
};
const state = {
  lang: store.get('lang', (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : (navigator.language || 'en')),
  info: null, formats: [], profiles: [], library: [],
  custom: store.get('presets', []), history: store.get('history', []),
  options: {}, files: [], urls: [],
};
let serverTexts = {};
const t = (key, ...args) => {
  const lang = state.lang.split('-')[0];
  let s = (UI[lang] || {})[key] ?? serverTexts[key] ?? UI.en[key] ?? key;
  args.forEach((a, i) => { s = s.replaceAll(`{${i}}`, a); });
  return s;
};
function translatePage() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang.startsWith('ar') ? 'rtl' : 'ltr';
  $$('[data-t]').forEach(el => { const s = t(el.dataset.t); if (s !== el.dataset.t) el.textContent = s; });
  $$('[data-tp]').forEach(el => { el.placeholder = t(el.dataset.tp); });
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const size = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`;
const ext = name => { const m = /\.([^./\\]+(\.(gz|bz2|xz|zst))?)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; };

let toastTimer;
function toast(text, ms = 3200) {
  const el = $('#toast');
  el.textContent = text; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

async function api(path, init) {
  const r = await fetch('/api' + path, init);
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j.error) msg = j.error; } catch { /* not json */ }
    throw new Error(msg);
  }
  return r.status === 204 ? null : r.json();
}

// ───────────────────────── theme & pages ─────────────────────────
function applyTheme() {
  const pref = store.get('theme', 'auto');
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name=theme-color]').content = dark ? '#161614' : '#534AB7';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

function showPage() {
  const page = (location.hash || '#home').slice(1).split('?')[0];
  const known = ['home', 'presets', 'engines', 'settings'].includes(page) ? page : 'home';
  $$('.page').forEach(p => { p.hidden = p.id !== 'page-' + known; });
  $$('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.page === known));
  if (known === 'presets') renderPresets();
  if (known === 'engines') renderEngines();
}
addEventListener('hashchange', showPage);

// ───────────────────────── files in ─────────────────────────
function bring(files, point) {
  files = [...files].filter(f => f && f.size !== undefined);
  if (!files.length) return;
  state.files = files; state.urls = [];
  openDonut(files.map(f => f.name), point, false);
}

$('#pick-files').addEventListener('click', e => { e.stopPropagation(); $('#file-input').click(); });
$('#dropzone').addEventListener('click', () => $('#file-input').click());
$('#dropzone').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file-input').click(); } });
$('#file-input').addEventListener('change', e => { bring(e.target.files, null); e.target.value = ''; });
$('#open-url').addEventListener('click', e => {
  e.stopPropagation();
  const form = $('#url-form'); form.hidden = !form.hidden; if (!form.hidden) $('#url-input').focus();
});
$('#url-form').addEventListener('submit', e => {
  e.preventDefault();
  const url = $('#url-input').value.trim();
  if (!url) return;
  state.files = []; state.urls = [url];
  let name = 'download';
  try { name = decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'download'; } catch { /* keep */ }
  openDonut(ext(name) ? [name] : [], null, !ext(name));
});
addEventListener('paste', e => {
  if (e.target.closest('input, textarea')) return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); bring(files, null); return; }
  const text = e.clipboardData?.getData('text')?.trim();
  if (text && /^https?:\/\//i.test(text) && state.info?.allowUrls) {
    $('#url-form').hidden = false; $('#url-input').value = text; $('#url-form').requestSubmit();
  }
});

// Dragging files over the page opens the donut at the cursor, as holding the key does in the desktop app. While
// dragging, the browser only tells the files' MIME types, so the donut is a guess; dropping on a slice converts,
// dropping anywhere else opens the exact donut for the dropped files.
const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif',
  'image/avif': 'avif', 'image/bmp': 'bmp', 'image/tiff': 'tiff', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/jxl': 'jxl',
  'application/pdf': 'pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx', 'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.oasis.opendocument.text': 'odt', 'application/rtf': 'rtf', 'text/plain': 'txt', 'text/markdown': 'md', 'text/html': 'html',
  'text/csv': 'csv', 'application/json': 'json', 'application/epub+zip': 'epub', 'application/zip': 'zip', 'application/x-7z-compressed': '7z',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-matroska': 'mkv', 'video/x-msvideo': 'avi',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'font/ttf': 'ttf', 'font/otf': 'otf', 'font/woff': 'woff', 'font/woff2': 'woff2',
};
let dragDepth = 0, dragGuess = false;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (dragDepth++ > 0 || !$('#donut-layer').hidden) return;
  const items = [...(e.dataTransfer.items || [])].filter(i => i.kind === 'file');
  const guessed = items.map((i, n) => MIME_EXT[i.type] ? `file${n}.${MIME_EXT[i.type]}` : null);
  const known = guessed.filter(Boolean);
  dragGuess = true;
  openDonut(known.length === items.length && known.length ? known : [], { x: e.clientX, y: e.clientY }, true);
});
addEventListener('dragover', e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  const slice = e.target.closest?.('.slice');
  $$('.slice.hot').forEach(s => { if (s !== slice) s.classList.remove('hot'); });
  if (slice) { slice.classList.add('hot'); showTip(slice); }
});
addEventListener('dragleave', e => {
  if (!hasFiles(e)) return;
  if (--dragDepth <= 0) { dragDepth = 0; if (dragGuess) setTimeout(() => { if (dragDepth === 0 && dragGuess) closeDonut(); }, 60); }
});
addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  const files = [...e.dataTransfer.files];
  if (!files.length) return;
  const slice = e.target.closest?.('.slice');
  const point = { x: e.clientX, y: e.clientY };
  state.files = files; state.urls = [];
  if (slice && !slice.classList.contains('off') && !slice.classList.contains('group')) {
    dragGuess = false;
    const preset = donut.byId[slice.dataset.id];
    closeDonut();
    choose(preset);
    return;
  }
  dragGuess = false;
  openDonut(files.map(f => f.name), point, false);
});

// ───────────────────────── donut ─────────────────────────
const donut = { data: null, face: 'front', group: null, byId: {}, names: [], point: null, guess: false };
const pinned = () => state.custom.filter(p => p.pin);

async function openDonut(names, point, guess) {
  donut.names = names; donut.point = point; donut.guess = guess; donut.face = 'front'; donut.group = null;
  const layer = $('#donut-layer');
  layer.hidden = false;
  placeDonut();
  $('#donut').innerHTML = '';
  $('#donut-tip').textContent = guess ? t('donut.drop_here') : '';
  try {
    donut.data = await api('/donut', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names, lang: state.lang, guess, custom: state.custom.map(toServerPreset) }),
    });
  } catch (err) { toast(err.message); closeDonut(); return; }
  if (layer.hidden) return;
  donut.byId = {};
  const index = s => { donut.byId[s.id] = s; (s.members || []).forEach(index); };
  [...donut.data.front, ...donut.data.back, ...donut.data.custom].forEach(index);
  renderDonut();
}

function placeDonut() {
  const vw = innerWidth, vh = innerHeight;
  const s = Math.round(Math.min(400, vw * 0.94, (vh - 110) * 0.95));
  const wrap = $('#donut-wrap');
  wrap.style.setProperty('--size', s + 'px');
  const p = donut.point && vw > 640 ? donut.point : { x: vw / 2, y: vh / 2 - 30 };
  const left = Math.min(Math.max(p.x - s / 2, 8), vw - s - 8);
  const top = Math.min(Math.max(p.y - s / 2, 8), vh - s - 100);
  wrap.style.left = left + 'px'; wrap.style.top = Math.max(top, 8) + 'px';
}
addEventListener('resize', () => { if (!$('#donut-layer').hidden) placeDonut(); });

function closeDonut() {
  $('#donut-layer').hidden = true;
  donut.data = null; dragGuess = false;
}

function currentSlices() {
  const d = donut.data;
  if (donut.group) return donut.group.members || [];
  const profileId = d.profile?.id;
  const mine = d.custom.filter(c => state.custom.find(p => p.id === c.id)?.pin === profileId);
  const face = donut.face === 'back' ? d.back : [...d.front, ...mine];
  return face.slice(0, 12 + mine.length).slice(0, 16);
}

const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
function arc(r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(r1, a0), [x1, y1] = polar(r1, a1), [x2, y2] = polar(r0, a1), [x3, y3] = polar(r0, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)} Z`;
}

function renderDonut() {
  const d = donut.data;
  const svg = $('#donut');
  const slices = currentSlices();
  const n = Math.max(slices.length, 1);
  const r0 = 64, r1 = 172, gap = n > 1 ? 0.012 : 0;
  const custom = new Set(d.custom.map(c => c.id));
  let html = '';
  slices.forEach((s, i) => {
    const a0 = -Math.PI / 2 + (i / n) * 2 * Math.PI + gap, a1 = -Math.PI / 2 + ((i + 1) / n) * 2 * Math.PI - gap;
    const mid = (a0 + a1) / 2, [lx, ly] = polar((r0 + r1) / 2 + 4, mid);
    const label = s.ring.length > 14 && n > 6 ? s.ring.slice(0, 13) + '…' : s.ring;
    const fs = n > 10 ? 11.5 : n > 7 ? 12.5 : 14;
    const sub = s.group ? '◦◦◦' : s.target === '*' ? '' : (s.target || '').toUpperCase() !== s.ring.toUpperCase() ? (s.target || '').toUpperCase() : '';
    const cls = ['slice', s.usable ? '' : 'off', s.group ? 'group' : '', custom.has(s.id) ? 'custom' : ''].join(' ');
    html += `<g class="${cls}" data-id="${esc(s.id)}" role="menuitem" tabindex="0" aria-disabled="${!s.usable}" aria-label="${esc(s.name)}">
      <title>${esc(s.name + (s.reason ? ' · ' + s.reason : s.description ? ' ' + s.description : ''))}</title>
      <path d="${n === 1 ? `M0,-${r1} A${r1},${r1} 0 1 1 -0.01,-${r1} Z M0,-${r0} A${r0},${r0} 0 1 0 0.01,-${r0} Z` : arc(r0, r1, a0, a1)}" fill-rule="evenodd"/>
      <text x="${lx.toFixed(1)}" y="${(ly - (sub ? 6 : 0)).toFixed(1)}" style="font-size:${fs}px">${esc(label)}</text>
      ${sub ? `<text class="sub" x="${lx.toFixed(1)}" y="${(ly + 9).toFixed(1)}">${esc(sub.length > 8 ? sub.slice(0, 8) : sub)}</text>` : ''}
    </g>`;
  });
  const hasBack = !donut.group && d.back.length > 0;
  const center = donut.group ? t('donut.back') : hasBack ? t('donut.flip') : '';
  const caption = donut.group ? donut.group.name : d.caption;
  const sub = donut.group ? '' : (d.profile?.name || '') + (donut.face === 'back' ? ' · ' + t('presets.back') : '');
  html += `<g class="hub ${center ? 'clickable' : ''}" id="hub" ${center ? 'role="button" tabindex="0"' : ''}>
    <circle r="${r0 - 6}"/>
    <text y="${center ? -14 : -6}">${esc(trim(caption, 18))}</text>
    <text class="small" y="${center ? 2 : 10}">${esc(trim(sub, 22))}</text>
    ${center ? `<text class="small" y="22" style="fill:var(--accent)">${esc(center)}</text>` : ''}
  </g>`;
  svg.innerHTML = html;
  const optionsCount = Object.keys(activeOptions()).length;
  $('#donut-options').textContent = optionsCount ? t('options.active', optionsCount) : t('donut.options');
  $('#donut-options').classList.toggle('on', optionsCount > 0);
  $('#donut-other').hidden = !d.targets.length && !donut.guess;
}
const trim = (s, n) => (s || '').length > n ? s.slice(0, n - 1) + '…' : (s || '');

function showTip(el) {
  const s = donut.byId[el.dataset.id];
  if (!s) return;
  $('#donut-tip').textContent = s.usable ? (s.group ? `${s.name} · ${t('donut.pick_in_group')}` : `${s.name} ${s.description || ''}`) : `${s.name} · ${s.reason}`;
}

$('#donut').addEventListener('pointerover', e => { const s = e.target.closest('.slice'); if (s) showTip(s); });
$('#donut').addEventListener('focusin', e => { const s = e.target.closest('.slice'); if (s) showTip(s); });
$('#donut').addEventListener('click', e => {
  const slice = e.target.closest('.slice');
  if (slice) return activate(donut.byId[slice.dataset.id]);
  if (e.target.closest('#hub')) hubAction();
});
$('#donut').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  const slice = e.target.closest('.slice');
  if (slice) activate(donut.byId[slice.dataset.id]); else if (e.target.closest('#hub')) hubAction();
});
function hubAction() {
  if (donut.group) donut.group = null;
  else if (donut.data.back.length) donut.face = donut.face === 'front' ? 'back' : 'front';
  else return;
  renderDonut();
  $('#donut-tip').textContent = '';
}
function activate(s) {
  if (!s) return;
  if (!s.usable) { $('#donut-tip').textContent = `${s.name} · ${s.reason}`; return; }
  if (s.group) { donut.group = s; renderDonut(); $('#donut-tip').textContent = t('donut.pick_in_group'); return; }
  if (donut.guess && !state.files.length && !state.urls.length) return; // still dragging: drop to convert
  closeDonut();
  choose(s);
}
$('#donut-layer').addEventListener('click', e => { if (e.target.id === 'donut-layer') closeDonut(); });
$('#donut-close').addEventListener('click', closeDonut);
addEventListener('keydown', e => {
  if ($('#donut-layer').hidden || $('dialog[open]')) return;
  if (e.key === 'Escape') { if (donut.group) { donut.group = null; renderDonut(); } else closeDonut(); }
  if (e.key === 'Tab' && !e.shiftKey && donut.data?.back.length && !donut.group && document.activeElement?.closest?.('#donut') == null) {
    e.preventDefault(); hubAction();
  }
});

// "Other format…": every format the files convert to.
$('#donut-other').addEventListener('click', () => {
  const dlg = $('#targets-dialog');
  const all = donut.data.targets.length ? donut.data.targets : state.formats.filter(f => f.writable).map(f => ({ id: f.id, name: f.name, category: f.category }));
  const draw = () => {
    const q = $('#targets-search').value.trim().toLowerCase();
    const groups = {};
    all.filter(f => !q || f.id.includes(q) || f.name.toLowerCase().includes(q)).forEach(f => { (groups[f.category] ||= []).push(f); });
    $('#targets').innerHTML = Object.entries(groups).map(([cat, fs]) =>
      `<div><h4>${esc(cat)}</h4><div class="pills">${fs.map(f => `<button type="button" data-target="${esc(f.id)}">${esc(f.name)}</button>`).join('')}</div></div>`).join('');
  };
  $('#targets-search').value = ''; $('#targets-search').oninput = draw; draw();
  $('#targets').onclick = e => {
    const b = e.target.closest('[data-target]'); if (!b) return;
    dlg.close(); closeDonut();
    choose({ id: null, target: b.dataset.target, name: b.textContent, usable: true });
  };
  dlg.showModal();
});

// ───────────────────────── options ─────────────────────────
function activeOptions() {
  const o = {}, s = state.options;
  if (s.qualityOn) o.quality = s.quality;
  if (s.resize?.startsWith('p')) o.resizePercent = +s.resize.slice(1);
  if (s.resize?.startsWith('e')) o.longEdge = +s.resize.slice(1);
  if (s.rotation) o.rotation = s.rotation;
  if (s.flip) o.flip = s.flip;
  if (s.gray) o.grayscale = true;
  if (s.merge) o.mergePdf = true;
  if (s.pages) o.pageRange = s.pages;
  if (s.zip ?? store.get('zip', false)) o.zip = true;
  return o;
}
$('#donut-options').addEventListener('click', () => {
  const s = state.options;
  $('#opt-quality').value = s.quality ?? 90; $('#opt-quality-out').textContent = $('#opt-quality').value;
  $('#opt-quality-on').checked = !!s.qualityOn; $('#opt-resize').value = s.resize || ''; $('#opt-rotation').value = s.rotation || '';
  $('#opt-flip').value = s.flip || ''; $('#opt-gray').checked = !!s.gray; $('#opt-merge').checked = !!s.merge; $('#opt-pages').value = s.pages || '';
  $('#opt-zip').checked = s.zip ?? store.get('zip', false);
  $('#options-dialog').showModal();
});
$('#opt-quality').addEventListener('input', e => { $('#opt-quality-out').textContent = e.target.value; $('#opt-quality-on').checked = true; });
$('#opt-reset').addEventListener('click', () => { state.options = {}; $('#options-dialog').close(); if (donut.data) renderDonut(); });
$('#options-dialog').addEventListener('close', () => {
  if ($('#options-dialog').returnValue !== 'ok') return;
  state.options = {
    quality: +$('#opt-quality').value, qualityOn: $('#opt-quality-on').checked, resize: $('#opt-resize').value, rotation: $('#opt-rotation').value,
    flip: $('#opt-flip').value, gray: $('#opt-gray').checked, merge: $('#opt-merge').checked, pages: $('#opt-pages').value.trim(), zip: $('#opt-zip').checked,
  };
  if (donut.data) renderDonut();
});

// ───────────────────────── converting ─────────────────────────
async function choose(slice) {
  const files = state.files, urls = state.urls;
  if (!files.length && !urls.length) return;
  const custom = state.custom.find(p => p.id === slice.id);
  const tool = slice.tool;
  if (tool) return cropFiles(files);
  let ordered = files;
  const merging = (slice.id === 'merge-pdf' || custom?.merge || (slice.target === 'pdf' && state.options.merge)) && files.length > 1;
  if (merging) {
    ordered = await mergeOrder(files);
    if (!ordered) return;
  }
  const form = new FormData();
  form.append('lang', state.lang);
  if (custom) form.append('preset', JSON.stringify(toServerPreset(custom)));
  else if (slice.id) form.append('presetId', slice.id);
  else form.append('target', slice.target);
  const options = activeOptions();
  if (Object.keys(options).length) form.append('options', JSON.stringify(options));
  ordered.forEach(f => form.append('files', f, f.name));
  urls.forEach(u => form.append('urls', u));
  upload(form, slice.name, ordered.map(f => f.name).concat(urls));
}

function mergeOrder(files) {
  return new Promise(resolve => {
    const list = [...files];
    const dlg = $('#merge-dialog');
    const draw = () => {
      $('#merge-list').innerHTML = list.map((f, i) => `<li><span>${esc(f.name)}</span>
        <button class="btn small ghost" type="button" data-up="${i}" ${i ? '' : 'disabled'} aria-label="↑">↑</button>
        <button class="btn small ghost" type="button" data-down="${i}" ${i < list.length - 1 ? '' : 'disabled'} aria-label="↓">↓</button></li>`).join('');
    };
    $('#merge-list').onclick = e => {
      const up = e.target.closest('[data-up]'), down = e.target.closest('[data-down]');
      const i = +(up?.dataset.up ?? down?.dataset.down ?? -1); if (i < 0) return;
      const j = up ? i - 1 : i + 1; [list[i], list[j]] = [list[j], list[i]]; draw();
    };
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? list : null);
    draw(); dlg.showModal();
  });
}

function upload(form, title, names) {
  const card = jobCard({ id: null, preset: title, names });
  const max = state.info?.maxUploadBytes;
  let total = 0; for (const [, v] of form.entries()) if (v instanceof File) total += v.size;
  if (max && total > max) { card.fail(t('job.too_large', size(max))); return; }
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/jobs');
  xhr.upload.onprogress = e => { if (e.lengthComputable) card.uploading(e.loaded / e.total); };
  xhr.onload = () => {
    let body = null; try { body = JSON.parse(xhr.responseText); } catch { /* empty */ }
    if (xhr.status >= 200 && xhr.status < 300 && body) { card.attach(body); return; }
    card.fail(body?.error || (xhr.status === 413 ? t('job.too_large', size(max || 0)) : `${t('job.upload_failed')} (HTTP ${xhr.status})`));
  };
  xhr.onerror = () => card.fail(t('job.upload_failed'));
  card.onCancel = () => xhr.abort();
  xhr.send(form);
}

// The app's toast window: a progress ring per conversion, then the results.
function jobCard(job) {
  const el = document.createElement('div');
  el.className = 'job';
  const C = 2 * Math.PI * 18;
  el.innerHTML = `<svg class="ring" viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="18"/><circle class="bar" cx="22" cy="22" r="18" stroke-dasharray="${C}" stroke-dashoffset="${C}"/><text x="22" y="22">0%</text></svg>
    <div><div class="t"></div><div class="s"></div></div>
    <button class="btn small ghost x" type="button" aria-label="${esc(t('common.close'))}">✕</button>
    <div class="acts"></div>`;
  $('.t', el).textContent = `${trim(job.names[0] || '', 28)}${job.names.length > 1 ? ` +${job.names.length - 1}` : ''} → ${job.preset}`;
  $('#jobs').prepend(el);
  const set = (p, text, cls) => {
    $('.bar', el).style.strokeDashoffset = C * (1 - Math.max(0, Math.min(1, p)));
    $('text', el).textContent = Math.round(p * 100) + '%';
    const s = $('.s', el); s.textContent = text; s.className = 's' + (cls ? ' ' + cls : '');
  };
  let timer = null, id = null, closed = false;
  const api_ = {
    onCancel: null,
    uploading: p => set(p * 0.3, t('job.uploading', Math.round(p * 100) + '%')),
    fail: msg => { el.classList.add('failed'); set(1, msg, 'err'); $('text', el).textContent = '!'; },
    attach: status => { id = status.id; update(status); poll(); },
  };
  $('.x', el).onclick = async () => {
    closed = true; clearTimeout(timer);
    if (!id) api_.onCancel?.();
    else if (!finished) api(`/jobs/${id}/cancel`, { method: 'POST' }).catch(() => {});
    el.remove();
  };
  let finished = false;
  const poll = async () => {
    if (closed) return;
    try { update(await api(`/jobs/${id}?lang=${encodeURIComponent(state.lang)}`)); }
    catch (err) { api_.fail(err.message); return; }
    if (!finished) timer = setTimeout(poll, 700);
  };
  function update(st) {
    const failed = st.files.filter(f => f.error);
    if (!st.finished) {
      const fetching = st.transfer && st.transfer.bytes >= 0;
      set(0.3 + st.progress * 0.7, st.state === 'Queued' ? t('job.queued') : fetching ? `${t('job.downloading')} ${size(st.transfer.bytes)}` : t('job.converting'));
      return;
    }
    finished = true;
    const ok = st.outputs.length > 0;
    el.classList.add(ok && !failed.length ? 'done' : failed.length && !ok ? 'failed' : 'done');
    const msg = !ok ? (failed[0]?.error || t('toast.failed'))
      : failed.length ? t('toast.done_errors', failed.length, st.files.length)
      : st.files.find(f => f.notice)?.notice || t('job.n_results', st.outputs.length);
    set(1, msg, ok ? '' : 'err');
    $('text', el).textContent = ok ? '✓' : '!';
    const acts = $('.acts', el);
    if (ok) {
      const href = i => `/api/jobs/${st.id}/files/${i}`;
      if (st.outputs.length === 1) acts.innerHTML += `<a class="btn small primary" href="${href(0)}" download>${esc(t('common.download'))}</a>`;
      else acts.innerHTML += `<a class="btn small primary" href="/api/jobs/${st.id}/zip" download>${esc(t('job.zip'))}</a>`;
      if (navigator.canShare) acts.innerHTML += `<button class="btn small" type="button" data-share>${esc(t('common.share'))}</button>`;
      if (store.get('autodownload', false)) {
        const a = document.createElement('a'); a.href = st.outputs.length === 1 ? href(0) : `/api/jobs/${st.id}/zip`; a.download = ''; document.body.append(a); a.click(); a.remove();
      }
      const share = $('[data-share]', acts);
      if (share) share.onclick = () => shareResults(st);
    }
    if (failed.length || st.outputs.length > 1) {
      const details = document.createElement('details');
      details.innerHTML = `<summary>${esc(t('job.details'))}</summary><ul>${
        st.outputs.map(o => `<li><a href="/api/jobs/${st.id}/files/${o.index}" download>${esc(o.name)}</a> <span class="muted">${size(o.size)}</span></li>`).join('')}${
        failed.map(f => `<li class="s err">${esc(f.name)}: ${esc(f.error)}</li>`).join('')}</ul>`;
      el.append(details);
    }
    addHistory(st);
    setTimeout(() => { if (!el.matches(':hover') && !el.querySelector('details[open]') && !closed) el.style.opacity = '.92'; }, 8000);
  }
  return api_;
}

async function shareResults(st) {
  try {
    const files = await Promise.all(st.outputs.slice(0, 10).map(async o => {
      const blob = await (await fetch(`/api/jobs/${st.id}/files/${o.index}`)).blob();
      return new File([blob], o.name, { type: o.type });
    }));
    if (navigator.canShare({ files })) await navigator.share({ files, title: 'Filee' });
  } catch (err) { if (err.name !== 'AbortError') toast(err.message); }
}

// ───────────────────────── history ─────────────────────────
function addHistory(st) {
  state.history = state.history.filter(h => h.id !== st.id);
  state.history.unshift({
    id: st.id, preset: st.preset, target: st.target, at: Date.now(), expires: Date.parse(st.expiresAt),
    sources: st.files.map(f => f.name), failed: st.files.filter(f => f.error).length, outputs: st.outputs,
  });
  state.history = state.history.slice(0, 100);
  store.set('history', state.history);
  renderHistory();
}
function renderHistory() {
  const q = $('#history-search').value.trim().toLowerCase();
  const items = state.history.filter(h => !q || h.preset.toLowerCase().includes(q) || h.sources.some(s => s.toLowerCase().includes(q)) || h.outputs.some(o => o.name.toLowerCase().includes(q)));
  $('#history-empty').hidden = items.length > 0;
  $('#history-empty').textContent = state.history.length ? t('home.no_matches') : t('home.recent_empty');
  const fmt = new Intl.DateTimeFormat(state.lang, { dateStyle: 'short', timeStyle: 'short' });
  $('#history').innerHTML = items.map(h => {
    const expired = Date.now() > h.expires;
    const label = (h.target === '*' ? ext(h.outputs[0]?.name || '') : h.target) || '?';
    const sub = [fmt.format(h.at), h.sources.length > 1 ? t('home.files', h.sources.length) : h.sources[0], h.failed ? t('home.failed_files', h.failed) : '', expired ? t('home.expired') : '']
      .filter(Boolean).join(' · ');
    const files = expired ? '' : `<div class="files">${h.outputs.slice(0, 12).map(o => `<a href="/api/jobs/${h.id}/files/${o.index}" download title="${esc(o.name)}">${esc(o.name)}</a>`).join('')}</div>`;
    const acts = expired || !h.outputs.length ? '' : h.outputs.length > 1
      ? `<a class="btn small" href="/api/jobs/${h.id}/zip" download>ZIP</a>` : `<a class="btn small" href="/api/jobs/${h.id}/files/0" download>${esc(t('common.download'))}</a>`;
    return `<li><span class="badge ${h.outputs.length ? '' : 'err'}">${esc(label.slice(0, 4))}</span>
      <div style="min-width:0"><div class="title">${esc(h.preset)}</div><div class="sub">${esc(sub)}</div></div>
      <div class="acts">${acts}</div>${files}</li>`;
  }).join('');
}
$('#history-search').addEventListener('input', renderHistory);
$('#history-clear').addEventListener('click', () => {
  state.history.forEach(h => { if (Date.now() < h.expires) api(`/jobs/${h.id}`, { method: 'DELETE' }).catch(() => {}); });
  state.history = []; store.set('history', []); renderHistory();
});

// ───────────────────────── crop tool ─────────────────────────
// The donut's crop tool, in the browser: drag the frame, then the cropped picture is converted back to its format.
async function cropFiles(files) {
  for (const file of files) {
    const blob = await cropOne(file);
    if (!blob) continue;
    const fmt = ext(file.name) || 'png';
    const form = new FormData();
    form.append('lang', state.lang);
    form.append('target', fmt === 'jpeg' ? 'jpg' : fmt);
    form.append('options', JSON.stringify({ fileNamePattern: '{name}_cropped', quality: 95 }));
    const base = file.name.replace(/\.[^.]+$/, '');
    form.append('files', blob, `${base}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'}`);
    upload(form, t('preset.crop'), [file.name]);
  }
}
function cropOne(file) {
  return new Promise(resolve => {
    const dlg = $('#crop-dialog'), img = $('#crop-img'), box = $('#crop-box'), stage = $('#crop-stage');
    const url = URL.createObjectURL(file);
    $('#crop-name').textContent = file.name;
    let rect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    const draw = () => {
      Object.assign(box.style, { left: rect.x * 100 + '%', top: rect.y * 100 + '%', width: rect.w * 100 + '%', height: rect.h * 100 + '%' });
      $('#crop-size').textContent = `${Math.round(rect.w * img.naturalWidth)} × ${Math.round(rect.h * img.naturalHeight)} px`;
    };
    const ratio = () => { const r = +$('#crop-ratio').value; return r ? r * img.naturalHeight / img.naturalWidth : 0; };
    $('#crop-ratio').onchange = () => { const r = ratio(); if (r) { rect.h = Math.min(rect.w / r, 1 - rect.y); rect.w = rect.h * r; } draw(); };
    img.onerror = () => { toast(t('crop.not_image')); URL.revokeObjectURL(url); resolve(null); };
    img.onload = () => { draw(); dlg.showModal(); };
    img.src = url;
    let drag = null;
    box.onpointerdown = e => {
      e.preventDefault(); box.setPointerCapture(e.pointerId);
      drag = { h: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, r: { ...rect } };
    };
    box.onpointermove = e => {
      if (!drag) return;
      const b = stage.getBoundingClientRect();
      const dx = (e.clientX - drag.x) / b.width, dy = (e.clientY - drag.y) / b.height, r = { ...drag.r }, min = 0.03;
      if (drag.h === 'move') { r.x = Math.min(Math.max(0, r.x + dx), 1 - r.w); r.y = Math.min(Math.max(0, r.y + dy), 1 - r.h); }
      else {
        if (drag.h.includes('w')) { const nx = Math.min(Math.max(0, r.x + dx), r.x + r.w - min); r.w += r.x - nx; r.x = nx; }
        if (drag.h.includes('e')) r.w = Math.min(Math.max(min, r.w + dx), 1 - r.x);
        if (drag.h.includes('n')) { const ny = Math.min(Math.max(0, r.y + dy), r.y + r.h - min); r.h += r.y - ny; r.y = ny; }
        if (drag.h.includes('s')) r.h = Math.min(Math.max(min, r.h + dy), 1 - r.y);
        const k = ratio(); if (k) { r.h = Math.min(r.w / k, 1 - r.y); r.w = r.h * k; }
      }
      rect = r; draw();
    };
    box.onpointerup = () => { drag = null; };
    dlg.onclose = () => {
      URL.revokeObjectURL(url);
      if (dlg.returnValue !== 'ok') return resolve(null);
      const c = document.createElement('canvas');
      const sx = Math.round(rect.x * img.naturalWidth), sy = Math.round(rect.y * img.naturalHeight);
      c.width = Math.max(1, Math.round(rect.w * img.naturalWidth)); c.height = Math.max(1, Math.round(rect.h * img.naturalHeight));
      c.getContext('2d').drawImage(img, sx, sy, c.width, c.height, 0, 0, c.width, c.height);
      const type = /^image\/(jpeg|webp)$/.test(file.type) ? file.type : 'image/png';
      c.toBlob(b => resolve(b), type, 0.95);
    };
  });
}

// ───────────────────────── presets page ─────────────────────────
const fromChoice = v => v?.startsWith('p') ? { resize: 'Percent', resizePercent: +v.slice(1) } : v?.startsWith('e') ? { resize: 'LongEdge', longEdge: +v.slice(1) } : { resize: 'None' };
// A page preset in the app's JSON shape (the same as Settings → Presets → Export).
function toServerPreset(p) {
  return {
    id: p.id, name: p.name, targetFormat: p.target,
    image: { quality: p.quality ?? 90, grayscale: !!p.grayscale, removeBackground: !!p.removeBackground, rotation: p.rotation || 'None', flip: p.flip || 'None', ...fromChoice(p.resize) },
    pdf: { mergeIntoSingle: !!p.merge },
    output: { fileNamePattern: p.pattern || '{name}', zipResult: !!p.zip },
  };
}
function saveCustom() { store.set('presets', state.custom); }

function renderPresets() {
  const list = $('#custom-presets');
  const profileName = id => state.profiles.find(p => p.id === id)?.name || '';
  list.innerHTML = state.custom.length ? state.custom.map(p => `<li><strong>${esc(p.name)}</strong>
    <span class="muted">→ ${esc((state.formats.find(f => f.id === p.target)?.name) || p.target)}${p.pin ? ' · ' + esc(profileName(p.pin)) : ''}</span>
    <div class="row"><button class="btn small" type="button" data-edit="${esc(p.id)}">${esc(t('common.edit'))}</button></div></li>`).join('')
    : `<li class="muted">${esc(t('presets.none'))}</li>`;
  list.onclick = e => { const b = e.target.closest('[data-edit]'); if (b) editPreset(state.custom.find(p => p.id === b.dataset.edit)); };

  const byId = Object.fromEntries(state.library.map(p => [p.id, p]));
  $('#library').innerHTML = state.profiles.map(pr => {
    const face = (ids, back) => (ids || []).map(id => byId[id]).filter(Boolean)
      .map(p => `<span class="pill ${p.group ? 'group' : ''} ${back ? 'back' : ''}" title="${esc(p.group ? p.members.map(m => byId[m]?.name).filter(Boolean).join(', ') : p.target)}">${esc(p.name)}</span>`).join('');
    return `<div><h3>${esc(pr.name)} <small class="muted">${esc(pr.extensions.slice(0, 12).join(' '))}${pr.extensions.length > 12 ? '…' : ''}</small></h3>
      <div class="pills">${face(pr.presetIds)}${face(pr.backPresetIds, true)}</div></div>`;
  }).join('');
}
function editPreset(p) {
  const dlg = $('#preset-dialog'), f = $('#preset-form');
  const isNew = !p;
  p = p || { id: 'web-' + Math.random().toString(36).slice(2, 10), name: '', target: 'png', quality: 90, pattern: '{name}' };
  f.target.innerHTML = state.formats.filter(x => x.writable).map(x => `<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.category)})</option>`).join('');
  f.profile.innerHTML = `<option value="">${esc(t('presets.pin_none'))}</option>` + state.profiles.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  f.name.value = p.name; f.target.value = p.target; f.profile.value = p.pin || ''; f.quality.value = p.quality ?? 90; f.resize.value = p.resize || '';
  f.rotation.value = p.rotation || 'None'; f.flip.value = p.flip || 'None'; f.pattern.value = p.pattern || '{name}';
  f.grayscale.checked = !!p.grayscale; f.removeBackground.checked = !!p.removeBackground; f.merge.checked = !!p.merge; f.zip.checked = !!p.zip;
  $('#preset-delete').hidden = isNew;
  $('#preset-delete').onclick = () => { state.custom = state.custom.filter(x => x.id !== p.id); saveCustom(); dlg.close('deleted'); renderPresets(); };
  dlg.onclose = () => {
    if (dlg.returnValue !== 'save') return;
    const saved = {
      id: p.id, name: f.name.value.trim() || f.target.value.toUpperCase(), target: f.target.value, pin: f.profile.value || null,
      quality: Math.max(1, Math.min(100, +f.quality.value || 90)), resize: f.resize.value, rotation: f.rotation.value, flip: f.flip.value,
      pattern: f.pattern.value.trim() || '{name}', grayscale: f.grayscale.checked, removeBackground: f.removeBackground.checked, merge: f.merge.checked, zip: f.zip.checked,
    };
    const i = state.custom.findIndex(x => x.id === p.id);
    if (i >= 0) state.custom[i] = saved; else state.custom.push(saved);
    saveCustom(); renderPresets();
  };
  dlg.showModal();
}
$('#preset-new').addEventListener('click', () => editPreset(null));
$('#preset-export').addEventListener('click', () => {
  const bundle = { schemaVersion: 1, presets: state.custom.map(toServerPreset), profiles: [], filee_web: state.custom };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
  a.download = 'filee-presets.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#preset-import').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    // Our own export keeps the page fields; a bundle exported by the desktop app is read from its preset shape.
    const imported = Array.isArray(data.filee_web) ? data.filee_web : (data.presets || []).filter(p => !p.kind || p.kind === 'Convert').map(p => ({
      id: 'web-' + Math.random().toString(36).slice(2, 10), name: p.name || (p.targetFormat || '').toUpperCase(), target: p.targetFormat || 'png',
      quality: p.image?.quality ?? 90, grayscale: !!p.image?.grayscale, removeBackground: !!p.image?.removeBackground,
      rotation: p.image?.rotation || 'None', flip: p.image?.flip || 'None', merge: !!p.pdf?.mergeIntoSingle, zip: !!p.output?.zipResult,
      pattern: p.output?.fileNamePattern || '{name}',
      resize: p.image?.resize === 'Percent' ? 'p' + p.image.resizePercent : p.image?.resize === 'LongEdge' ? 'e' + p.image.longEdge : '',
    }));
    state.custom = state.custom.filter(c => !imported.some(i => i.id === c.id)).concat(imported);
    saveCustom(); renderPresets(); toast(t('presets.imported', imported.length));
  } catch (err) { toast(err.message); }
});

// ───────────────────────── engines page ─────────────────────────
function renderEngines() {
  if (!state.info) return;
  $('#engines').innerHTML = state.info.engines.map(e => `<li><span class="dot ${e.available ? 'ok' : ''}"></span>
    <div><div>${esc(e.name)}</div><div class="muted"><small>${esc(e.available ? (e.version || '') : (serverTexts[e.reason] || e.reason || ''))}</small></div></div></li>`).join('');
  const draw = () => {
    const q = $('#format-search').value.trim().toLowerCase().replace(/^\./, '');
    const groups = {};
    state.formats.filter(f => !q || f.id.includes(q) || f.name.toLowerCase().includes(q) || f.extensions.some(x => x.includes(q)))
      .forEach(f => { (groups[f.category] ||= []).push(f); });
    $('#formats').innerHTML = Object.entries(groups).map(([c, fs]) => `<div><h3>${esc(c)} <small>(${fs.length})</small></h3><div class="pills">${
      fs.map(f => `<span class="pill" title=".${esc(f.extensions.join(' .'))}">${esc(f.name)}${f.writable ? '' : ' · ' + esc(t('engines.read_only'))}</span>`).join('')}</div></div>`).join('');
  };
  $('#format-search').oninput = draw; draw();
}

// ───────────────────────── settings ─────────────────────────
async function setLanguage(lang) {
  state.lang = lang; store.set('lang', lang);
  try { serverTexts = await api('/i18n/' + encodeURIComponent(lang)); } catch { serverTexts = {}; }
  translatePage();
  try {
    [state.library, state.profiles] = await Promise.all([api('/presets?lang=' + encodeURIComponent(lang)), api('/profiles?lang=' + encodeURIComponent(lang))]);
  } catch { /* offline */ }
  renderHistory(); showPage();
  if (state.info) $('#about').innerHTML = esc(t('about', state.info.version, state.info.jobLifetimeMinutes)) + '<a href="https://github.com/KnifeLemon/Filee" target="_blank" rel="noopener">GitHub</a>';
}
$('#set-lang').addEventListener('change', e => setLanguage(e.target.value));
$('#set-theme').addEventListener('change', e => { store.set('theme', e.target.value); applyTheme(); });
$('#set-autodownload').addEventListener('change', e => store.set('autodownload', e.target.checked));
$('#set-zip').addEventListener('change', e => store.set('zip', e.target.checked));

const LANG_NAMES = { en: 'English', fr: 'Français', es: 'Español', ja: '日本語', ko: '한국어', 'zh-CN': '简体中文', pl: 'Polski', hi: 'हिन्दी', ru: 'Русский', ar: 'العربية', 'pt-BR': 'Português (Brasil)' };

// ───────────────────────── start ─────────────────────────
(async function start() {
  applyTheme();
  $('#set-theme').value = store.get('theme', 'auto');
  $('#set-autodownload').checked = store.get('autodownload', false);
  $('#set-zip').checked = store.get('zip', false);
  try {
    [state.info, state.formats] = await Promise.all([api('/info'), api('/formats')]);
  } catch (err) { toast(err.message, 8000); }
  const langs = state.info?.languages || ['en', 'fr'];
  if (!langs.includes(state.lang)) state.lang = langs.find(l => l.split('-')[0] === state.lang.split('-')[0]) || 'en';
  $('#set-lang').innerHTML = langs.map(l => `<option value="${esc(l)}">${esc(LANG_NAMES[l] || l)}</option>`).join('');
  $('#set-lang').value = state.lang;
  $('#open-url').hidden = state.info && !state.info.allowUrls;
  await setLanguage(state.lang);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // Files shared to the installed app (Android share sheet), handed over by the service worker.
  if (new URLSearchParams(location.search).has('share') && 'caches' in window) {
    const cache = await caches.open('filee-share');
    const keys = await cache.keys();
    const files = [];
    for (const k of keys) {
      const r = await cache.match(k);
      files.push(new File([await r.blob()], decodeURIComponent(r.headers.get('x-name') || 'file'), { type: r.headers.get('content-type') || '' }));
      await cache.delete(k);
    }
    history.replaceState(null, '', '/');
    if (files.length) bring(files, null);
  }
})();
