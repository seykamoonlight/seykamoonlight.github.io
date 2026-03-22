const COLUMN_W = 420; // must match editor.js
let _galleryData = [];

const column = document.getElementById('column');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxFrame = lightbox.querySelector('.frame');
const errorEl = document.getElementById('error');

fetch('layout.json')
  .then(r => { if (!r.ok) throw new Error(); return r.json(); })
  .then(data => {
    if (!data.length) return;

    const colW = column.offsetWidth || COLUMN_W;

    _galleryData = data;

    data.forEach(item => {
      const size = item.size ?? 0.65;
      const photoW = size * colW;
      const left = item.x * colW - photoW / 2;
      const top = item.y * colW;

      const el = document.createElement('div');
      el.className = 'photo';
      el.dataset.file = item.file;
      el.style.width = photoW + 'px';
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.transform = `rotate(${item.rotation}deg)`;
      el.style.zIndex = Math.floor(Math.random() * 10) + 1;

      const frame = document.createElement('div');
      frame.className = 'frame';

      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.loading = 'lazy';
      img.addEventListener('error', () => { img.src = item.file; }, { once: true });
      img.src = item.file.replace(/^photos\//, 'photos/thumbs/');
      img.addEventListener('load', updateColumnHeight);

      frame.appendChild(img);
      el.appendChild(frame);
      column.appendChild(el);

      const thumbSrc = item.file.replace(/^photos\//, 'photos/thumbs/');
      el.addEventListener('click', () => openLightbox(item.file, thumbSrc));
    });

    checkDeepLink();
  })
  .catch(() => errorEl.classList.add('visible'));

function updateColumnHeight() {
  let max = 0;
  column.querySelectorAll('.photo').forEach(el => {
    max = Math.max(max, el.offsetTop + el.offsetHeight);
  });
  column.style.minHeight = (max + 200) + 'px';
}

// ── deep link ──
function checkDeepLink() {
  const filename = decodeURIComponent(window.location.hash.slice(1));
  if (!filename) return;
  const item = _galleryData.find(i => i.file === 'photos/' + filename || i.file === filename);
  if (!item) return;
  const el = column.querySelector(`[data-file="${item.file}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => openLightbox(item.file, item.file.replace(/^photos\//, 'photos/thumbs/')), 500);
}

// ── lightbox ──
let _pendingFull = null;

function openLightbox(fullSrc, thumbSrc) {
  if (_pendingFull) { _pendingFull.onload = null; _pendingFull = null; }

  const filename = fullSrc.split('/').pop();
  history.replaceState(null, '', '#' + encodeURIComponent(filename));

  lightbox.classList.remove('active');
  lightboxImg.src = thumbSrc;
  lightboxImg.classList.add('loading');
  lightbox.offsetHeight; // force reflow
  lightbox.classList.add('active');

  const full = new Image();
  full.onload = () => {
    lightboxImg.src = full.src;
    lightboxImg.classList.remove('loading');
    _pendingFull = null;
  };
  full.src = fullSrc;
  _pendingFull = full;
}

function closeLightbox() {
  history.replaceState(null, '', window.location.pathname);
  lightbox.classList.remove('active');
  lightboxImg.classList.remove('loading');
  if (_pendingFull) { _pendingFull.onload = null; _pendingFull = null; }
}

function sharePhoto() {
  navigator.clipboard.writeText(window.location.href);
  const toast = document.getElementById('share-toast');
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2000);
}

lightbox.addEventListener('click', e => {
  if (e.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
});

// ── panel toggle (mobile) ──
function togglePanel() {
  document.getElementById('panel').classList.toggle('open');
}
