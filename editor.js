const canvas = document.getElementById('canvas');
const wrapper = document.getElementById('canvas-wrapper');
const hint = document.getElementById('hint');
const statusEl = document.getElementById('status');
const rotationSlider = document.getElementById('rotation-slider');
const rotationValue = document.getElementById('rotation-value');
const rotationControl = document.getElementById('rotation-control');
const deleteBtn = document.getElementById('delete-btn');

// photos: { el, filename, x (% from right), y (% of height), rotation }
const photos = [];
let selected = null;
let dragging = null;
let dragOffX = 0, dragOffY = 0;

// ── canvas width grows to fit ──
function ensureCanvasWidth() {
  canvas.style.width = Math.max(canvas.offsetWidth, window.innerWidth * 3) + 'px';
}

// ── upload a File to the server, show immediately via blob URL ──
async function handlePhotoFile(file) {
  if (!file.type.startsWith('image/')) return;
  if (photos.find(p => p.filename === file.name)) return; // already on canvas

  // show immediately while uploading
  const blobUrl = URL.createObjectURL(file);
  const photo = spawnPhoto(file.name, blobUrl, 0.5, 0.5, 0);
  updateStatus();

  try {
    const res = await fetch(`/upload-photo?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      body: file
    });
    if (!res.ok) throw new Error('upload failed');
    // switch to permanent server URL
    const serverUrl = 'photos/' + file.name;
    photo.url = serverUrl;
    photo.el.querySelector('img').src = serverUrl;
    URL.revokeObjectURL(blobUrl);
  } catch (_) {
    updateStatus('upload failed – is the server running?');
  }
}

// ── file picker ──
document.getElementById('load-photos').addEventListener('change', e => {
  Array.from(e.target.files).forEach(handlePhotoFile);
  e.target.value = '';
});

// ── drag & drop anywhere on the page ──
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  Array.from(e.dataTransfer.files).forEach(handlePhotoFile);
});

function spawnPhoto(filename, url, xPct, yPct, rotation) {
  hint.classList.add('hidden');
  ensureCanvasWidth();

  const el = document.createElement('div');
  el.className = 'photo';

  const frame = document.createElement('div');
  frame.className = 'frame';

  const img = document.createElement('img');
  img.src = url;
  img.draggable = false;

  frame.appendChild(img);
  el.appendChild(frame);
  canvas.appendChild(el);

  const photo = { el, filename, url, x: xPct, y: yPct, rotation };
  photos.push(photo);

  positionPhoto(photo);
  applyRotation(photo);
  bindDrag(el, photo);

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    selectPhoto(photo);
  });

  return photo;
}

function positionPhoto(photo) {
  const cw = canvas.offsetWidth;
  const ch = canvas.offsetHeight;
  const px = cw - (photo.x * cw) - 100;
  const py = photo.y * ch - 100;
  photo.el.style.left = px + 'px';
  photo.el.style.top = py + 'px';
}

function applyRotation(photo) {
  photo.el.style.transform = `rotate(${photo.rotation}deg)`;
}

function bindDrag(el, photo) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    dragging = photo;
    const rect = el.getBoundingClientRect();
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
    el.style.zIndex = 999;
  });

  el.addEventListener('pointermove', e => {
    if (dragging !== photo) return;
    const wrapRect = wrapper.getBoundingClientRect();
    const rawX = e.clientX - wrapRect.left + wrapper.scrollLeft - dragOffX;
    const rawY = e.clientY - wrapRect.top - dragOffY;
    el.style.left = rawX + 'px';
    el.style.top = rawY + 'px';
  });

  el.addEventListener('pointerup', () => {
    if (dragging !== photo) return;
    const cw = canvas.offsetWidth;
    const ch = canvas.offsetHeight;
    const px = parseFloat(el.style.left) + 100;
    const py = parseFloat(el.style.top) + 100;
    photo.x = (cw - px) / cw;
    photo.y = py / ch;
    el.style.zIndex = selected === photo ? 100 : 1;
    dragging = null;
  });
}

function selectPhoto(photo) {
  if (selected) {
    selected.el.classList.remove('selected');
    selected.el.style.zIndex = 1;
  }
  selected = photo;
  photo.el.classList.add('selected');
  photo.el.style.zIndex = 100;
  rotationSlider.value = photo.rotation;
  rotationValue.textContent = photo.rotation + '°';
  rotationControl.classList.add('visible');
  deleteBtn.classList.add('visible');
}

function deselectAll() {
  if (selected) {
    selected.el.classList.remove('selected');
    selected.el.style.zIndex = 1;
    selected = null;
  }
  rotationControl.classList.remove('visible');
  deleteBtn.classList.remove('visible');
}

canvas.addEventListener('click', deselectAll);

function onRotationChange() {
  if (!selected) return;
  selected.rotation = parseFloat(rotationSlider.value);
  rotationValue.textContent = selected.rotation + '°';
  applyRotation(selected);
}

function deleteSelected() {
  if (!selected) return;
  const idx = photos.indexOf(selected);
  photos.splice(idx, 1);
  selected.el.remove();
  selected = null;
  rotationControl.classList.remove('visible');
  deleteBtn.classList.remove('visible');
  updateStatus();
  if (photos.length === 0) hint.classList.remove('hidden');
}

let statusTimer = null;
function updateStatus(msg) {
  if (msg) {
    statusEl.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => updateStatus(), 2000);
    return;
  }
  statusEl.textContent = photos.length === 0 ? 'no photos loaded' : `${photos.length} photo${photos.length > 1 ? 's' : ''}`;
}

// ── layout ──
function parseLayout(text) {
  const data = JSON.parse(text);
  data.forEach(item => {
    const filename = item.file.replace(/^photos\//, '');
    if (photos.find(p => p.filename === filename)) return;
    spawnPhoto(filename, item.file, item.x, item.y, item.rotation);
  });
  updateStatus();
  hint.classList.add('hidden');
}

function buildLayoutJson() {
  return JSON.stringify(photos.map(p => ({
    file: 'photos/' + p.filename,
    x: Math.round(p.x * 10000) / 10000,
    y: Math.round(p.y * 10000) / 10000,
    rotation: p.rotation
  })), null, 2);
}

async function saveLayout() {
  try {
    const res = await fetch('/save-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildLayoutJson()
    });
    if (!res.ok) throw new Error();
    updateStatus('saved ✓');
  } catch (_) {
    updateStatus('save failed – is the server running?');
  }
}

async function loadLayout() {
  try {
    const res = await fetch('/layout.json');
    if (!res.ok) throw new Error();
    parseLayout(await res.text());
  } catch (_) {
    updateStatus('no layout.json found');
  }
}

// ── Cmd+S shortcut ──
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveLayout();
  }
});

// ── keep canvas sized on resize ──
window.addEventListener('resize', () => {
  ensureCanvasWidth();
  photos.forEach(positionPhoto);
});

// init
canvas.style.width = (window.innerWidth * 3) + 'px';
loadLayout();
