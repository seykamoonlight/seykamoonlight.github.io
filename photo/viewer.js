const COLUMN_W = 420; // must match editor.js

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

    data.forEach(item => {
      const size = item.size ?? 0.65;
      const photoW = size * colW;
      const left = item.x * colW - photoW / 2;
      const top = item.y * colW;

      const el = document.createElement('div');
      el.className = 'photo';
      el.style.width = photoW + 'px';
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.transform = `rotate(${item.rotation}deg)`;
      el.style.zIndex = Math.floor(Math.random() * 10) + 1;

      const frame = document.createElement('div');
      frame.className = 'frame';

      const img = document.createElement('img');
      img.src = item.file.replace(/^photos\//, 'photos/thumbs/');
      img.alt = '';
      img.addEventListener('error', () => { img.src = item.file; }, { once: true });
      img.draggable = false;
      img.loading = 'lazy';
      img.addEventListener('load', updateColumnHeight);

      frame.appendChild(img);
      el.appendChild(frame);
      column.appendChild(el);

      el.addEventListener('click', () => openLightbox(item.file));
    });
  })
  .catch(() => errorEl.classList.add('visible'));

function updateColumnHeight() {
  let max = 0;
  column.querySelectorAll('.photo').forEach(el => {
    max = Math.max(max, el.offsetTop + el.offsetHeight);
  });
  column.style.minHeight = (max + 200) + 'px';
}

// ── lightbox ──
function openLightbox(src) {
  lightbox.classList.remove('active');
  lightboxImg.src = '';
  lightboxImg.onload = () => {
    lightbox.offsetHeight; // force reflow
    lightbox.classList.add('active');
    lightboxImg.onload = null;
  };
  lightboxImg.src = src;
}

lightbox.addEventListener('click', e => {
  if (e.target === lightbox) lightbox.classList.remove('active');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') lightbox.classList.remove('active');
});

// ── panel toggle (mobile) ──
function togglePanel() {
  document.getElementById('panel').classList.toggle('open');
}
