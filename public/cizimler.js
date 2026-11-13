// Ürün çizimleri: her kıyafet türü kendi SVG yoluyla çizilir, renk ve desen üründen gelir.
// Fotoğraf kullanılmadığı için telif sorunu yoktur; panelden fotoğraf yüklenirse onun yerine fotoğraf görünür.

export const CIZIM_ADLARI = {
  tisort: 'Tişört', body: 'Bebek body', elbise: 'Elbise', pantolon: 'Pantolon', etek: 'Etek',
  sweatshirt: 'Kapüşonlu sweatshirt', mont: 'Mont', salopet: 'Salopet', bere: 'Bere', corap: 'Çorap',
};
export const DESEN_ADLARI = { duz: 'Düz', cizgili: 'Çizgili', puantiye: 'Puantiyeli', yildiz: 'Yıldızlı' };

// Ana gövde yolları (200x200 kutu). Ek ayrıntılar aşağıda ayrıca çizilir.
const GOVDE = {
  tisort: 'M60 42 L86 32 Q100 46 114 32 L140 42 L172 72 L152 92 L140 82 L140 170 Q100 176 60 170 L60 82 L48 92 L28 72 Z',
  body: 'M70 36 L88 30 Q100 43 112 30 L130 36 L152 60 L137 72 L131 66 L132 128 Q132 150 113 164 L109 172 L91 172 L87 164 Q68 150 68 128 L69 66 L63 72 L48 60 Z',
  elbise: 'M78 28 L90 28 Q100 40 110 28 L122 28 L126 70 Q124 79 120 82 L162 166 Q100 184 38 166 L80 82 Q76 79 74 70 Z',
  pantolon: 'M62 34 L138 34 L148 172 L110 172 L100 84 L90 172 L52 172 Z',
  etek: 'M70 54 L130 54 L164 150 Q100 168 36 150 Z',
  sweatshirt: 'M62 52 L82 44 L118 44 L138 52 L170 140 L151 147 L138 98 L138 172 Q100 178 62 172 L62 98 L49 147 L30 140 Z',
  mont: 'M62 48 L84 38 L116 38 L138 48 L168 142 L149 148 L138 102 L138 174 L62 174 L62 102 L51 148 L32 142 Z',
  salopet: 'M74 44 L126 44 L126 76 L134 76 L140 172 L108 172 L100 122 L92 172 L60 172 L66 76 L74 76 Z',
  bere: 'M48 132 Q48 58 100 56 Q152 58 152 132 Z',
  corap: 'M84 36 L114 36 L114 118 L136 138 Q148 152 134 164 L98 164 Q78 162 82 140 L84 118 Z',
};

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function koyulastir(h, oran = 0.28) {
  const [r, g, b] = hexRgb(h);
  return rgbHex(r * (1 - oran), g * (1 - oran), b * (1 - oran));
}
export function acik(h, oran = 0.82) {
  const [r, g, b] = hexRgb(h);
  return rgbHex(r + (255 - r) * oran, g + (255 - g) * oran, b + (255 - b) * oran);
}
function parlakMi(h) {
  const [r, g, b] = hexRgb(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72;
}

let sayac = 0;

/** Kıyafet çizimini SVG metni olarak döndürür. renk: #rrggbb, desen: duz|cizgili|puantiye|yildiz */
export function cizimSvg(cizim, renk = '#7cc4f2', desen = 'duz', etiket = '') {
  const tur = GOVDE[cizim] ? cizim : 'tisort';
  const r = /^#[0-9a-f]{6}$/i.test(renk) ? renk : '#7cc4f2';
  const id = 'd' + ++sayac;
  const koyu = koyulastir(r);
  const desenRenk = parlakMi(r) ? 'rgba(60,50,80,.16)' : 'rgba(255,255,255,.55)';
  const d = GOVDE[tur];

  let desenTanim = '';
  if (desen === 'cizgili') {
    desenTanim = `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="6" fill="${desenRenk}"/></pattern>`;
  } else if (desen === 'puantiye') {
    desenTanim = `<pattern id="${id}" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="3" fill="${desenRenk}"/><circle cx="14" cy="14" r="3" fill="${desenRenk}"/></pattern>`;
  } else if (desen === 'yildiz') {
    desenTanim = `<pattern id="${id}" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M7 2 L8.6 5.6 L12.4 5.8 L9.4 8.2 L10.4 12 L7 9.9 L3.6 12 L4.6 8.2 L1.6 5.8 L5.4 5.6 Z" fill="${desenRenk}"/><circle cx="20" cy="19" r="1.6" fill="${desenRenk}"/></pattern>`;
  }

  let sonra = ''; // gövdenin üstüne çizilen ayrıntılar
  const cizgi = `stroke="${koyu}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  switch (tur) {
    case 'tisort':
      sonra = `<path d="M86 32 Q100 50 114 32" ${cizgi}/><path d="M60 82 L60 96 M140 82 L140 96" ${cizgi} opacity=".35"/>`;
      break;
    case 'body':
      sonra = `<path d="M88 30 Q100 47 112 30" ${cizgi}/>` +
        [92, 100, 108].map((x) => `<circle cx="${x}" cy="167" r="2.4" fill="${koyu}"/>`).join('');
      break;
    case 'elbise':
      sonra = `<rect x="76" y="74" width="48" height="10" rx="4" fill="${koyu}"/>` +
        `<path d="M100 79 L88 71 L88 87 Z M100 79 L112 71 L112 87 Z" fill="#fff" opacity=".85"/><circle cx="100" cy="79" r="3.5" fill="#fff"/>` +
        `<path d="M90 28 Q100 40 110 28" ${cizgi}/>`;
      break;
    case 'pantolon':
      sonra = `<rect x="62" y="34" width="76" height="12" fill="${koyu}" opacity=".55"/><path d="M100 46 L100 84" ${cizgi}/>` +
        `<path d="M74 54 Q80 64 90 62 M126 54 Q120 64 110 62" ${cizgi} opacity=".6"/>`;
      break;
    case 'etek':
      sonra = `<rect x="68" y="44" width="64" height="14" rx="5" fill="${koyu}"/>` +
        `<path d="M86 58 L74 154 M100 58 L100 158 M114 58 L126 154" ${cizgi} opacity=".35"/>`;
      break;
    case 'sweatshirt':
      sonra = `<path d="M80 46 Q74 14 100 12 Q126 14 120 46 Q100 56 80 46 Z" fill="${koyu}"/>` +
        `<path d="M86 44 Q100 30 114 44" fill="none" stroke="${acik(r, 0.5)}" stroke-width="3"/>` +
        `<path d="M93 50 L91 72 M107 50 L109 72" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>` +
        `<path d="M78 122 L122 122 L128 152 L72 152 Z" fill="${koyu}" opacity=".35"/>` +
        `<path d="M62 160 L138 160" ${cizgi} opacity=".5"/>`;
      break;
    case 'mont':
      sonra = [74, 98, 122, 148].map((y) => `<path d="M62 ${y} L138 ${y}" ${cizgi} opacity=".45"/>`).join('') +
        `<path d="M100 40 L100 174" stroke="${koyu}" stroke-width="3"/>` +
        `<rect x="82" y="30" width="36" height="14" rx="6" fill="${koyu}"/>` +
        `<path d="M56 120 L64 118 M144 120 L136 118" ${cizgi}/>`;
      break;
    case 'salopet':
      sonra = `<path d="M78 46 L70 16 M122 46 L130 16" stroke="${koyu}" stroke-width="8" stroke-linecap="round"/>` +
        `<circle cx="80" cy="52" r="4" fill="#fff"/><circle cx="120" cy="52" r="4" fill="#fff"/>` +
        `<rect x="88" y="56" width="24" height="18" rx="3" fill="none" stroke="${koyu}" stroke-width="2.5" stroke-dasharray="4 3"/>`;
      break;
    case 'bere':
      sonra = `<rect x="42" y="124" width="116" height="30" rx="10" fill="${koyu}"/>` +
        [56, 70, 84, 98, 112, 126, 140].map((x) => `<path d="M${x} 128 L${x} 150" stroke="${acik(r, 0.3)}" stroke-width="3" opacity=".5"/>`).join('') +
        `<circle cx="100" cy="50" r="17" fill="${acik(r, 0.55)}" stroke="${koyu}" stroke-width="3"/>`;
      break;
    case 'corap':
      sonra = `<rect x="84" y="36" width="30" height="16" fill="${koyu}"/><path d="M84 44 L114 44" stroke="#fff" stroke-width="2.5" opacity=".7"/>` +
        `<path d="M98 164 Q90 150 110 150" ${cizgi} opacity=".4"/>`;
      break;
  }

  // Çorap tek değil çift olsun: arkaya kaydırılmış bir eşi.
  const arka = tur === 'corap'
    ? `<g transform="translate(-34 8)" opacity=".9"><path d="${d}" fill="${acik(r, 0.25)}"/><path d="${d}" fill="none" stroke="${koyu}" stroke-width="3" stroke-linejoin="round"/><rect x="84" y="36" width="30" height="16" fill="${koyu}" opacity=".8"/></g>`
    : '';

  const baslik = etiket ? `<title>${etiket.replace(/[<>&"]/g, '')}</title>` : '';
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="${etiket ? 'false' : 'true'}">${baslik}` +
    `<defs>${desenTanim}</defs>` +
    `<ellipse cx="100" cy="184" rx="58" ry="7" fill="rgba(47,42,59,.08)"/>` + arka +
    `<path d="${d}" fill="${r}"/>` + (desenTanim ? `<path d="${d}" fill="url(#${id})"/>` : '') +
    sonra +
    `<path d="${d}" fill="none" stroke="${koyu}" stroke-width="3" stroke-linejoin="round"/></svg>`;
}

/** Ürünün görseli: fotoğraf varsa <img>, yoksa çizim. */
export function urunGorseli(u) {
  if (u.gorsel) {
    const img = document.createElement('img');
    img.src = u.gorsel;
    img.alt = u.ad;
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
  }
  const kap = document.createElement('div');
  kap.className = 'cizim';
  kap.innerHTML = cizimSvg(u.cizim, u.renk, u.desen);
  return kap;
}
