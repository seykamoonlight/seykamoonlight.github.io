// Éditeur de la galerie. Tourne en local uniquement, servi par server.py.
//
// Chaque photo de layout.json est décrite ainsi. Toutes les longueurs sont
// exprimées en LARGEURS DE COLONNE, pour que le placement ne dépende pas de
// la taille de l'écran :
//
//   file      "photos/DSCF9302.JPG"   l'original (jamais publié tel quel)
//   x         centre horizontal : 0 = bord gauche de la colonne, 1 = bord
//             droit ; en dessous de 0 ou au-dessus de 1, la photo déborde
//   y         haut de la photo, depuis le haut de la colonne
//   size      largeur de la photo
//   rotation  inclinaison, en degrés
//   z         rang d'empilement, de 1 (tout dessous) à n (tout dessus)
//   w, h      dimensions de l'original en pixels (seul le ratio sert)

// ── Réglages ────────────────────────────────────────────────────────────────

const COLUMN_W = 420;      // largeur de la colonne (px) — même valeur dans viewer.css
const PANEL_W = 330;       // largeur du panneau du site (px) — même valeur dans viewer.css
const NATURAL_BOX = 210;   // taille « 100 % » : le grand côté de la photo fait 210 px
const DEFAULT_SIZE = 0.65; // largeur utilisée tant que les dimensions sont inconnues
const DRAG_THRESHOLD = 4;  // px à parcourir avant qu'un clic devienne un glissé
const SPACE_STEP = 0.5;    // décalage appliqué par les boutons « espace en haut »

// ── Éléments de la page ─────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const canvas = $('canvas');
const wrapper = $('canvas-wrapper');
const columnGuide = $('column-guide');
const hint = $('hint');
const statusEl = $('status');
const publishBtn = $('publish-btn');
const previewBtn = $('preview-btn');
const publishLog = $('publish-log');

const controls = {
  size: $('size-control'),
  rotation: $('rotation-control'),
  stack: $('stack-control'),
  delete: $('delete-btn'),
};
const sizeSlider = $('size-slider');
const sizeValue = $('size-value');
const rotationSlider = $('rotation-slider');
const rotationValue = $('rotation-value');

// ── État ────────────────────────────────────────────────────────────────────

const photos = [];  // { el, filename, x, y, size, rotation, z, w, h }
let selected = null;
let drag = null;    // glissé en cours : { photo, startX, startY, offX, offY, moved }
let dirty = false;  // modifications non enregistrées

// ── Géométrie ───────────────────────────────────────────────────────────────

// Reproduit la mise en page du site : panneau à gauche, colonne centrée dans
// l'espace qui reste. Ainsi ce qu'on place ici tombe au même endroit en ligne.
function columnLeft() {
  const available = canvas.offsetWidth - PANEL_W;
  return PANEL_W + Math.max(0, (available - COLUMN_W) / 2);
}

function updateGuide() {
  columnGuide.style.left = columnLeft() + 'px';
  columnGuide.style.width = COLUMN_W + 'px';
}

// Largeur « 100 % » d'une photo, en largeurs de colonne.
function naturalSize(photo) {
  if (!photo.w || !photo.h) return DEFAULT_SIZE;
  return NATURAL_BOX * Math.min(1, photo.w / photo.h) / COLUMN_W;
}

function photoHeight(photo) {
  const ratio = (photo.w && photo.h) ? photo.w / photo.h : 4 / 3;
  return (photo.size ?? DEFAULT_SIZE) / ratio;
}

function positionPhoto(photo) {
  const width = (photo.size ?? DEFAULT_SIZE) * COLUMN_W;
  const centerX = columnLeft() + photo.x * COLUMN_W;
  photo.el.style.left = (centerX - width / 2) + 'px';
  photo.el.style.top = (photo.y * COLUMN_W) + 'px';
  photo.el.style.width = width + 'px';
}

function applyRotation(photo) {
  photo.el.style.transform = `rotate(${photo.rotation}deg)`;
}

function ensureCanvasHeight() {
  let minHeight = wrapper.offsetHeight + 200;
  for (const p of photos) {
    const height = p.el.offsetHeight || photoHeight(p) * COLUMN_W;
    minHeight = Math.max(minHeight, p.y * COLUMN_W + height + 200);
  }
  canvas.style.minHeight = minHeight + 'px';
}

// ── Création d'une photo à l'écran ──────────────────────────────────────────

// L'éditeur affiche les vignettes, jamais les originaux : charger des
// centaines de Mo de JPEG pleine résolution rendrait l'édition impraticable.
function thumbUrl(filename) {
  return 'photos/thumbs/' + filename.replace(/\.[^.]+$/, '') + '.jpg';
}

function addPhoto({ filename, url, x, y, size = null, rotation = 0, z, w = null, h = null }) {
  hint.classList.add('hidden');

  const el = document.createElement('div');
  el.className = 'photo';
  const frame = document.createElement('div');
  frame.className = 'frame';
  const img = document.createElement('img');
  img.draggable = false;
  frame.appendChild(img);
  el.appendChild(frame);
  canvas.appendChild(el);

  const photo = { el, filename, x, y, size, rotation, z, w, h };
  photos.push(photo);

  img.addEventListener('load', () => {
    // On ne connaît les dimensions qu'au chargement pour une photo neuve.
    // Pour les autres, on garde celles de l'original enregistrées dans le
    // layout : la vignette, elle, ne fait que 900 px.
    if (!photo.w || !photo.h) {
      photo.w = img.naturalWidth;
      photo.h = img.naturalHeight;
    }
    if (photo.size === null) photo.size = naturalSize(photo);
    positionPhoto(photo);
    if (photo === selected) updateSizeSlider();
    ensureCanvasHeight();
  });
  img.src = url;

  positionPhoto(photo);
  applyRotation(photo);
  applyZ(photo);
  bindDrag(photo);
  el.addEventListener('click', e => {
    e.stopPropagation();
    select(photo);
  });

  return photo;
}

function removePhoto(photo) {
  if (photo === selected) deselect();
  photos.splice(photos.indexOf(photo), 1);
  photo.el.remove();
  if (!photos.length) hint.classList.remove('hidden');
}

// ── Sélection et réglages ───────────────────────────────────────────────────

function showControls(visible) {
  for (const c of Object.values(controls)) c.classList.toggle('visible', visible);
}

function select(photo) {
  selected?.el.classList.remove('selected');
  selected = photo;
  photo.el.classList.add('selected');

  rotationSlider.value = photo.rotation;
  rotationValue.textContent = photo.rotation + '°';
  updateSizeSlider();
  showControls(true);
}

function deselect() {
  selected?.el.classList.remove('selected');
  selected = null;
  showControls(false);
}

// Le curseur de taille est relatif à la taille « 100 % » de la photo.
function updateSizeSlider() {
  if (!selected) return;
  const multiplier = (selected.size ?? DEFAULT_SIZE) / naturalSize(selected);
  sizeSlider.value = multiplier;
  sizeValue.textContent = Math.round(multiplier * 100) + '%';
}

function onSizeChange() {
  if (!selected) return;
  const multiplier = parseFloat(sizeSlider.value);
  selected.size = naturalSize(selected) * multiplier;
  sizeValue.textContent = Math.round(multiplier * 100) + '%';
  positionPhoto(selected);
  ensureCanvasHeight();
  markDirty();
}

function onRotationChange() {
  if (!selected) return;
  selected.rotation = parseFloat(rotationSlider.value);
  rotationValue.textContent = selected.rotation + '°';
  applyRotation(selected);
  markDirty();
}

// ── Empilement ──────────────────────────────────────────────────────────────
//
// Ce qui recouvre quoi est une intention : le rang est enregistré dans le
// layout, et l'éditeur l'affiche tel qu'il sera en ligne — une photo
// sélectionnée ou en cours de glissé ne passe PAS au-dessus des autres, pour
// qu'on voie exactement quelle partie en est cachée pendant qu'on la règle.

function applyZ(photo) {
  photo.el.style.zIndex = photo.z;
}

// Renumérote de 1 à n en conservant l'ordre. Jamais de valeur ≤ 0 : #canvas
// a un fond opaque, et un z-index négatif peindrait la photo DERRIÈRE ce
// fond, où elle deviendrait invisible.
function normalizeZ() {
  [...photos].sort((a, b) => a.z - b.z).forEach((p, i) => { p.z = i + 1; });
  photos.forEach(applyZ);
}

function bringToFront() {
  if (!selected) return;
  selected.z = Infinity;
  normalizeZ();
  markDirty();
}

function sendToBack() {
  if (!selected) return;
  selected.z = -Infinity;
  normalizeZ();
  markDirty();
}

// ── Glisser-déposer d'une photo ─────────────────────────────────────────────

function bindDrag(photo) {
  const el = photo.el;

  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    // Point de prise mesuré depuis la position NON tournée de la photo
    // (style.left/top). Le rectangle englobant d'une photo inclinée est plus
    // grand qu'elle : s'en servir la ferait sauter de quelques pixels dès
    // le début du glissé.
    const canvasRect = canvas.getBoundingClientRect();
    drag = {
      photo,
      startX: e.clientX, startY: e.clientY,
      offX: e.clientX - canvasRect.left - parseFloat(el.style.left),
      offY: e.clientY - canvasRect.top - parseFloat(el.style.top),
      moved: false,
    };
  });

  el.addEventListener('pointermove', e => {
    if (drag?.photo !== photo) return;
    // Un simple clic ne doit rien déplacer : sans ce seuil, le moindre
    // frémissement de la souris décalerait la photo à chaque sélection.
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
    }
    const canvasRect = canvas.getBoundingClientRect();
    el.style.left = (e.clientX - canvasRect.left - drag.offX) + 'px';
    el.style.top = (e.clientY - canvasRect.top - drag.offY) + 'px';
  });

  const endDrag = () => {
    if (drag?.photo !== photo) return;
    const moved = drag.moved;
    drag = null;
    if (!moved) return; // c'était un clic : la position ne change pas

    const width = (photo.size ?? DEFAULT_SIZE) * COLUMN_W;
    photo.x = (parseFloat(el.style.left) + width / 2 - columnLeft()) / COLUMN_W;
    photo.y = parseFloat(el.style.top) / COLUMN_W;
    ensureCanvasHeight();
    markDirty();
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag); // sinon la photo reste collée au curseur
}

// ── Espace en haut de la colonne ────────────────────────────────────────────

function addSpaceTop() {
  shiftAll(SPACE_STEP);
}

function removeSpaceTop() {
  // On ne remonte jamais plus que la photo la plus haute ne le permet :
  // sinon les photos du haut seraient tassées à 0 et le placement déformé.
  const top = Math.min(...photos.map(p => p.y));
  shiftAll(-Math.min(SPACE_STEP, top));
}

function shiftAll(dy) {
  if (!dy) return;
  for (const p of photos) {
    p.y += dy;
    positionPhoto(p);
  }
  ensureCanvasHeight();
  markDirty();
}

// ── Ajout de photos ─────────────────────────────────────────────────────────

// Pré-placement : les nouvelles photos arrivent sous la pile existante et
// réparties en largeur (suite du nombre d'or), au lieu de s'empiler toutes
// au même endroit. Ce n'est qu'un point de départ, à ajuster à la main.
function nextPosition() {
  const bottom = photos.length ? Math.max(...photos.map(p => p.y + photoHeight(p))) : 0.15;
  return {
    x: -0.2 + ((photos.length * 0.6180339887) % 1) * 1.4,
    y: bottom + 0.15,
  };
}

async function addFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    if (photos.some(p => p.filename === file.name)) {
      setStatus(`${file.name} est déjà dans la galerie`);
      continue;
    }
    await uploadPhoto(file);
  }
}

async function uploadPhoto(file) {
  // Affichage immédiat depuis le fichier local, avant même la fin de l'envoi.
  const blobUrl = URL.createObjectURL(file);
  const photo = addPhoto({
    filename: file.name,
    url: blobUrl,
    ...nextPosition(),
    z: photos.length + 1,
  });
  updateStatusCount();
  ensureCanvasHeight();

  try {
    const res = await fetch(`/upload-photo?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      body: file,
    });
    if (!res.ok) throw new Error((await res.text()) || `erreur ${res.status}`);
    // le serveur a fabriqué les dérivées : on passe sur la vignette
    photo.el.querySelector('img').src = thumbUrl(file.name);
    URL.revokeObjectURL(blobUrl);
    markDirty();
  } catch (e) {
    // On retire la photo : la garder enregistrerait dans le layout un
    // fichier qui n'existe pas sur le disque.
    removePhoto(photo);
    URL.revokeObjectURL(blobUrl);
    setStatus(`✗ ${file.name} : ${e.message}`, 6000);
  }
}

// ── Suppression ─────────────────────────────────────────────────────────────

// La suppression est enregistrée immédiatement (layout + fichiers), pour que
// le layout ne puisse jamais pointer vers une photo absente du disque.
// L'original n'est pas détruit : le serveur le range dans photo/corbeille/.
async function deleteSelected() {
  if (!selected) return;
  const photo = selected;
  const ok = confirm(
    `Retirer « ${photo.filename} » de la galerie ?\n\n` +
    `Son placement sera perdu. L'original sera déplacé dans photo/corbeille/.`
  );
  if (!ok) return;

  const index = photos.indexOf(photo);
  removePhoto(photo);
  if (!(await saveLayout())) {
    // Le serveur ne répond pas : rien n'a été touché sur le disque, on remet
    // simplement la photo à sa place (saveLayout a déjà affiché l'erreur).
    photos.splice(index, 0, photo);
    canvas.appendChild(photo.el);
    hint.classList.add('hidden');
    return;
  }
  await fetch(`/delete-photo?name=${encodeURIComponent(photo.filename)}`, { method: 'DELETE' });
  updateStatusCount();
}

// ── Chargement et enregistrement du layout ──────────────────────────────────

async function loadLayout() {
  try {
    const res = await fetch('layout.json');
    if (!res.ok) throw new Error();
    const data = await res.json();
    data.forEach((item, i) => {
      const filename = item.file.replace(/^photos\//, '');
      addPhoto({
        filename,
        url: thumbUrl(filename),
        x: item.x,
        y: item.y,
        size: item.size ?? DEFAULT_SIZE,
        rotation: item.rotation ?? 0,
        z: item.z ?? i + 1, // ancien layout sans z : l'ordre du fichier fait foi
        w: item.w ?? null,
        h: item.h ?? null,
      });
    });
    updateStatusCount();
    setTimeout(ensureCanvasHeight, 200);
  } catch (_) {
    setStatus('aucun layout.json trouvé');
  }
}

function serializeLayout() {
  normalizeZ(); // garde les rangs entre 1 et n
  const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;
  return JSON.stringify(photos.map(p => ({
    file: 'photos/' + p.filename,
    x: round(p.x, 4),
    y: round(p.y, 4),
    size: round(p.size ?? DEFAULT_SIZE, 3),
    rotation: p.rotation,
    z: p.z,
    ...(p.w && p.h ? { w: p.w, h: p.h } : {}),
  })), null, 2) + '\n';
}

// Renvoie true si l'enregistrement a réussi.
async function saveLayout() {
  try {
    const res = await fetch('/save-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serializeLayout(),
    });
    if (!res.ok) throw new Error();
    dirty = false;
    setStatus('enregistré ✓');
    return true;
  } catch (_) {
    setStatus('✗ enregistrement impossible — le serveur tourne-t-il ?', 6000);
    return false;
  }
}

// ── Modifications non enregistrées ──────────────────────────────────────────

function markDirty() {
  dirty = true;
  updateStatusCount();
}

// Fermer l'onglet ou recharger avec des modifications en cours demande
// confirmation : une heure de placement ne doit pas se perdre sur un clic.
window.addEventListener('beforeunload', e => {
  if (dirty) e.preventDefault();
});

// ── Aperçu et publication ───────────────────────────────────────────────────
//
// Les deux passent par publish.sh. L'aperçu le lance en essai à blanc : le
// site est construit exactement comme pour la publication, puis servi en
// local au lieu d'être envoyé. Ce qu'on voit dans l'aperçu est donc ce qui
// partira en ligne, au fichier près.

const PREVIEW_URL = 'http://localhost:8001/photo/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function publish() {
  if (await runPublishScript({ dry: false })) hideLogSoon();
}

async function preview() {
  // L'onglet est ouvert tout de suite, pendant le clic : ouvert après
  // l'attente, le navigateur le bloquerait comme une fenêtre surgissante.
  const tab = window.open('', 'apercu');
  try {
    tab.document.body.textContent = 'Préparation de l’aperçu…';
  } catch (_) {
    // l'onglet affiche déjà un aperçu précédent : on le remplacera
  }

  if (!(await runPublishScript({ dry: true }))) {
    tab?.close();
    return;
  }
  if (tab) {
    tab.location = PREVIEW_URL;
    hideLogSoon();
  } else {
    // le navigateur a bloqué l'ouverture de l'onglet : on propose un lien
    const link = Object.assign(document.createElement('a'), {
      href: PREVIEW_URL,
      target: 'apercu',
      textContent: '→ Ouvrir l’aperçu',
    });
    publishLog.append('\n', link);
  }
}

// Enregistre le layout, lance publish.sh et affiche sa sortie au fur et à
// mesure. Renvoie true si tout s'est bien passé.
async function runPublishScript({ dry }) {
  publishLog.classList.add('visible');
  publishLog.textContent = 'Enregistrement du layout...';
  setPublishing(true);
  try {
    if (!(await saveLayout())) {
      publishLog.textContent = '✗ enregistrement impossible, opération annulée';
      return false;
    }
    const res = await fetch('/publish' + (dry ? '?dry=1' : ''), { method: 'POST' });
    if (!res.ok) {
      publishLog.textContent = res.status === 409
        ? '✗ une publication est déjà en cours'
        : '✗ le serveur a refusé';
      return false;
    }
    while (true) {
      await sleep(700);
      const state = await (await fetch('/publish-log')).json();
      publishLog.textContent = state.log.join('\n') || 'Démarrage...';
      publishLog.scrollTop = publishLog.scrollHeight;
      if (!state.running) return state.ok;
    }
  } catch (_) {
    publishLog.textContent = '✗ serveur injoignable';
    return false;
  } finally {
    setPublishing(false);
  }
}

function setPublishing(busy) {
  publishBtn.disabled = busy;
  previewBtn.disabled = busy;
}

function hideLogSoon() {
  setTimeout(() => publishLog.classList.remove('visible'), 8000);
}

// ── Barre d'état ────────────────────────────────────────────────────────────

let statusTimer = null;

// Message temporaire, puis retour au compteur.
function setStatus(message, duration = 2500) {
  statusEl.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(updateStatusCount, duration);
}

function updateStatusCount() {
  const n = photos.length;
  const count = n === 0 ? 'aucune photo' : `${n} photo${n > 1 ? 's' : ''}`;
  statusEl.textContent = dirty ? `${count} · ● non enregistré` : count;
}

// ── Événements globaux et démarrage ─────────────────────────────────────────

$('load-photos').addEventListener('change', e => {
  addFiles([...e.target.files]);
  e.target.value = '';
});

document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  addFiles([...e.dataTransfer.files]);
});

canvas.addEventListener('click', deselect);

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    saveLayout();
  }
});

window.addEventListener('resize', () => {
  updateGuide();
  photos.forEach(positionPhoto);
});

updateGuide();
ensureCanvasHeight();
loadLayout();
