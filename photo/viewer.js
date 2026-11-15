// Galerie publique : lit layout.json et place chaque photo comme dans
// l'éditeur.
//
// Toutes les positions du layout sont en largeurs de colonne (voir le
// commentaire en tête d'editor.js). La largeur réelle de la colonne vient de
// la variable CSS --col (viewer.css) : le placement suit donc la taille de
// l'écran, y compris quand on tourne un téléphone, sans aucun recalcul ici.

const DEFAULT_SIZE = 0.65; // même valeur que dans editor.js

const column = document.getElementById('column');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const shareToast = document.getElementById('share-toast');

let gallery = [];            // les entrées de layout.json
const photoEls = new Map();  // item.file → son élément .photo

// ── Fichiers publiés ────────────────────────────────────────────────────────
//
// Les originaux ne sont pas en ligne, seulement les deux tailles fabriquées
// par build_web.py. Elles sont toujours nommées <nom>.jpg en minuscules :
// macOS ignore la casse des noms de fichiers, les serveurs de GitHub Pages non.

const stem = file => file.split('/').pop().replace(/\.[^.]+$/, '');
const thumbOf = item => `photos/thumbs/${stem(item.file)}.jpg`; // 900 px, la grille
const fullOf = item => `photos/web/${stem(item.file)}.jpg`;     // 2000 px, le lightbox

// ── Construction de la galerie ──────────────────────────────────────────────

// k largeurs de colonne, en CSS
const cols = k => `calc(var(--col) * ${k})`;

function renderPhoto(item, index) {
  const size = item.size ?? DEFAULT_SIZE;

  const el = document.createElement('div');
  el.className = 'photo';
  el.style.left = cols(item.x - size / 2);
  el.style.top = cols(item.y);
  el.style.width = cols(size);
  el.style.transform = `rotate(${item.rotation ?? 0}deg)`;
  // l'empilement est voulu : il vient du layout, jamais du hasard
  el.style.zIndex = item.z ?? index + 1;

  const frame = document.createElement('div');
  frame.className = 'frame';
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.loading = 'lazy';
  // réserve la bonne hauteur avant le chargement : rien ne saute au défilement
  if (item.w && item.h) img.style.aspectRatio = `${item.w} / ${item.h}`;
  img.src = thumbOf(item);

  frame.appendChild(img);
  el.appendChild(frame);
  el.addEventListener('click', () => openLightbox(item));
  return el;
}

// Les photos sont en position absolue : la colonne ne grandit pas d'elle-même,
// on lui donne la hauteur de la photo la plus basse, plus une marge.
function fitColumnHeight() {
  const bottom = Math.max(...gallery.map(item => {
    const ratio = (item.w && item.h) ? item.h / item.w : 3 / 4;
    return item.y + (item.size ?? DEFAULT_SIZE) * ratio;
  }));
  column.style.minHeight = `calc(var(--col) * ${bottom} + 220px)`;
}

fetch('layout.json')
  .then(res => {
    if (!res.ok) throw new Error(res.status);
    return res.json();
  })
  .then(data => {
    if (!data.length) return;
    gallery = data;
    gallery.forEach((item, i) => {
      const el = renderPhoto(item, i);
      photoEls.set(item.file, el);
      column.appendChild(el);
    });
    fitColumnHeight();
    openFromUrl();
  })
  .catch(() => document.getElementById('error').classList.add('visible'));

// ── Lien direct vers une photo ──────────────────────────────────────────────
//
// …/photo/#DSCF9302 ouvre directement cette photo. On accepte aussi l'ancien
// format avec extension (#DSCF9302.JPG), pour que les liens déjà partagés
// continuent de fonctionner, et on ignore la casse.

function openFromUrl() {
  const asked = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  if (!asked) return;
  const item = gallery.find(i =>
    stem(i.file).toLowerCase() === asked ||
    i.file.split('/').pop().toLowerCase() === asked
  );
  if (!item) return;
  photoEls.get(item.file).scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => openLightbox(item), 500);
}

// ── Lightbox ────────────────────────────────────────────────────────────────

let pendingFull = null; // version 2000 px en cours de chargement

function openLightbox(item) {
  cancelPendingFull();
  // l'URL désigne la photo ouverte : on peut la copier et la partager
  history.replaceState(null, '', '#' + encodeURIComponent(stem(item.file)));

  // On montre aussitôt la vignette, déjà en cache, floutée ; la version
  // 2000 px la remplace dès qu'elle est arrivée.
  lightbox.classList.remove('active');
  placeInView(lightbox);
  lightboxImg.src = thumbOf(item);
  lightboxImg.classList.add('loading');
  void lightbox.offsetHeight; // force le navigateur à rejouer l'animation d'ouverture
  lightbox.classList.add('active');

  const full = new Image();
  full.onload = () => {
    lightboxImg.src = full.src;
    lightboxImg.classList.remove('loading');
    pendingFull = null;
  };
  full.src = fullOf(item);
  pendingFull = full;
}

function closeLightbox() {
  cancelPendingFull();
  history.replaceState(null, '', location.pathname);
  lightbox.classList.remove('active');
  lightboxImg.classList.remove('loading');
}

// Évite qu'une grande image arrivant en retard remplace une autre photo
// ouverte entre-temps.
function cancelPendingFull() {
  if (pendingFull) pendingFull.onload = null;
  pendingFull = null;
}

async function sharePhoto() {
  try {
    await navigator.clipboard.writeText(location.href);
    shareToast.textContent = 'Lien copié !';
  } catch {
    shareToast.textContent = 'Copie impossible';
  }
  shareToast.classList.add('visible');
  setTimeout(() => shareToast.classList.remove('visible'), 2000);
}

lightbox.addEventListener('click', e => {
  if (e.target === lightbox) closeLightbox(); // clic à côté de la photo
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
});

// ── Panneau (mobile) ────────────────────────────────────────────────────────

function togglePanel() {
  const panel = document.getElementById('panel');
  if (!panel.classList.contains('open')) placeInView(panel);
  panel.classList.toggle('open');
}

// Le lightbox et le panneau (sur téléphone) ne sont pas fixés à l'écran mais
// posés dans la page, pour que Safari sur iPhone laisse voir à travers ses
// barres (voir viewer.css) : on les place là où l'on se trouve. La page est
// bloquée tant qu'ils sont ouverts, cette position reste donc la bonne.
function placeInView(el) {
  el.style.setProperty('--panel-top', scrollY + 'px');
  el.style.setProperty('--view-h', innerHeight + 'px');
  el.style.top = el === lightbox ? scrollY + 'px' : '';
  el.style.height = el === lightbox ? innerHeight + 'px' : '';
}

// rotation du téléphone, fenêtre redimensionnée
addEventListener('resize', () => {
  if (lightbox.classList.contains('active')) placeInView(lightbox);
  const panel = document.getElementById('panel');
  if (panel.classList.contains('open')) placeInView(panel);
});
