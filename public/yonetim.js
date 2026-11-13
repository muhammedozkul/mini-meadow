import { CIZIM_ADLARI, DESEN_ADLARI, urunGorseli, acik } from './cizimler.js';

const $ = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => [...k.querySelectorAll(s)];
const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
const para = (n) => tl.format(n);
const sayiYaz = (n) => (Number.isInteger(Number(n)) ? String(n) : Number(n).toFixed(2).replace('.', ','));
const DURUM_ADLARI = { yeni: 'Yeni', onaylandi: 'Onaylandı', kargoda: 'Kargoda', teslim: 'Teslim edildi', iptal: 'İptal' };
const BEDEN_HAZIR = {
  bebek: ['0-3 ay', '3-6 ay', '6-12 ay', '12-18 ay', '18-24 ay'],
  cocuk: ['2-3 yaş', '3-4 yaş', '4-5 yaş', '5-6 yaş', '7-8 yaş', '9-10 yaş'],
  tek: ['Standart'],
};

const veri = { ayarlar: {}, kategoriler: [], urunler: [], siparisler: [] };
let sekme = 'ozet';

function el(etiket, ozellik = {}, ...cocuklar) {
  const e = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellik)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  e.append(...cocuklar.filter((c) => c != null));
  return e;
}

let bildirimZaman;
function bildir(mesaj) {
  const b = $('#bildirim');
  b.textContent = mesaj;
  b.classList.add('gorunur');
  clearTimeout(bildirimZaman);
  bildirimZaman = setTimeout(() => b.classList.remove('gorunur'), 2600);
}

function hataGoster(kutu, mesaj) {
  kutu.textContent = mesaj;
  kutu.hidden = !mesaj;
}

class OturumYok extends Error {}

async function api(yol, { method = 'GET', govde } = {}) {
  let cevap;
  try {
    cevap = await fetch('/api/yonetim/' + yol, {
      method, cache: 'no-store',
      headers: govde ? { 'Content-Type': 'application/json', 'X-Mini-Meadow': '1' } : { 'X-Mini-Meadow': '1' },
      body: govde ? JSON.stringify(govde) : undefined,
    });
  } catch {
    throw new Error('Sunucuya ulaşılamadı. Sunucunun açık olduğundan emin ol.');
  }
  const v = await cevap.json().catch(() => ({}));
  if (cevap.status === 401 && !['giris', 'sifre'].includes(yol)) {
    girisGoster(false, 'Oturumun kapandı, yeniden giriş yap. Ekrandaki değişikliklerin silinmedi.');
    throw new OturumYok(v.hata);
  }
  if (!cevap.ok) throw new Error(v.hata || `Hata (${cevap.status})`);
  return v;
}

// ---------------------------------------------------------------- giriş
let kurulumModu = false;
function girisGoster(kurulum, mesaj = '') {
  kurulumModu = kurulum;
  $('#giris').hidden = false;
  $('#panel').hidden = true;
  $('#girisBaslik').textContent = kurulum ? 'Panel şifresini belirle' : 'Yönetim paneli';
  $('#girisAciklama').textContent = kurulum
    ? 'İlk açılış: panel için en az 8 karakterli bir şifre seç. Şifre proje klasöründeki .env dosyasına yazılır.'
    : 'Devam etmek için panel şifresini gir.';
  $('#tekrarAlan').hidden = !kurulum;
  $('#girisForm').sifre.autocomplete = kurulum ? 'new-password' : 'current-password';
  $('#girisDugme').textContent = kurulum ? 'Şifreyi kaydet ve gir' : 'Giriş yap';
  hataGoster($('#girisHata'), mesaj);
  $('#girisForm').sifre.focus();
}

let yuklendi = false;
async function panelAc() {
  $('#giris').hidden = true;
  $('#panel').hidden = false;
  if (!yuklendi) { // oturum düşüp yeniden girilince ekrandaki taslak korunur
    await yenile();
    yuklendi = true;
  }
}

$('#girisForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const hata = $('#girisHata');
  if (kurulumModu) {
    if (f.sifre.value.length < 8) return hataGoster(hata, 'Şifre en az 8 karakter olmalı.');
    if (f.sifre.value !== f.tekrar.value) return hataGoster(hata, 'İki şifre aynı değil.');
  }
  $('#girisDugme').disabled = true;
  try {
    await api(kurulumModu ? 'kurulum' : 'giris', { method: 'POST', govde: { sifre: f.sifre.value } });
    f.reset();
    await panelAc();
  } catch (h) {
    hataGoster(hata, h.message);
  } finally {
    $('#girisDugme').disabled = false;
  }
});

$('#cikis').addEventListener('click', async () => {
  await api('cikis', { method: 'POST' }).catch(() => {});
  yuklendi = false;
  girisGoster(false);
});

// ---------------------------------------------------------------- veri ve sekmeler
async function yenile() {
  Object.assign(veri, await api('veri'));
  ciz();
}

function ciz() {
  $('#panelMagazaAdi').textContent = veri.ayarlar.magazaAdi;
  const yeni = veri.siparisler.filter((s) => s.durum === 'yeni').length;
  $('#yeniSiparisSayi').textContent = yeni;
  $('#yeniSiparisSayi').hidden = yeni === 0;
  ozetCiz();
  siparisleriCiz();
  urunleriCiz();
  kategorileriCiz();
  ayarlariDoldur();
}

function sekmeAc(ad) {
  sekme = ad;
  for (const b of $$('#sekmeler button')) b.setAttribute('aria-selected', String(b.dataset.sekme === ad));
  for (const s of $$('.bolum')) s.hidden = s.dataset.bolum !== ad;
  try { sessionStorage.setItem('mm-panel-sekme', ad); } catch { /* yok say */ }
}
for (const b of $$('#sekmeler button')) b.addEventListener('click', () => sekmeAc(b.dataset.sekme));

const satis = (u) => (u.indirimli != null && u.indirimli < u.fiyat ? u.indirimli : u.fiyat);
const toplamStok = (u) => u.stok.reduce((t, s) => t + s.adet, 0);
const kategoriAdi = (id) => veri.kategoriler.find((k) => k.id === id)?.ad ?? '—';

function resimKutusu(u, sinif) {
  const k = el('div', { class: sinif });
  k.style.background = u.gorsel ? '#f6f1ea' : acik(u.renk, 0.84);
  k.append(urunGorseli(u));
  return k;
}

// ---------------------------------------------------------------- özet
function ozetCiz() {
  const aktif = veri.urunler.filter((u) => u.aktif);
  const tukenen = aktif.flatMap((u) => u.stok.filter((s) => s.adet === 0)).length;
  const ciro = veri.siparisler.filter((s) => ['onaylandi', 'kargoda', 'teslim'].includes(s.durum)).reduce((t, s) => t + s.toplam, 0);
  const kartlar = [
    ['Satıştaki ürün', aktif.length, 'var(--gok)'],
    ['Yeni sipariş', veri.siparisler.filter((s) => s.durum === 'yeni').length, 'var(--mercan)'],
    ['Tükenen beden', tukenen, 'var(--gunes)'],
    ['Onaylanan satış', para(ciro), 'var(--nane)'],
  ];
  $('#istatistik').replaceChildren(...kartlar.map(([ad, deger, renk]) => {
    const k = el('div', { class: 'ist' }, el('b', { text: String(deger) }), el('span', { text: ad }));
    k.style.setProperty('--renk', renk);
    return k;
  }));

  const azalan = aktif.flatMap((u) => u.stok.filter((s) => s.adet <= 2).map((s) => ({ u, s })))
    .sort((a, b) => a.s.adet - b.s.adet).slice(0, 8);
  $('#azalanlar').replaceChildren(...(azalan.length ? azalan.map(({ u, s }) => el('li', {},
    el('span', {}, `${u.ad} `, el('small', { text: s.beden })),
    el('b', { text: s.adet === 0 ? 'Tükendi' : `${s.adet} adet` }))) : [el('li', { class: 'bos-satir', text: 'Bütün bedenlerde yeterli stok var 👍' })]));

  const son = veri.siparisler.slice(0, 5);
  $('#sonSiparisler').replaceChildren(...(son.length ? son.map((s) => el('li', {},
    el('span', {}, `${s.musteri} `, el('small', { text: `${s.no} · ${DURUM_ADLARI[s.durum]}` })),
    el('b', { text: para(s.toplam) }))) : [el('li', { class: 'bos-satir', text: 'Henüz sipariş yok.' })]));
}

// ---------------------------------------------------------------- siparişler
function waTelefon(tel) {
  let r = tel.replace(/\D/g, '');
  if (r.startsWith('0')) r = '9' + r;
  else if (r.length === 10) r = '90' + r;
  return r;
}

function siparisleriCiz() {
  const filtre = $('#siparisFiltre').value;
  const liste = veri.siparisler.filter((s) => filtre === 'hepsi' || s.durum === filtre);
  if (!liste.length) {
    $('#siparisListe').replaceChildren(el('p', { class: 'ipucu', text: filtre === 'hepsi' ? 'Henüz sipariş yok. Mağazadan bir sipariş denediğinde burada görünür.' : 'Bu durumda sipariş yok.' }));
    return;
  }
  const acikOlanlar = new Set($$('.siparis[open]').map((d) => d.dataset.no));
  $('#siparisListe').replaceChildren(...liste.map((s) => {
    const hata = el('p', { class: 'form-hata s-hata', role: 'alert', hidden: true });
    const sec = el('select', { class: 'durum-sec', 'aria-label': `${s.no} durumu` },
      ...Object.entries(DURUM_ADLARI).map(([d, ad]) => el('option', { value: d, selected: d === s.durum }, ad)));
    sec.addEventListener('click', (e) => e.stopPropagation());
    sec.addEventListener('change', async () => {
      sec.disabled = true;
      try {
        await api('siparis/' + encodeURIComponent(s.no), { method: 'PUT', govde: { durum: sec.value } });
        bildir(`${s.no}: ${DURUM_ADLARI[sec.value]}`);
        await yenile();
      } catch (h) {
        if (h instanceof OturumYok) return;
        sec.value = s.durum;
        hataGoster(hata, h.message);
        detay.open = true;
      } finally { sec.disabled = false; }
    });

    const tablo = el('table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Ürün' }), el('th', { text: 'Beden' }), el('th', { text: 'Adet' }), el('th', { text: 'Tutar' }))),
      el('tbody', {}, ...s.kalemler.map((k) => el('tr', {},
        el('td', { text: k.ad }), el('td', { text: k.beden }), el('td', { text: String(k.adet) }), el('td', { text: para(k.tutar) }))),
      el('tr', {}, el('td', { colspan: '3', text: 'Kargo' }), el('td', { text: s.kargo ? para(s.kargo) : 'Ücretsiz' }))));

    const dugmeler = el('div', { class: 's-dugmeler' });
    if (s.telefon) {
      dugmeler.append(el('a', { class: 'dugme whatsapp kucuk', href: `https://wa.me/${waTelefon(s.telefon)}`, target: '_blank', rel: 'noopener noreferrer' }, 'Müşteriye yaz'));
    }
    if (s.durum === 'iptal') {
      dugmeler.append(el('button', { class: 'dugme ikincil kucuk', type: 'button', onclick: async () => {
        if (!(await onayla(`${s.no} numaralı iptal edilmiş sipariş kalıcı olarak silinsin mi?`))) return;
        try { await api('siparis/' + encodeURIComponent(s.no), { method: 'DELETE' }); bildir('Sipariş silindi'); await yenile(); }
        catch (h) { if (!(h instanceof OturumYok)) hataGoster(hata, h.message); }
      } }, 'Siparişi sil'));
    }

    const detay = el('details', { class: 'siparis', 'data-durum': s.durum, 'data-no': s.no, open: acikOlanlar.has(s.no) },
      el('summary', {},
        el('div', { class: 's-no' }, el('b', { text: s.no }), el('small', { text: s.tarih })),
        el('div', { class: 's-musteri' }, el('span', { text: s.musteri }), el('small', { text: `${s.kalemler.reduce((t, k) => t + k.adet, 0)} ürün` })),
        el('span', { class: 's-toplam', text: para(s.toplam) }),
        sec),
      el('div', { class: 's-detay' },
        el('div', {}, tablo),
        el('div', { class: 's-bilgi' },
          el('p', {}, el('b', { text: 'Adres' }), s.adres),
          s.telefon ? el('p', {}, el('b', { text: 'Telefon' }), s.telefon) : null,
          s.not ? el('p', {}, el('b', { text: 'Not' }), s.not) : null,
          el('p', {}, el('b', { text: 'Stok' }), s.stokDusuldu ? 'Stoktan düşüldü' : 'Henüz stoktan düşülmedi'),
          dugmeler),
        hata));
    return detay;
  }));
}
$('#siparisFiltre').addEventListener('change', siparisleriCiz);

// ---------------------------------------------------------------- ürünler
function urunleriCiz() {
  const ara = $('#urunAra').value.trim().toLocaleLowerCase('tr-TR');
  const liste = veri.urunler.filter((u) => !ara || u.ad.toLocaleLowerCase('tr-TR').includes(ara));
  if (!liste.length) {
    $('#urunTablo').replaceChildren(el('p', { class: 'ipucu', text: 'Ürün bulunamadı.' }));
    return;
  }
  $('#urunTablo').replaceChildren(...liste.map((u) => {
    const stok = toplamStok(u);
    const tukenen = u.stok.filter((s) => s.adet === 0).length;
    const s = satis(u);
    const anahtar = el('input', { type: 'checkbox', checked: u.aktif, 'aria-label': `${u.ad} mağazada görünsün` });
    anahtar.addEventListener('change', async () => {
      try {
        await api('urun/' + encodeURIComponent(u.id), { method: 'PUT', govde: { aktif: anahtar.checked } });
        u.aktif = anahtar.checked;
        bildir(u.aktif ? `${u.ad} mağazada görünüyor` : `${u.ad} mağazadan gizlendi`);
        urunleriCiz(); ozetCiz();
      } catch (h) { anahtar.checked = !anahtar.checked; if (!(h instanceof OturumYok)) bildir(h.message); }
    });
    return el('div', { class: 'u-satir' + (u.aktif ? '' : ' pasif') },
      resimKutusu(u, 'u-resim'),
      el('div', { class: 'u-ad' }, el('b', { text: u.ad }), el('small', { text: `${u.yasGrubu === 'bebek' ? 'Bebek' : 'Çocuk'}${u.yeni ? ' · Yeni' : ''}` })),
      el('span', { class: 'u-kat', text: kategoriAdi(u.kategori) }),
      el('span', { class: 'u-fiyat' }, el('b', { class: s < u.fiyat ? 'indirimde' : '', text: para(s) }), s < u.fiyat ? el('s', { text: para(u.fiyat) }) : null),
      el('span', { class: 'u-stok' + (stok === 0 ? ' sifir' : tukenen ? ' az' : ''), text: stok === 0 ? 'Stok yok' : `${stok} adet${tukenen ? ` · ${tukenen} beden bitti` : ''}` }),
      el('label', { class: 'anahtar', title: 'Mağazada görünsün' }, anahtar, el('span', { text: u.aktif ? 'Açık' : 'Gizli' })),
      el('div', { class: 'u-dugmeler' },
        el('button', { class: 'ikon-dugme', type: 'button', onclick: () => duzenleyiciAc(u) }, 'Düzenle'),
        el('button', { class: 'ikon-dugme sil-d', type: 'button', 'aria-label': `${u.ad} sil`, onclick: () => urunSil(u) }, 'Sil')));
  }));
}
$('#urunAra').addEventListener('input', urunleriCiz);

async function urunSil(u) {
  if (!(await onayla(`"${u.ad}" kalıcı olarak silinsin mi? Geçmiş siparişlerdeki kaydı kalır.`))) return;
  try {
    await api('urun/' + encodeURIComponent(u.id), { method: 'DELETE' });
    bildir(`${u.ad} silindi`);
    await yenile();
  } catch (h) { if (!(h instanceof OturumYok)) bildir(h.message); }
}

// ---------------------------------------------------------------- ürün düzenleyici
const dlg = $('#duzenleyici');
const uf = $('#urunForm');
let duzenlenen = null; // düzenlenen ürünün id'si; yeni üründe null
let gorsel = '';

for (const [k, ad] of Object.entries(CIZIM_ADLARI)) $('#dCizim').append(el('option', { value: k, text: ad }));
for (const [k, ad] of Object.entries(DESEN_ADLARI)) $('#dDesen').append(el('option', { value: k, text: ad }));

function stokSatiri(beden = '', adet = 0) {
  const satir = el('div', { class: 'stok-satir' },
    el('input', { 'aria-label': 'Beden', placeholder: 'Beden', value: beden, maxlength: '20', 'data-beden': true }),
    el('input', { 'aria-label': 'Adet', type: 'number', min: '0', max: '9999', step: '1', value: String(adet), inputmode: 'numeric', 'data-adet': true }),
    el('button', { type: 'button', 'aria-label': 'Bedeni kaldır', title: 'Kaldır', onclick: () => satir.remove() }, '×'));
  return satir;
}

function onizle() {
  const u = { ad: uf.ad.value || 'Ürün', cizim: uf.cizim.value, renk: uf.renk.value, desen: uf.desen.value, gorsel };
  $('#dResim').replaceChildren(urunGorseli(u));
  $('#dResim').style.background = gorsel ? '#f6f1ea' : acik(u.renk, 0.84);
  $('#dFotoKaldir').hidden = !gorsel;
  for (const a of [uf.cizim, uf.renk, uf.desen]) a.disabled = !!gorsel;
}
for (const a of ['cizim', 'renk', 'desen']) uf[a].addEventListener('input', onizle);

function duzenleyiciAc(u = null) {
  duzenlenen = u?.id ?? null;
  uf.reset();
  hataGoster($('#urunHata'), '');
  $('#dBaslik').textContent = u ? 'Ürünü düzenle' : 'Yeni ürün';
  $('#dKategori').replaceChildren(el('option', { value: '', text: 'Seç…' }), ...veri.kategoriler.map((k) => el('option', { value: k.id, text: k.ad })));
  const d = u ?? { ad: '', aciklama: '', kategori: '', yasGrubu: 'cocuk', cinsiyet: 'unisex', fiyat: '', indirimli: null,
    cizim: 'tisort', renk: '#7cc4f2', desen: 'duz', gorsel: '', yeni: true, aktif: true,
    stok: BEDEN_HAZIR.cocuk.map((b) => ({ beden: b, adet: 0 })) };
  uf.ad.value = d.ad;
  uf.aciklama.value = d.aciklama;
  uf.kategori.value = d.kategori;
  uf.yasGrubu.value = d.yasGrubu;
  uf.cinsiyet.value = d.cinsiyet;
  uf.fiyat.value = d.fiyat === '' ? '' : sayiYaz(d.fiyat);
  uf.indirimli.value = d.indirimli == null ? '' : sayiYaz(d.indirimli);
  uf.cizim.value = d.cizim;
  uf.renk.value = d.renk;
  uf.desen.value = d.desen;
  uf.yeni.checked = d.yeni;
  uf.aktif.checked = d.aktif;
  gorsel = d.gorsel;
  $('#stokSatirlar').replaceChildren(...d.stok.map((s) => stokSatiri(s.beden, s.adet)));
  onizle();
  dlg.showModal();
  uf.ad.focus();
}

$('#yeniUrun').addEventListener('click', () => duzenleyiciAc());
$('#bedenEkle').addEventListener('click', () => {
  const s = stokSatiri();
  $('#stokSatirlar').append(s);
  $('[data-beden]', s).focus();
});
for (const b of $$('[data-hazir]')) {
  b.addEventListener('click', () => {
    // Var olan bedenlerin adedini koru, yeni hazır listeyi uygula.
    const eski = new Map($$('.stok-satir').map((s) => [$('[data-beden]', s).value.trim(), Number($('[data-adet]', s).value) || 0]));
    $('#stokSatirlar').replaceChildren(...BEDEN_HAZIR[b.dataset.hazir].map((bd) => stokSatiri(bd, eski.get(bd) ?? 0)));
    if (b.dataset.hazir === 'bebek') uf.yasGrubu.value = 'bebek';
    if (b.dataset.hazir === 'cocuk') uf.yasGrubu.value = 'cocuk';
  });
}
for (const b of $$('[data-kapat]', dlg)) b.addEventListener('click', () => dlg.close());

// Fotoğraf: tarayıcıda ortadan kare kırpılır, 800x800 WebP (olmazsa JPEG) yapılır; ~100 KB'ye iner.
$('#dFoto').addEventListener('change', async (e) => {
  const dosya = e.target.files[0];
  e.target.value = '';
  if (!dosya) return;
  if (!/^image\/(jpeg|png|webp)$/.test(dosya.type)) return hataGoster($('#urunHata'), 'Yalnız JPG, PNG ya da WEBP seçebilirsin.');
  hataGoster($('#urunHata'), '');
  try {
    const resim = await createImageBitmap(dosya);
    const kenar = Math.min(resim.width, resim.height);
    const boyut = Math.min(800, kenar);
    const tuval = el('canvas', { width: String(boyut), height: String(boyut) });
    tuval.getContext('2d').drawImage(resim, (resim.width - kenar) / 2, (resim.height - kenar) / 2, kenar, kenar, 0, 0, boyut, boyut);
    let veriUrl = tuval.toDataURL('image/webp', 0.85);
    if (!veriUrl.startsWith('data:image/webp')) veriUrl = tuval.toDataURL('image/jpeg', 0.85);
    const v = await api('gorsel', { method: 'POST', govde: { veri: veriUrl } });
    gorsel = v.gorsel;
    onizle();
  } catch (h) {
    if (!(h instanceof OturumYok)) hataGoster($('#urunHata'), h.message || 'Fotoğraf okunamadı.');
  }
});
$('#dFotoKaldir').addEventListener('click', () => { gorsel = ''; onizle(); });

uf.addEventListener('submit', async (e) => {
  e.preventDefault();
  const hata = $('#urunHata');
  const stok = $$('.stok-satir').map((s) => ({ beden: $('[data-beden]', s).value.trim(), adet: $('[data-adet]', s).value }));
  const eksik = [];
  if (!uf.ad.value.trim()) eksik.push('ürün adı');
  if (!uf.kategori.value) eksik.push('kategori');
  if (!uf.fiyat.value.trim()) eksik.push('fiyat');
  if (eksik.length) return hataGoster(hata, `Eksik: ${eksik.join(', ')}.`);
  if (!stok.length) return hataGoster(hata, 'En az bir beden ekle.');
  if (stok.some((s) => !s.beden)) return hataGoster(hata, 'Boş beden adı var; doldur ya da satırı kaldır.');
  const govde = {
    ad: uf.ad.value, aciklama: uf.aciklama.value, kategori: uf.kategori.value, yasGrubu: uf.yasGrubu.value,
    cinsiyet: uf.cinsiyet.value, fiyat: uf.fiyat.value.trim(), indirimli: uf.indirimli.value.trim() || null,
    cizim: uf.cizim.value, renk: uf.renk.value, desen: uf.desen.value, gorsel, yeni: uf.yeni.checked, aktif: uf.aktif.checked, stok,
  };
  $('#urunKaydet').disabled = true;
  try {
    if (duzenlenen) await api('urun/' + encodeURIComponent(duzenlenen), { method: 'PUT', govde });
    else await api('urun', { method: 'POST', govde });
    dlg.close();
    bildir(duzenlenen ? 'Ürün güncellendi' : 'Ürün eklendi');
    await yenile();
  } catch (h) {
    if (!(h instanceof OturumYok)) hataGoster(hata, h.message);
  } finally {
    $('#urunKaydet').disabled = false;
  }
});

// ---------------------------------------------------------------- kategoriler
function kategorileriCiz() {
  const say = (id) => veri.urunler.filter((u) => u.kategori === id).length;
  $('#kategoriListe').replaceChildren(...veri.kategoriler.map((k, i) => {
    const giris = el('input', { value: k.ad, maxlength: '40', 'aria-label': 'Kategori adı' });
    const kaydet = async (govde, mesaj) => {
      try { await api('kategori/' + encodeURIComponent(k.id), { method: 'PUT', govde }); if (mesaj) bildir(mesaj); await yenile(); }
      catch (h) { if (!(h instanceof OturumYok)) { bildir(h.message); giris.value = k.ad; } }
    };
    giris.addEventListener('change', () => { if (giris.value.trim() && giris.value.trim() !== k.ad) kaydet({ ad: giris.value.trim() }, 'Kategori adı değişti'); });
    giris.addEventListener('keydown', (e) => { if (e.key === 'Enter') giris.blur(); });
    return el('li', {},
      giris,
      el('small', { text: `${say(k.id)} ürün` }),
      el('button', { class: 'ikon-dugme', type: 'button', disabled: i === 0, 'aria-label': 'Yukarı taşı', onclick: () => kaydet({ yon: -1 }) }, '↑'),
      el('button', { class: 'ikon-dugme', type: 'button', disabled: i === veri.kategoriler.length - 1, 'aria-label': 'Aşağı taşı', onclick: () => kaydet({ yon: 1 }) }, '↓'),
      el('button', { class: 'ikon-dugme sil-d', type: 'button', onclick: async () => {
        if (!(await onayla(`"${k.ad}" kategorisi silinsin mi?`))) return;
        try { await api('kategori/' + encodeURIComponent(k.id), { method: 'DELETE' }); bildir('Kategori silindi'); await yenile(); }
        catch (h) { if (!(h instanceof OturumYok)) bildir(h.message); }
      } }, 'Sil'));
  }));
}
$('#kategoriForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ad = e.target.ad.value.trim();
  if (!ad) return;
  try {
    await api('kategori', { method: 'POST', govde: { ad } });
    e.target.reset();
    bildir(`"${ad}" eklendi`);
    await yenile();
  } catch (h) { if (!(h instanceof OturumYok)) bildir(h.message); }
});

// ---------------------------------------------------------------- ayarlar
function ayarlariDoldur() {
  const f = $('#ayarForm');
  if (f.contains(document.activeElement)) return; // yazarken üzerine yazma
  for (const ad of ['magazaAdi', 'slogan', 'duyuru', 'whatsapp']) f[ad].value = veri.ayarlar[ad] ?? '';
  f.kargoUcreti.value = sayiYaz(veri.ayarlar.kargoUcreti);
  f.ucretsizKargo.value = sayiYaz(veri.ayarlar.ucretsizKargo);
}
$('#ayarForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const govde = Object.fromEntries(['magazaAdi', 'slogan', 'duyuru', 'whatsapp', 'kargoUcreti', 'ucretsizKargo'].map((a) => [a, f[a].value.trim()]));
  try {
    await api('ayarlar', { method: 'PUT', govde });
    hataGoster($('#ayarHata'), '');
    document.activeElement.blur();
    bildir('Ayarlar kaydedildi');
    await yenile();
  } catch (h) { if (!(h instanceof OturumYok)) hataGoster($('#ayarHata'), h.message); }
});
$('#sifreForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.yeni.value.length < 8) return hataGoster($('#sifreHata'), 'Yeni şifre en az 8 karakter olmalı.');
  try {
    await api('sifre', { method: 'POST', govde: { eski: f.eski.value, yeni: f.yeni.value } });
    f.reset();
    hataGoster($('#sifreHata'), '');
    bildir('Şifre değişti');
  } catch (h) { hataGoster($('#sifreHata'), h.message); }
});

// ---------------------------------------------------------------- onay penceresi
function onayla(metin) {
  const d = $('#onay');
  $('#onayMetin').textContent = metin;
  d.returnValue = '';
  d.showModal();
  return new Promise((coz) => d.addEventListener('close', () => coz(d.returnValue === 'evet'), { once: true }));
}

// ---------------------------------------------------------------- başlat
(async () => {
  try { const s = sessionStorage.getItem('mm-panel-sekme'); if (s && $(`[data-sekme="${s}"]`)) sekmeAc(s); } catch { /* yok say */ }
  try {
    const d = await (await fetch('/api/yonetim/durum', { cache: 'no-store' })).json();
    if (d.giris) await panelAc();
    else girisGoster(!d.kurulu);
  } catch {
    girisGoster(false, 'Sunucuya ulaşılamadı. Sunucunun açık olduğundan emin olup sayfayı yenile.');
  }
})();
