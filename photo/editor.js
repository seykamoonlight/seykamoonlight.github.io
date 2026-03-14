const COLUMN_W = 420; // must match viewer.js
const STD_BOX  = 210; // reference box for "100%" natural size (px)

const canvas = document.getElementById('canvas');
const wrapper = document.getElementById('canvas-wrapper');
const columnGuide = document.getElementById('column-guide');
const hint = document.getElementById('hint');
const statusEl = document.getElementById('status');
const rotationSlider = document.getElementById('rotation-slider');
const rotationValue = document.getElementById('rotation-value');
const rotationControl = document.getElementById('rotation-control');
const sizeSlider = document.getElementById('size-slider');
const sizeValue = document.getElementById('size-value');
const sizeControl = document.getElementById('size-control');
const deleteBtn = document.getElementById('delete-btn');

// photos: { el, filename, url, x, y, size, rotation }
// x: center of photo as fraction of COLUMN_W from column left (0.5 = centered, can go negative/over 1 for bleed)
// y: top of photo in COLUMN_W units from top
// size: width of photo as fraction of COLUMN_W
const photos = [];
let selected = null;
let dragging = null;
let dragOffX = 0, dragOffY = 0;

const PANEL_W = 330;

function getColLeft() {
  const available = canvas.offsetWidth - PANEL_W;
  return PANEL_W + Math.max(0, (available - COLUMN_W) / 2);
}

function updateGuide() {
  columnGuide.style.left = getColLeft() + 'px';
  columnGuide.style.width = COLUMN_W + 'px';
}

function ensureCanvasHeight() {
  let minH = wrapper.offsetHeight + 200;
  photos.forEach(p => {
    const photoH = p.el.offsetHeight || p.size * COLUMN_W;
    minH = Math.max(minH, p.y * COLUMN_W + photoH + 200);
  });
  canvas.style.minHeight = minH + 'px';
}

// ── upload a file to the server, show immediately via blob URL ──
async function handlePhotoFile(file) {
  if (!file.type.startsWith('image/')) return;
  if (photos.find(p => p.filename === file.name)) return;

  const blobUrl = URL.createObjectURL(file);
  const photo = spawnPhoto(file.name, blobUrl, 0.5, nextY(), null, 0);
  updateStatus();
  ensureCanvasHeight();

  try {
    const res = await fetch(`/upload-photo?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      body: file
    });
    if (!res.ok) throw new Error();
    photo.url = 'photos/' + file.name;
    photo.el.querySelector('img').src = photo.url;
    URL.revokeObjectURL(blobUrl);
  } catch (_) {
    updateStatus('upload failed – is the server running?');
  }
}

function nextY() {
  return 0.3;
}

function addSpaceTop() {
  const SHIFT = 0.5;
  photos.forEach(p => { p.y += SHIFT; positionPhoto(p); });
  ensureCanvasHeight();
}

function removeSpaceTop() {
  const SHIFT = 0.5;
  photos.forEach(p => { p.y = Math.max(0, p.y - SHIFT); positionPhoto(p); });
  ensureCanvasHeight();
}

// ── file picker ──
document.getElementById('load-photos').addEventListener('change', e => {
  Array.from(e.target.files).forEach(handlePhotoFile);
  e.target.value = '';
});

// ── drag & drop ──
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  Array.from(e.dataTransfer.files).forEach(handlePhotoFile);
});

function spawnPhoto(filename, url, x, y, size, rotation) {
  hint.classList.add('hidden');

  const el = document.createElement('div');
  el.className = 'photo';

  const frame = document.createElement('div');
  frame.className = 'frame';

  const img = document.createElement('img');
  img.src = url;
  img.draggable = false;
  img.addEventListener('load', () => {
    // compute natural size: scale actual dimensions to fit STD_BOX
    const scale = Math.min(STD_BOX / img.naturalWidth, STD_BOX / img.naturalHeight, 1);
    photo.naturalSize = (img.naturalWidth * scale) / COLUMN_W;
    if (photo.size === null) {
      photo.size = photo.naturalSize;
      positionPhoto(photo);
      if (selected === photo) updateSizeSlider(photo);
    }
    ensureCanvasHeight();
  });

  frame.appendChild(img);
  el.appendChild(frame);
  canvas.appendChild(el);

  const photo = { el, filename, url, x, y, size, rotation };
  photos.push(photo);

  positionPhoto(photo);
  applyRotation(photo);
  bindDrag(el, photo);

  el.addEventListener('click', e => {
    e.stopPropagation();
    selectPhoto(photo);
  });

  return photo;
}

function positionPhoto(photo) {
  const photoW = (photo.size ?? 0.65) * COLUMN_W;
  const cx = getColLeft() + photo.x * COLUMN_W;
  photo.el.style.left = (cx - photoW / 2) + 'px';
  photo.el.style.top = (photo.y * COLUMN_W) + 'px';
  photo.el.style.width = photoW + 'px';
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
    const canvasRect = canvas.getBoundingClientRect();
    const rawX = e.clientX - canvasRect.left - dragOffX;
    const rawY = e.clientY - canvasRect.top - dragOffY;
    el.style.left = rawX + 'px';
    el.style.top = rawY + 'px';
  });

  el.addEventListener('pointerup', () => {
    if (dragging !== photo) return;
    const photoW = photo.size * COLUMN_W;
    const left = parseFloat(el.style.left);
    const top = parseFloat(el.style.top);
    photo.x = (left + photoW / 2 - getColLeft()) / COLUMN_W;
    photo.y = top / COLUMN_W;
    el.style.zIndex = selected === photo ? 100 : 1;
    dragging = null;
    ensureCanvasHeight();
  });
}

function updateSizeSlider(photo) {
  const multiplier = photo.naturalSize ? photo.size / photo.naturalSize : 1;
  sizeSlider.value = multiplier;
  sizeValue.textContent = Math.round(multiplier * 100) + '%';
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

  updateSizeSlider(photo);
  sizeControl.classList.add('visible');

  deleteBtn.classList.add('visible');
}

function deselectAll() {
  if (selected) {
    selected.el.classList.remove('selected');
    selected.el.style.zIndex = 1;
    selected = null;
  }
  rotationControl.classList.remove('visible');
  sizeControl.classList.remove('visible');
  deleteBtn.classList.remove('visible');
}

canvas.addEventListener('click', deselectAll);

function onRotationChange() {
  if (!selected) return;
  selected.rotation = parseFloat(rotationSlider.value);
  rotationValue.textContent = selected.rotation + '°';
  applyRotation(selected);
}

function onSizeChange() {
  if (!selected) return;
  const multiplier = parseFloat(sizeSlider.value);
  selected.size = (selected.naturalSize ?? 0.65) * multiplier;
  sizeValue.textContent = Math.round(multiplier * 100) + '%';
  positionPhoto(selected);
  ensureCanvasHeight();
}

function deleteSelected() {
  if (!selected) return;
  const filename = selected.filename;
  photos.splice(photos.indexOf(selected), 1);
  selected.el.remove();
  selected = null;
  rotationControl.classList.remove('visible');
  sizeControl.classList.remove('visible');
  deleteBtn.classList.remove('visible');
  updateStatus();
  if (photos.length === 0) hint.classList.remove('hidden');
  fetch(`/delete-photo?name=${encodeURIComponent(filename)}`, { method: 'DELETE' });
}

let statusTimer = null;
function updateStatus(msg) {
  if (msg) {
    statusEl.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => updateStatus(), 2000);
    return;
  }
  statusEl.textContent = photos.length === 0
    ? 'no photos loaded'
    : `${photos.length} photo${photos.length > 1 ? 's' : ''}`;
}

// ── layout ──
function parseLayout(text) {
  const data = JSON.parse(text);
  data.forEach(item => {
    const filename = item.file.replace(/^photos\//, '');
    if (photos.find(p => p.filename === filename)) return;
    spawnPhoto(filename, item.file, item.x, item.y, item.size ?? 0.65, item.rotation);
  });
  updateStatus();
  hint.classList.add('hidden');
  setTimeout(ensureCanvasHeight, 200);
}

function buildLayoutJson() {
  return JSON.stringify(photos.map(p => ({
    file: 'photos/' + p.filename,
    x: Math.round(p.x * 10000) / 10000,
    y: Math.round(p.y * 10000) / 10000,
    size: Math.round(p.size * 1000) / 1000,
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

// ── Cmd+S ──
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveLayout();
  }
});

// ── resize ──
window.addEventListener('resize', () => {
  updateGuide();
  photos.forEach(positionPhoto);
});

// init
updateGuide();
ensureCanvasHeight();
loadLayout();
