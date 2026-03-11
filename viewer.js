const canvas = document.getElementById('canvas');
const viewport = document.getElementById('viewport');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxFrame = lightbox.querySelector('.frame');
const errorEl = document.getElementById('error');

fetch('layout.json')
  .then(r => {
    if (!r.ok) throw new Error('not found');
    return r.json();
  })
  .then(data => {
    if (!data.length) return;

    // canvas width: enough to hold the leftmost photo with some margin
    // x is % from right, so highest x value = furthest left
    const maxX = Math.max(...data.map(p => p.x));
    const canvasWidth = Math.max(window.innerWidth * 2, window.innerWidth / (1 - maxX) + 300);
    canvas.style.width = canvasWidth + 'px';

    data.forEach(item => {
      const el = document.createElement('div');
      el.className = 'photo';

      const frame = document.createElement('div');
      frame.className = 'frame';

      const img = document.createElement('img');
      img.src = item.file;
      img.alt = item.file;
      img.draggable = false;

      frame.appendChild(img);
      el.appendChild(frame);
      canvas.appendChild(el);

      // position: x is % from right edge
      const px = canvasWidth - (item.x * canvasWidth) - 100;
      const py = item.y * window.innerHeight - 100;
      el.style.left = px + 'px';
      el.style.top = py + 'px';
      el.style.transform = `rotate(${item.rotation}deg)`;
      el.style.zIndex = Math.floor(Math.random() * 10) + 1;

      el.addEventListener('click', () => openLightbox(item.file));
    });

    // start scrolled to the right (newest photos)
    viewport.scrollLeft = viewport.scrollWidth;
  })
  .catch(() => {
    errorEl.classList.add('visible');
  });

// ── lightbox ──
function openLightbox(src) {
  lightboxImg.src = src;
  lightboxFrame.style.transform = 'none';
  lightbox.classList.add('active');
}

lightbox.addEventListener('click', e => {
  if (e.target === lightbox) {
    lightbox.classList.remove('active');
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') lightbox.classList.remove('active');
});