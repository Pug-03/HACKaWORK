import * as THREE from 'three';

const PX_PER_M = 1000;
const FONT = 'Kanit, Thonburi, "Noto Sans Thai", sans-serif';

function canvas(wM, hM) {
  const c = document.createElement('canvas');
  c.width = Math.round(wM * PX_PER_M);
  c.height = Math.round(hM * PX_PER_M);
  return [c, c.getContext('2d')];
}

function toTexture(c, renderer) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// subtle powder-coat noise + edge wear
function paintBase(ctx, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // street grime: darker band near the ground, a few drip streaks, fine scratches
  const dirt = ctx.createLinearGradient(0, h * 0.7, 0, h);
  dirt.addColorStop(0, 'rgba(40,35,28,0)');
  dirt.addColorStop(1, 'rgba(40,35,28,0.22)');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * w, y = Math.random() * h * 0.3, len = h * (0.15 + Math.random() * 0.4);
    const s = ctx.createLinearGradient(0, y, 0, y + len);
    s.addColorStop(0, 'rgba(30,28,24,0.10)');
    s.addColorStop(1, 'rgba(30,28,24,0)');
    ctx.fillStyle = s;
    ctx.fillRect(x, y, 2 + Math.random() * 5, len);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI, l = 10 + Math.random() * 60;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  // worn paint along the edges
  ctx.strokeStyle = 'rgba(120,120,115,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
}

// thOnly: draw just the Thai heading (used for the laser-cut mask; the small English line is printed)
function title(ctx, w, th, en, ink, y, size, thOnly = false) {
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${size}px ${FONT}`;
  let s = size;
  while (ctx.measureText(th).width > w * 0.9 && s > 20) { s -= 4; ctx.font = `600 ${s}px ${FONT}`; }
  ctx.fillText(th, w / 2, y);
  if (thOnly) return;
  ctx.font = `500 ${Math.round(size * 0.28)}px ${FONT}`;
  ctx.fillText(en, w / 2, y + size * 0.45);
}

// Laser-cut mask: white = sheet metal, black = cut through. Used as alphaMap with alphaTest.
function cutMask(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/* ---------- line icons (drawn around origin, ~200px box) ---------- */
const icons = {
  recycleSymbol(ctx) {
    ctx.lineWidth = 14;
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i * 2 * Math.PI) / 3);
      ctx.beginPath();
      ctx.arc(0, 0, 55, -Math.PI / 2 + 0.35, Math.PI / 6 - 0.15);
      ctx.stroke();
      const a = Math.PI / 6 - 0.15;
      const x = Math.cos(a) * 55, y = Math.sin(a) * 55;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-22, -6); ctx.lineTo(14, 0); ctx.lineTo(-22, 24); ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.restore();
    }
  },
  bottle(ctx) {
    ctx.beginPath();
    ctx.moveTo(-14, -100); ctx.lineTo(14, -100); ctx.lineTo(14, -78); ctx.lineTo(34, -45);
    ctx.lineTo(34, 92); ctx.quadraticCurveTo(34, 102, 24, 102); ctx.lineTo(-24, 102);
    ctx.quadraticCurveTo(-34, 102, -34, 92); ctx.lineTo(-34, -45); ctx.lineTo(-14, -78); ctx.closePath();
    ctx.stroke();
    ctx.strokeRect(-17, -118, 34, 18);
    ctx.beginPath(); ctx.moveTo(-34, -5); ctx.lineTo(34, -5); ctx.moveTo(-34, 45); ctx.lineTo(34, 45); ctx.stroke();
  },
  can(ctx) {
    ctx.beginPath(); ctx.ellipse(0, -55, 34, 10, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-34, -55); ctx.lineTo(-34, 55); ctx.ellipse(0, 55, 34, 10, 0, Math.PI, 0, true);
    ctx.lineTo(34, -55); ctx.stroke();
  },
  shoppingBag(ctx) {
    ctx.beginPath();
    ctx.moveTo(-60, -40); ctx.lineTo(60, -40); ctx.lineTo(75, 90); ctx.lineTo(-75, 90); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-40, -40); ctx.bezierCurveTo(-45, -110, -5, -110, -10, -40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -40); ctx.bezierCurveTo(5, -110, 45, -110, 40, -40); ctx.stroke();
  },
  leaf(ctx) {
    ctx.beginPath(); ctx.moveTo(-80, 30);
    ctx.bezierCurveTo(-40, -60, 50, -60, 80, -20); ctx.bezierCurveTo(40, 40, -30, 60, -80, 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-95, 40); ctx.lineTo(75, -18); ctx.stroke();
  },
  fishbone(ctx) {
    ctx.beginPath(); ctx.moveTo(-90, 0); ctx.lineTo(70, 0); ctx.stroke();
    for (let x = -60; x <= 40; x += 25) {
      ctx.beginPath(); ctx.moveTo(x, -40); ctx.quadraticCurveTo(x + 15, 0, x, 40); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(60, -35); ctx.lineTo(110, 0); ctx.lineTo(60, 35); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-90, 0); ctx.lineTo(-120, -30); ctx.lineTo(-115, 0); ctx.lineTo(-120, 30); ctx.closePath(); ctx.stroke();
  },
  peel(ctx) {
    ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(0, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(-60, -10, -90, 30, -110, 50); ctx.bezierCurveTo(-60, 40, -20, 20, 0, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(60, -10, 90, 30, 120, 40); ctx.bezierCurveTo(60, 50, 20, 20, 0, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(-10, 30, 10, 60, 30, 75); ctx.stroke();
  },
  snack(ctx) {
    ctx.beginPath();
    ctx.moveTo(-45, -70);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-45 + i * 15, -70 + (i % 2 ? -10 : 0));
    ctx.lineTo(45, 70);
    for (let i = 6; i >= 0; i--) ctx.lineTo(-45 + i * 15, 70 + (i % 2 ? 10 : 0));
    ctx.closePath(); ctx.stroke();
  },
  foamBox(ctx) {
    ctx.strokeRect(-70, 0, 140, 45);
    ctx.beginPath(); ctx.moveTo(-70, 0); ctx.lineTo(-55, -50); ctx.lineTo(55, -50); ctx.lineTo(70, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-55, -50); ctx.lineTo(-40, -75); ctx.lineTo(40, -75); ctx.lineTo(55, -50); ctx.stroke();
  },
  glove(ctx) {
    ctx.beginPath();
    ctx.moveTo(-35, 80); ctx.lineTo(-40, -10);
    ctx.lineTo(-38, -70); ctx.lineTo(-24, -70); ctx.lineTo(-22, -15);
    ctx.lineTo(-18, -85); ctx.lineTo(-4, -85); ctx.lineTo(-2, -15);
    ctx.lineTo(4, -80); ctx.lineTo(18, -80); ctx.lineTo(18, -10);
    ctx.lineTo(26, -60); ctx.lineTo(40, -58); ctx.lineTo(36, 10);
    ctx.lineTo(65, -15); ctx.lineTo(72, -5); ctx.lineTo(38, 50); ctx.lineTo(35, 80); ctx.closePath();
    ctx.stroke();
  },
  tiedBag(ctx) {
    ctx.beginPath();
    ctx.moveTo(-20, -150);
    ctx.bezierCurveTo(-40, -175, -55, -160, -45, -140);
    ctx.lineTo(-20, -130); ctx.lineTo(-10, -170); ctx.lineTo(10, -132);
    ctx.lineTo(45, -160); ctx.lineTo(35, -128); ctx.lineTo(20, -112);
    ctx.bezierCurveTo(90, -80, 150, 20, 140, 110);
    ctx.bezierCurveTo(130, 175, 60, 185, 0, 185);
    ctx.bezierCurveTo(-90, 185, -150, 160, -150, 90);
    ctx.bezierCurveTo(-150, 10, -80, -80, -20, -112);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-60, -10); ctx.bezierCurveTo(-20, 30, 40, 80, 70, 150); ctx.stroke();
    ctx.restore();
  },
};

function drawIcon(ctx, name, x, y, scale = 1, rot = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
  icons[name](ctx);
  ctx.restore();
}

const LAYOUT = {
  recycle: [['recycleSymbol', 0.5, 0.36, 0.8], ['bottle', 0.27, 0.66, 0.9, -0.15], ['shoppingBag', 0.7, 0.62, 0.85, 0.15], ['can', 0.48, 0.82, 0.8]],
  food:    [['leaf', 0.3, 0.42, 0.75, -0.3], ['fishbone', 0.68, 0.42, 0.75, -0.35], ['peel', 0.52, 0.72, 0.9]],
  general: [['snack', 0.32, 0.45, 0.85, -0.25], ['foamBox', 0.7, 0.45, 0.8], ['glove', 0.52, 0.74, 0.8, 0.5]],
};

// Returns { map, alpha }: the Thai heading and the icons are laser-cut through the sheet
// (like the real panels), the small English line is printed.
export function makeBinPanelTexture(bay, wM, hM, renderer) {
  const [c, ctx] = canvas(wM, hM);
  const { width: w, height: h } = c;
  const ink = (g, color) => {
    title(g, w, bay.th, bay.en, color, h * 0.13, Math.round(w * 0.17), true);
    g.strokeStyle = color; g.fillStyle = color;
    g.lineWidth = 9; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const [name, fx, fy, s, r = 0] of LAYOUT[bay.id]) drawIcon(g, name, w * fx, h * fy, s * (w / 620), r);
  };
  paintBase(ctx, w, h, bay.panel);
  title(ctx, w, bay.th, bay.en, bay.ink, h * 0.13, Math.round(w * 0.17));   // printed English line
  ink(ctx, '#141414');                                                     // dark edge where cut
  const alpha = cutMask(w, h, (g) => ink(g, '#000'));
  alpha.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { map: toTexture(c, renderer), alpha };
}

export function makeBagPanelTexture(bay, wM, hM, renderer) {
  const [c, ctx] = canvas(wM, hM);
  const { width: w, height: h } = c;
  paintBase(ctx, w, h, bay.panel);
  title(ctx, w, bay.th, bay.en, bay.ink, h * 0.17, Math.round(h * 0.15));
  ctx.fillStyle = '#26292c';
  drawIcon(ctx, 'tiedBag', w * 0.5, h * 0.6, h / 730 * 1.05);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `500 ${Math.round(h * 0.035)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('ถุงดำ', w * 0.56, h * 0.85);
  // cut: Thai heading + bag silhouette; the highlight stroke and the small label stay as metal bridges
  const alpha = cutMask(w, h, (g) => {
    title(g, w, bay.th, bay.en, '#000', h * 0.17, Math.round(h * 0.15), true);
    g.fillStyle = '#000';
    drawIcon(g, 'tiedBag', w * 0.5, h * 0.6, h / 730 * 1.05);
    g.save();
    g.translate(w * 0.5, h * 0.6); g.scale(h / 730 * 1.05, h / 730 * 1.05);
    g.strokeStyle = '#fff'; g.lineWidth = 10;
    g.beginPath(); g.moveTo(-60, -10); g.bezierCurveTo(-20, 30, 40, 80, 70, 150); g.stroke();
    g.restore();
    g.fillStyle = '#fff';
    g.font = `500 ${Math.round(h * 0.035)}px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('ถุงดำ', w * 0.56, h * 0.85);
  });
  alpha.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { map: toTexture(c, renderer), alpha };
}

export function makePavingTexture(renderer) {
  // 1.2 m x 1.2 m patch of 0.3 x 0.6 m grey pavers, running bond, dark grout joints
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  const s = 1024 / 1.2, gap = 5;
  ctx.fillStyle = '#5d6166';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 0.3 : 0;
    for (let col = -1; col < 3; col++) {
      const x = (col * 0.6 + off) * s, y = row * 0.3 * s;
      const v = 148 + Math.floor(Math.random() * 34);
      const g = ctx.createLinearGradient(x, y, x + 0.6 * s, y + 0.3 * s);
      g.addColorStop(0, `rgb(${v},${v + 2},${v + 4})`);
      g.addColorStop(1, `rgb(${v - 10},${v - 8},${v - 6})`);
      ctx.fillStyle = g;
      ctx.fillRect(x + gap, y + gap, 0.6 * s - 2 * gap, 0.3 * s - 2 * gap);
    }
  }
  speckle(ctx, 1024, 1024, 9000, 18);
  return repeatTex(c, renderer, true);
}

export function makeAsphaltTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a4c4f';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 512, 30000, 40);
  return repeatTex(c, renderer, true);
}

// grey value noise for roughness maps (mean, spread in 0..1)
export function makeNoiseTexture(renderer, size = 256, mean = 0.5, spread = 0.2) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.max(0, Math.min(255, (mean + (Math.random() - 0.5) * spread) * 255));
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return repeatTex(c, renderer, false);
}

// brushed-metal roughness: horizontal streaks
export function makeBrushedTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(110,110,110)';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    const v = 80 + Math.random() * 90;
    ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 200, 1);
  }
  return repeatTex(c, renderer, false);
}

function speckle(ctx, w, h, n, amp) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * amp / 255})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function repeatTex(c, renderer, srgb) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
