/**
 * Generates the illustrated demo artwork in public/demo (event covers,
 * avatars, business logos). Fictional, brand-consistent placeholders —
 * real deployments use uploaded photography.
 *   npx tsx scripts/gen-art.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'public', 'demo');
const W = 800, H = 560;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296);
}
const f = (n: number) => n.toFixed(1);

function svg(defs: string, body: string, w = W, h = H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>${defs}<filter id="blur"><feGaussianBlur stdDeviation="28"/></filter><filter id="soft"><feGaussianBlur stdDeviation="6"/></filter><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .07 0"/></filter></defs>${body}<rect width="${w}" height="${h}" filter="url(#grain)"/></svg>`;
}

function lin(id: string, stops: string[], x2 = 0, y2 = 1) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map((c, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
}

function crowd(r: () => number, y: number, color: string, density = 34, arms = 0.35) {
  let out = '';
  for (let i = 0; i < density; i++) {
    const x = (i / density) * (W + 80) - 40 + r() * 20;
    const hy = y + r() * 40;
    const hr = 16 + r() * 10;
    out += `<circle cx="${f(x)}" cy="${f(hy)}" r="${f(hr)}" fill="${color}"/>`;
    out += `<rect x="${f(x - hr * 1.5)}" y="${f(hy + hr * 0.6)}" width="${f(hr * 3)}" height="${H}" rx="${f(hr)}" fill="${color}"/>`;
    if (r() < arms) {
      const side = r() < 0.5 ? -1 : 1;
      const ang = side * (10 + r() * 30);
      out += `<rect x="${f(x + side * hr * 0.9 - 5)}" y="${f(hy - hr * 3.2)}" width="11" height="${f(hr * 4)}" rx="5.5" fill="${color}" transform="rotate(${f(ang)} ${f(x + side * hr)} ${f(hy + hr)})"/>`;
    }
  }
  return out;
}

function beams(r: () => number, cx: number, colors: string[], n = 9) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = -70 + (140 / (n - 1)) * i + (r() - 0.5) * 8;
    const len = 900;
    const rad = (a * Math.PI) / 180;
    const x2 = cx + Math.sin(rad) * len, y2 = Math.cos(rad) * len;
    const spread = 26 + r() * 30;
    const c = colors[i % colors.length];
    out += `<polygon points="${cx},-10 ${f(x2 - spread)},${f(y2)} ${f(x2 + spread)},${f(y2)}" fill="${c}" opacity="${(0.18 + r() * 0.2).toFixed(2)}"/>`;
  }
  return out;
}

function orbs(r: () => number, colors: string[], n = 5, yMax = H) {
  return Array.from({ length: n }, (_, i) => `<circle cx="${f(r() * W)}" cy="${f(r() * yMax)}" r="${f(60 + r() * 120)}" fill="${colors[i % colors.length]}" opacity=".55" filter="url(#blur)"/>`).join('');
}

function bokeh(r: () => number, color: string, n = 18) {
  return Array.from({ length: n }, () => `<circle cx="${f(r() * W)}" cy="${f(r() * H * 0.7)}" r="${f(6 + r() * 26)}" fill="${color}" opacity="${(0.15 + r() * 0.35).toFixed(2)}"/>`).join('');
}

const themes: Record<string, (seed: number) => string> = {
  techno: (seed) => {
    const r = rng(seed);
    return svg(lin('bg', ['#07051a', '#1d0b45', '#4a1a86'], 0, 1), `<rect width="${W}" height="${H}" fill="url(#bg)"/>${orbs(r, ['#8B42F5', '#FF4FA3', '#4D7CFF'], 5, 300)}${beams(r, W * (0.35 + r() * 0.3), ['#DCA5FF', '#FF7AC8', '#8BE9FF'], 11)}${beams(r, W * 0.15, ['#FF7AC8'], 4)}${beams(r, W * 0.85, ['#8BE9FF'], 4)}<rect y="${H * 0.55}" width="${W}" height="${H * 0.45}" fill="#0b0720" opacity=".35"/>${crowd(r, H * 0.72, '#05030f', 30, 0.5)}`);
  },
  house: (seed) => {
    const r = rng(seed);
    const bx = W * (0.3 + r() * 0.4);
    let ball = `<circle cx="${f(bx)}" cy="120" r="62" fill="url(#ball)"/>`;
    for (let i = -3; i <= 3; i++) ball += `<ellipse cx="${f(bx)}" cy="120" rx="${f(Math.abs(Math.cos((i * Math.PI) / 7)) * 62)}" ry="62" fill="none" stroke="#fff" stroke-opacity=".35"/>`;
    for (let i = -3; i <= 3; i++) ball += `<line x1="${f(bx - 62)}" y1="${f(120 + i * 17)}" x2="${f(bx + 62)}" y2="${f(120 + i * 17)}" stroke="#fff" stroke-opacity=".3"/>`;
    return svg(lin('bg', ['#2b0a3d', '#7a1f7a', '#ff6f91'], 0, 1) + `<radialGradient id="ball" cx=".35" cy=".35"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#e8c8ff"/><stop offset="1" stop-color="#7b4bb7"/></radialGradient>`,
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${orbs(r, ['#FFB5D2', '#FF9B87', '#DCA5FF'], 6)}${beams(r, bx, ['#fff3b0', '#ffd1f0'], 9)}<line x1="${f(bx)}" y1="0" x2="${f(bx)}" y2="58" stroke="#fff" stroke-opacity=".5"/>${ball}${crowd(r, H * 0.74, '#1b0624', 28, 0.45)}`);
  },
  disco: (seed) => {
    const r = rng(seed);
    let tiles = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) tiles += `<rect x="${x * 70 - 20}" y="${H - 160 + y * 22}" width="66" height="20" fill="${['#FF7AC8', '#8B42F5', '#FFD36E', '#6EE7F9'][(x + y + Math.floor(r() * 2)) % 4]}" opacity="${(0.35 + r() * 0.5).toFixed(2)}" transform="skewX(-20)"/>`;
    return svg(lin('bg', ['#12062a', '#3a0d5e', '#c2187a'], 1, 1) + `<radialGradient id="ball" cx=".35" cy=".35"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#d9c2ff"/><stop offset="1" stop-color="#5b2aa0"/></radialGradient>`,
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${orbs(r, ['#FF4FA3', '#FFD36E', '#8B42F5'], 5, 320)}${beams(r, W / 2, ['#FFD36E', '#FF7AC8', '#ffffff'], 13)}<circle cx="${W / 2}" cy="150" r="86" fill="url(#ball)"/>${Array.from({ length: 40 }, () => `<rect x="${f(W / 2 - 80 + r() * 160)}" y="${f(70 + r() * 160)}" width="14" height="14" fill="#fff" opacity="${(r() * 0.6).toFixed(2)}"/>`).join('')}${tiles}${crowd(r, H * 0.7, '#14051f', 22, 0.6)}`);
  },
  concert: (seed) => {
    const r = rng(seed);
    const spots = [0.12, 0.38, 0.62, 0.88].map((x) => `<polygon points="${f(W * x)},0 ${f(W * x - 160 + r() * 60)},${H} ${f(W * x + 160 - r() * 60)},${H}" fill="url(#spot)" opacity=".55"/>`).join('');
    const band = [0.3, 0.5, 0.7].map((x) => `<circle cx="${f(W * x)}" cy="${f(H * 0.42)}" r="16" fill="#120b10"/><rect x="${f(W * x - 20)}" y="${f(H * 0.45)}" width="40" height="90" rx="16" fill="#120b10"/>`).join('');
    return svg(lin('bg', ['#1a0b14', '#4a1228', '#ff7a59'], 0, 1) + lin('spot', ['#fff6d6', '#ffd27a00'], 0, 1),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${orbs(r, ['#FF9B87', '#FFD36E', '#FF4FA3'], 4, 260)}${spots}<rect y="${f(H * 0.6)}" width="${W}" height="16" fill="#2a1520"/>${band}${bokeh(r, '#fff1c1', 20)}${crowd(r, H * 0.76, '#0d0609', 30, 0.55)}`);
  },
  beach: (seed) => {
    const r = rng(seed);
    const sunX = W * (0.3 + r() * 0.4);
    const palm = (x: number, s: number, flip: number) => {
      const t = `M${x},${H} C${x + 10 * flip},${H - 120 * s} ${x + 40 * flip},${H - 230 * s} ${x + 70 * flip},${H - 300 * s}`;
      const top = { x: x + 70 * flip, y: H - 300 * s };
      let leaves = '';
      for (let i = 0; i < 7; i++) {
        const a = (-160 + i * 50) * (Math.PI / 180);
        const lx = top.x + Math.cos(a) * 120 * s, ly = top.y + Math.sin(a) * 60 * s + 30 * s;
        leaves += `<path d="M${f(top.x)},${f(top.y)} Q${f((top.x + lx) / 2)},${f(Math.min(top.y, ly) - 40 * s)} ${f(lx)},${f(ly)} Q${f((top.x + lx) / 2)},${f(Math.min(top.y, ly) - 10 * s)} ${f(top.x)},${f(top.y)}" fill="#2b1236"/>`;
      }
      return `<path d="${t}" stroke="#2b1236" stroke-width="${f(14 * s)}" fill="none" stroke-linecap="round"/>${leaves}`;
    };
    let sea = '';
    for (let i = 0; i < 6; i++) sea += `<rect y="${f(H * 0.58 + i * 26)}" width="${W}" height="${f(14 + i * 4)}" fill="${['#ffb38a', '#f58fb0', '#c98ae6', '#9c7be8', '#7a6bd8', '#5c58c2'][i]}" opacity=".9"/>`;
    return svg(lin('bg', ['#ffd3a5', '#ff9b87', '#ff7fb0', '#b98cf0'], 0, 1),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/><circle cx="${f(sunX)}" cy="${f(H * 0.5)}" r="110" fill="#fff1c9"/>${Array.from({ length: 5 }, (_, i) => `<rect x="${f(sunX - 120)}" y="${f(H * 0.42 + i * 16)}" width="240" height="${3 + i}" fill="#ffb38a"/>`).join('')}${sea}${palm(70, 1.1, 1)}${palm(W - 60, 0.95, -1)}${palm(W - 160, 0.7, -1)}<rect y="${f(H * 0.88)}" width="${W}" height="${f(H * 0.12)}" fill="#3a1840"/>`);
  },
  brunch: (seed) => {
    const r = rng(seed);
    const plate = (x: number, y: number, rad: number) => {
      const foods = [
        `<ellipse cx="${x - rad * 0.2}" cy="${y}" rx="${rad * 0.32}" ry="${rad * 0.26}" fill="#fffaf0"/><circle cx="${x - rad * 0.2}" cy="${y}" r="${rad * 0.12}" fill="#ffbd2e"/>`,
        `<path d="M${x + rad * 0.05},${y - rad * 0.35} q${rad * 0.4},${rad * 0.1} ${rad * 0.35},${rad * 0.5} q-${rad * 0.3},${rad * 0.1} -${rad * 0.35},-${rad * 0.5}z" fill="#7bb661"/><circle cx="${x + rad * 0.22}" cy="${y - rad * 0.08}" r="${rad * 0.08}" fill="#8a5a2b"/>`,
        Array.from({ length: 6 }, () => `<circle cx="${f(x + (r() - 0.5) * rad)}" cy="${f(y + rad * 0.3 + (r() - 0.5) * rad * 0.3)}" r="${f(rad * 0.07)}" fill="${r() < 0.5 ? '#c2185b' : '#3f51b5'}"/>`).join(''),
        `<rect x="${x - rad * 0.45}" y="${y - rad * 0.5}" width="${rad * 0.5}" height="${rad * 0.35}" rx="${rad * 0.08}" fill="#e2a65b"/><rect x="${x - rad * 0.4}" y="${y - rad * 0.45}" width="${rad * 0.4}" height="${rad * 0.08}" fill="#f6d28b"/>`,
      ];
      return `<circle cx="${x + 6}" cy="${y + 10}" r="${rad}" fill="#000" opacity=".12" filter="url(#soft)"/><circle cx="${x}" cy="${y}" r="${rad}" fill="#ffffff"/><circle cx="${x}" cy="${y}" r="${rad * 0.78}" fill="#fbf6ef"/>${foods.join('')}`;
    };
    const cup = (x: number, y: number) => `<circle cx="${x + 5}" cy="${y + 8}" r="46" fill="#000" opacity=".12" filter="url(#soft)"/><circle cx="${x}" cy="${y}" r="46" fill="#fff"/><circle cx="${x}" cy="${y}" r="34" fill="#6b3e26"/><ellipse cx="${x - 6}" cy="${y - 6}" rx="16" ry="10" fill="#c9905f"/><rect x="${x + 40}" y="${y - 10}" width="26" height="20" rx="10" fill="#fff"/>`;
    const flowers = Array.from({ length: 6 }, () => {
      const x = r() * W, y = r() * H, c = ['#FFB5D2', '#DCA5FF', '#FF9B87'][Math.floor(r() * 3)];
      return Array.from({ length: 5 }, (_, i) => `<circle cx="${f(x + Math.cos((i * 2 * Math.PI) / 5) * 12)}" cy="${f(y + Math.sin((i * 2 * Math.PI) / 5) * 12)}" r="9" fill="${c}"/>`).join('') + `<circle cx="${f(x)}" cy="${f(y)}" r="6" fill="#ffd36e"/>`;
    }).join('');
    return svg(lin('bg', ['#fff3e6', '#ffe1d3', '#f7d3f0'], 1, 1),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${Array.from({ length: 9 }, (_, i) => `<rect x="0" y="${i * 64}" width="${W}" height="2" fill="#e9c9b5" opacity=".6"/>`).join('')}${flowers}${plate(230 + r() * 40, 250, 130)}${plate(560, 340 - r() * 40, 110)}${cup(620, 120)}${cup(110, 460)}<rect x="380" y="60" width="16" height="140" rx="8" fill="#d6c4b5" transform="rotate(25 388 130)"/>`);
  },
  aperitivo: (seed) => {
    const r = rng(seed);
    const glass = (x: number, s: number) => `<path d="M${x - 50 * s},${H * 0.4} Q${x},${H * 0.4 - 10 * s} ${x + 50 * s},${H * 0.4} L${x + 38 * s},${H * 0.4 + 120 * s} Q${x},${H * 0.4 + 150 * s} ${x - 38 * s},${H * 0.4 + 120 * s}Z" fill="url(#spritz)" stroke="#fff" stroke-opacity=".6" stroke-width="3"/><rect x="${x - 3 * s}" y="${H * 0.4 + 140 * s}" width="${6 * s}" height="${90 * s}" fill="#fff" opacity=".7"/><ellipse cx="${x}" cy="${H * 0.4 + 232 * s}" rx="${40 * s}" ry="${8 * s}" fill="#fff" opacity=".7"/><circle cx="${x + 30 * s}" cy="${H * 0.4 + 10 * s}" r="${22 * s}" fill="#ff8a3d" stroke="#ffd29b" stroke-width="${5 * s}"/><rect x="${x - 25 * s}" y="${H * 0.4 + 30 * s}" width="${22 * s}" height="${22 * s}" rx="4" fill="#fff" opacity=".45" transform="rotate(15 ${x - 14 * s} ${H * 0.4 + 41 * s})"/>`;
    return svg(lin('bg', ['#ffcf8a', '#ff9b87', '#e9689c', '#7c3fb8'], 0, 1) + lin('spritz', ['#ffb347', '#ff6a2b'], 0, 1),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${orbs(r, ['#fff1c9', '#FFB5D2', '#ffcf8a'], 5)}${bokeh(r, '#fff6dc', 24)}<rect y="${H * 0.8}" width="${W}" height="${H * 0.2}" fill="#3a1d3f" opacity=".75"/>${glass(W * 0.32, 1.1)}${glass(W * 0.62, 0.9)}`);
  },
  outdoor: (seed) => {
    const r = rng(seed);
    let lights = '';
    for (let k = 0; k < 2; k++) {
      const y0 = 90 + k * 70;
      lights += `<path d="M-20,${y0} Q${W / 2},${y0 + 110} ${W + 20},${y0}" stroke="#2c1d3a" stroke-width="2" fill="none"/>`;
      for (let i = 0; i <= 14; i++) {
        const t = i / 14, x = -20 + t * (W + 40), y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 + 110) + t * t * y0;
        lights += `<circle cx="${f(x)}" cy="${f(y + 10)}" r="16" fill="#ffe7a3" opacity=".5" filter="url(#soft)"/><circle cx="${f(x)}" cy="${f(y + 10)}" r="6" fill="#fff4cf"/>`;
      }
    }
    return svg(lin('bg', ['#c9b6ff', '#ffc9d9', '#ffe3c2'], 0, 1),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${orbs(r, ['#fff1c9', '#DCA5FF'], 3, 200)}<path d="M0,${H * 0.62} Q${W * 0.3},${H * 0.48} ${W * 0.6},${H * 0.6} T${W},${H * 0.55} V${H} H0Z" fill="#9ccf9a"/><path d="M0,${H * 0.75} Q${W * 0.4},${H * 0.62} ${W},${H * 0.76} V${H} H0Z" fill="#6fb37a"/>${Array.from({ length: 5 }, (_, i) => { const x = 60 + i * 170 + r() * 40; return `<rect x="${f(x - 6)}" y="${f(H * 0.5)}" width="12" height="80" fill="#5b3b2e"/><circle cx="${f(x)}" cy="${f(H * 0.47)}" r="${f(40 + r() * 20)}" fill="#4f9a63"/>`; }).join('')}<rect x="${W * 0.36}" y="${H * 0.8}" width="210" height="90" rx="12" fill="#ff8fb0" opacity=".9"/><rect x="${W * 0.36}" y="${H * 0.8}" width="210" height="90" rx="12" fill="none" stroke="#fff" stroke-dasharray="14 10" stroke-width="5" opacity=".7"/>${lights}`);
  },
  festival: (seed) => {
    const r = rng(seed);
    let flags = '';
    for (let i = 0; i < 18; i++) flags += `<polygon points="${i * 46},40 ${i * 46 + 40},40 ${i * 46 + 20},78" fill="${['#FF4FA3', '#FFD36E', '#8B42F5', '#6EE7F9'][i % 4]}"/>`;
    const confetti = Array.from({ length: 60 }, () => `<rect x="${f(r() * W)}" y="${f(r() * H * 0.6)}" width="8" height="14" fill="${['#FF4FA3', '#FFD36E', '#DCA5FF', '#6EE7F9', '#fff'][Math.floor(r() * 5)]}" transform="rotate(${f(r() * 180)} ${f(r() * W)} ${f(r() * H)})" opacity=".85"/>`).join('');
    return svg(lin('bg', ['#2b1d6b', '#7b3fd0', '#ff7aa8', '#ffb68a'], 0, 1),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${orbs(r, ['#FFD36E', '#FF4FA3'], 4, 250)}<rect x="${W * 0.18}" y="${H * 0.28}" width="${W * 0.64}" height="${H * 0.34}" fill="#1a1240"/><rect x="${W * 0.22}" y="${H * 0.32}" width="${W * 0.56}" height="${H * 0.22}" fill="url(#screen)"/><path d="M${W * 0.18},${H * 0.28} L${W * 0.5},${H * 0.14} L${W * 0.82},${H * 0.28}" fill="none" stroke="#1a1240" stroke-width="14"/>${beams(r, W / 2, ['#ffffff', '#FFD36E'], 7)}${flags}${confetti}${crowd(r, H * 0.74, '#140c33', 34, 0.6)}` ,
    ).replace('<defs>', `<defs>${lin('screen', ['#ff4fa3', '#8b42f5', '#6ee7f9'], 1, 0)}`);
  },
  dinner: (seed) => {
    const r = rng(seed);
    const candle = (x: number) => `<circle cx="${x}" cy="${H * 0.36}" r="60" fill="#ffcf7a" opacity=".35" filter="url(#blur)"/><rect x="${x - 10}" y="${H * 0.4}" width="20" height="90" rx="4" fill="#fff4e6"/><path d="M${x},${H * 0.33} q12,22 0,32 q-12,-10 0,-32" fill="#ffd36e"/>`;
    const glassW = (x: number) => `<path d="M${x - 24},${H * 0.42} Q${x},${H * 0.62} ${x + 24},${H * 0.42}Z" fill="#7a1530" opacity=".9"/><path d="M${x - 26},${H * 0.36} Q${x},${H * 0.66} ${x + 26},${H * 0.36}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3"/><rect x="${x - 2}" y="${H * 0.54}" width="4" height="60" fill="#fff" opacity=".6"/>`;
    return svg(lin('bg', ['#1d0c16', '#4a1726', '#7c2a3a'], 0, 1),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${bokeh(r, '#ffcf7a', 26)}<rect y="${H * 0.62}" width="${W}" height="${H * 0.38}" fill="#f3e6dc"/><ellipse cx="${W * 0.5}" cy="${H * 0.8}" rx="160" ry="44" fill="#fff"/><ellipse cx="${W * 0.5}" cy="${H * 0.8}" rx="110" ry="28" fill="#f7efe8"/><circle cx="${W * 0.47}" cy="${H * 0.79}" r="22" fill="#d9822b"/><circle cx="${W * 0.53}" cy="${H * 0.8}" r="14" fill="#7bb661"/>${candle(W * 0.25)}${candle(W * 0.75)}${glassW(W * 0.38)}${glassW(W * 0.64)}`);
  },
  hiphop: (seed) => {
    const r = rng(seed);
    const blocks = Array.from({ length: 14 }, () => `<rect x="${f(r() * W)}" y="${f(r() * H * 0.6)}" width="${f(60 + r() * 160)}" height="${f(30 + r() * 80)}" rx="16" fill="${['#FFD36E', '#FF4FA3', '#6EE7F9', '#8B42F5', '#7CFFB2'][Math.floor(r() * 5)]}" opacity=".8" transform="rotate(${f(-15 + r() * 30)} 400 280)"/>`).join('');
    return svg(lin('bg', ['#111827', '#312e81', '#db2777'], 1, 1),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${blocks}<text x="50%" y="46%" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="120" fill="#fff" opacity=".9" transform="rotate(-6 400 260)">BLOCK</text>${crowd(r, H * 0.72, '#0a0a14', 30, 0.7)}`);
  },
  jazz: (seed) => {
    const r = rng(seed);
    return svg(lin('bg', ['#0b1033', '#1e2a78', '#6b4bd8'], 0, 1) + lin('spot', ['#fff6d6', '#ffd27a00'], 0, 1),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>${orbs(r, ['#DCA5FF', '#4D7CFF'], 4)}<polygon points="${W / 2},0 ${W / 2 - 200},${H} ${W / 2 + 200},${H}" fill="url(#spot)" opacity=".5"/><line x1="${W / 2}" y1="${H * 0.36}" x2="${W / 2}" y2="${H}" stroke="#05060f" stroke-width="8"/><ellipse cx="${W / 2}" cy="${H * 0.33}" rx="18" ry="28" fill="#05060f"/>${Array.from({ length: 9 }, () => { const x = r() * W, y = 60 + r() * 260; return `<circle cx="${f(x)}" cy="${f(y)}" r="12" fill="#fff" opacity=".6"/><rect x="${f(x + 9)}" y="${f(y - 48)}" width="4" height="48" fill="#fff" opacity=".6"/>`; }).join('')}${crowd(r, H * 0.8, '#05060f', 26, 0.1)}`);
  },
};

const COVERS: [string, number][] = [
  ['techno', 3], ['house', 2], ['disco', 2], ['concert', 3], ['beach', 3], ['brunch', 3],
  ['aperitivo', 3], ['outdoor', 2], ['festival', 2], ['dinner', 2], ['hiphop', 1], ['jazz', 1],
];

mkdirSync(join(OUT, 'covers'), { recursive: true });
mkdirSync(join(OUT, 'avatars'), { recursive: true });
mkdirSync(join(OUT, 'logos'), { recursive: true });
let seed = 7;
for (const [theme, n] of COVERS) for (let i = 1; i <= n; i++) writeFileSync(join(OUT, 'covers', `${theme}-${i}.svg`), themes[theme]((seed += 101)));

// Avatars: playful illustrated faces on pastel backgrounds.
const SKIN = ['#f6d1b5', '#e8b48f', '#c98d62', '#8d5a3b', '#f2c6a0'];
const HAIR = ['#2b1a12', '#5a3420', '#a0522d', '#e1b866', '#1a1a2e', '#7b3fb8', '#d94f7a'];
const BG = [['#DCA5FF', '#FFB5D2'], ['#FF9B87', '#FFD36E'], ['#8BE9FF', '#DCA5FF'], ['#FFB5D2', '#FF9B87'], ['#B8F2C9', '#8BE9FF']];
export function avatar(seedN: number, longHair: boolean) {
  const r = rng(seedN);
  const skin = SKIN[Math.floor(r() * SKIN.length)], hair = HAIR[Math.floor(r() * HAIR.length)], bg = BG[Math.floor(r() * BG.length)];
  const glasses = r() < 0.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs>${lin('g', bg, 1, 1)}</defs><rect width="200" height="200" fill="url(#g)"/>${longHair ? `<path d="M48,92 Q46,30 100,28 Q154,30 152,92 L160,190 H40Z" fill="${hair}"/>` : ''}<rect x="58" y="150" width="84" height="70" rx="38" fill="${['#8B42F5', '#171326', '#FF9B87', '#ffffff', '#4D7CFF'][Math.floor(r() * 5)]}"/><rect x="88" y="128" width="24" height="30" rx="10" fill="${skin}"/><ellipse cx="100" cy="96" rx="44" ry="50" fill="${skin}"/><path d="M56,86 Q58,40 100,40 Q144,40 146,86 Q128,62 100,66 Q72,62 56,86Z" fill="${hair}"/><circle cx="84" cy="98" r="5" fill="#2b1a12"/><circle cx="116" cy="98" r="5" fill="#2b1a12"/><path d="M86,120 Q100,${130 + r() * 6} 114,120" stroke="#9a3b3b" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="76" cy="112" r="7" fill="#ff8fb0" opacity=".45"/><circle cx="124" cy="112" r="7" fill="#ff8fb0" opacity=".45"/>${glasses ? '<g fill="none" stroke="#171326" stroke-width="4"><circle cx="84" cy="98" r="13"/><circle cx="116" cy="98" r="13"/><line x1="97" y1="98" x2="103" y2="98"/></g>' : ''}</svg>`;
}
const PEOPLE: [string, boolean][] = [
  ['giuliarossi', true], ['lucab', false], ['saraconti', true], ['marcoferri', false], ['chiarae', true], ['davidegreco', false],
  ['elenaromano', true], ['fra.moretti', false], ['martinag', true], ['alessio.ricci', false],
];
PEOPLE.forEach(([u, long], i) => writeFileSync(join(OUT, 'avatars', `${u}.svg`), avatar(1000 + i * 37, long)));
for (let i = 0; i < 24; i++) writeFileSync(join(OUT, 'avatars', `crowd-${i + 1}.svg`), avatar(5000 + i * 53, i % 2 === 0));

// Business logos: bold initials on gradient tiles.
const LOGOS: [string, string, string[]][] = [
  ['magazzino-21', 'M21', ['#171326', '#8B42F5']], ['terrazza-lilla', 'TL', ['#DCA5FF', '#FFB5D2']], ['officina-brunch', 'OB', ['#FFD36E', '#FF9B87']],
  ['sala-prisma', 'SP', ['#4D7CFF', '#DCA5FF']], ['lido-corallo', 'LC', ['#FF9B87', '#FFB5D2']], ['nebula-club', 'N', ['#0b0820', '#4a1a86']],
  ['bottega-spritz', 'BS', ['#ff8a3d', '#ffcf8a']], ['giardino-segreto', 'GS', ['#6fb37a', '#c9b6ff']], ['onda-festival', '≈', ['#8B42F5', '#FF4FA3']],
  ['collettivo-sabato', 'CS', ['#FF4FA3', '#FFD36E']],
];
for (const [slug, txt, g] of LOGOS)
  writeFileSync(join(OUT, 'logos', `${slug}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs>${lin('g', g, 1, 1)}</defs><rect width="200" height="200" rx="0" fill="url(#g)"/><text x="100" y="${txt.length > 2 ? 122 : 128}" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-weight="800" font-size="${txt.length > 2 ? 64 : 80}" fill="#fff">${txt}</text></svg>`);

console.log('✓ demo artwork generated in public/demo');
