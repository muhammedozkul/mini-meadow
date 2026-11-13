import { cizimSvg, urunGorseli, acik } from './cizimler.js';

const SEPET_ANAHTAR = 'minimeadow-sepet';
const $ = (s) => document.querySelector(s);
const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
const para = (n) => tl.format(n);
const kurus = (n) => Math.round(Number(n) * 100);

const durum = {
  ayarlar: {}, kategoriler: [], urunler: [],
  filtre: { kategori: 'hepsi', yas: 'hepsi', cinsiyet: 'hepsi', ara: '', sira: 'onerilen', stokta: false },
  sepet: [],
  secili: null, // açık ürün penceresi: { urun, beden, adet }
};

// ---------------------------------------------------------------- yardımcılar
const satis = (u) => (u.indirimli != null && u.indirimli < u.fiyat ? u.indirimli : u.fiyat);
const toplamStok = (u) => u.stok.reduce((t, s) => t + s.adet, 0);
const urunBul = (id) => durum.urunler.find((u) => u.id === id);
const kategoriAdi = (id) => durum.kategoriler.find((k) => k.id === id)?.ad ?? '';
const kucult = (s) => s.toLocaleLowerCase('tr-TR');

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
  bildirimZaman = setTimeout(() => b.classList.remove('gorunur'), 2400);
}

function fiyatHtml(u) {
  const kap = el('div', { class: 'fiyat' });
  const s = satis(u);
  if (s < u.fiyat) kap.append(el('b', { class: 'indirimde', text: para(s) }), el('s', { text: para(u.fiyat) }));
  else kap.append(el('b', { text: para(u.fiyat) }));
  return kap;
}

// ---------------------------------------------------------------- veri
async function yukle() {
  try {
    const cevap = await fetch('/api/magaza', { cache: 'no-store' });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || 'Ürünler yüklenemedi.');
    Object.assign(durum, { ayarlar: veri.ayarlar, kategoriler: veri.kategoriler, urunler: veri.urunler });
  } catch (h) {
    $('#urunler').replaceChildren(el('p', { class: 'yukleme-hata', text: '⚠️ ' + (h.message || 'Sunucuya ulaşılamadı.') + ' Sunucunun açık olduğundan emin olup sayfayı yenileyin.' }));
    return false;
  }
  return true;
}

function ayarlariUygula() {
  const a = durum.ayarlar;
  if (a.duyuru) { $('#duyuru').textContent = a.duyuru; $('#duyuru').hidden = false; }
  for (const s of ['#logoAd', '#altAd']) $(s).textContent = a.magazaAdi;
  document.title = `${a.magazaAdi} · Çocuk Giyim`;
  $('#altSlogan').textContent = a.slogan || '';
  $('#kargoBilgi').textContent = 'Ücretsiz kargo';
  $('#kargoAlt').textContent = `${para(a.ucretsizKargo)} ve üzeri siparişlerde`;
}

function heroCiz() {
  const parcalar = [['p1', 'elbise', '#ff9db5', 'puantiye'], ['p2', 'bere', '#ffc94d', 'cizgili'], ['p3', 'body', '#7cc4f2', 'yildiz']];
  for (const [sinif, c, r, d] of parcalar) {
    const p = el('div', { class: 'hero-parca ' + sinif });
    p.innerHTML = cizimSvg(c, r, d);
    $('#heroSanat').append(p);
  }
}

// ---------------------------------------------------------------- katalog
function kategorileriCiz() {
  const kap = $('#kategoriCipler');
  const say = (id) => durum.urunler.filter((u) => id === 'hepsi' || u.kategori === id).length;
  const liste = [{ id: 'hepsi', ad: 'Tümü' }, ...durum.kategoriler.filter((k) => say(k.id) > 0)];
  kap.replaceChildren(...liste.map((k) => el('button', {
    class: 'cip', type: 'button', 'aria-pressed': String(durum.filtre.kategori === k.id),
    onclick: () => { durum.filtre.kategori = k.id; kategorileriCiz(); urunleriCiz(); },
  }, `${k.ad} `, el('small', { text: `(${say(k.id)})` }))));
}

function filtrele() {
  const f = durum.filtre;
  const ara = kucult(f.ara.trim());
  let liste = durum.urunler.filter((u) =>
    (f.kategori === 'hepsi' || u.kategori === f.kategori) &&
    (f.yas === 'hepsi' || u.yasGrubu === f.yas) &&
    (f.cinsiyet === 'hepsi' || u.cinsiyet === f.cinsiyet || (f.cinsiyet !== 'unisex' && u.cinsiyet === 'unisex')) &&
    (!f.stokta || toplamStok(u) > 0) &&
    (!ara || kucult(`${u.ad} ${u.aciklama} ${kategoriAdi(u.kategori)}`).includes(ara)));
  const sirala = {
    onerilen: (a, b) => (toplamStok(b) > 0) - (toplamStok(a) > 0) || b.yeni - a.yeni,
    yeni: (a, b) => b.yeni - a.yeni,
    artan: (a, b) => satis(a) - satis(b),
    azalan: (a, b) => satis(b) - satis(a),
    indirim: (a, b) => (b.fiyat - satis(b)) / b.fiyat - (a.fiyat - satis(a)) / a.fiyat,
  }[f.sira];
  return liste.sort(sirala);
}

function urunKarti(u) {
  const stok = toplamStok(u);
  const s = satis(u);
  const rozetler = el('div', { class: 'rozetler' });
  if (u.yeni) rozetler.append(el('span', { class: 'etiket yeni', text: 'Yeni' }));
  if (s < u.fiyat) rozetler.append(el('span', { class: 'etiket indirim', text: `%${Math.round((1 - s / u.fiyat) * 100)}` }));
  if (stok > 0 && stok <= 3) rozetler.append(el('span', { class: 'etiket az', text: 'Son ürünler' }));

  const gorsel = el('button', { class: 'urun-gorsel', type: 'button', 'aria-label': `${u.ad} ayrıntıları`, onclick: () => urunAc(u.id) });
  gorsel.style.background = u.gorsel ? '#f6f1ea' : acik(u.renk, 0.84);
  gorsel.append(urunGorseli(u));

  const bedenler = u.stok.filter((x) => x.adet > 0).map((x) => x.beden);
  return el('article', { class: 'urun' + (stok === 0 ? ' tukendi' : '') },
    rozetler, gorsel,
    el('div', { class: 'urun-bilgi' },
      el('span', { class: 'urun-kat', text: kategoriAdi(u.kategori) }),
      el('h3', { text: u.ad }),
      fiyatHtml(u),
      el('div', { class: 'urun-alt' },
        el('span', { class: 'beden-ozet', text: stok ? `${bedenler.length} beden` : 'Stokta yok' }),
        el('button', { class: 'mini-dugme', type: 'button', disabled: stok === 0, onclick: () => urunAc(u.id) }, stok ? 'Beden seç' : 'Tükendi'))));
}

function urunleriCiz() {
  const liste = filtrele();
  $('#urunler').replaceChildren(...liste.map(urunKarti));
  $('#bosSonuc').hidden = liste.length > 0;
  $('#sonucSayi').textContent = `${liste.length} ürün`;
}

function filtreleriBagla() {
  const f = durum.filtre;
  let araZaman;
  $('#arama').addEventListener('input', (e) => {
    clearTimeout(araZaman);
    araZaman = setTimeout(() => { f.ara = e.target.value; urunleriCiz(); }, 150);
  });
  $('#yasSec').addEventListener('change', (e) => { f.yas = e.target.value; urunleriCiz(); });
  $('#cinsiyetSec').addEventListener('change', (e) => { f.cinsiyet = e.target.value; urunleriCiz(); });
  $('#siraSec').addEventListener('change', (e) => { f.sira = e.target.value; urunleriCiz(); });
  $('#stoktaSec').addEventListener('change', (e) => { f.stokta = e.target.checked; urunleriCiz(); });
  $('#filtreSifirla').addEventListener('click', () => {
    Object.assign(f, { kategori: 'hepsi', yas: 'hepsi', cinsiyet: 'hepsi', ara: '', stokta: false });
    $('#arama').value = ''; $('#yasSec').value = 'hepsi'; $('#cinsiyetSec').value = 'hepsi'; $('#stoktaSec').checked = false;
    kategorileriCiz(); urunleriCiz();
  });
  for (const a of document.querySelectorAll('.menu a[data-yas]')) {
    a.addEventListener('click', () => { f.yas = a.dataset.yas; $('#yasSec').value = f.yas; urunleriCiz(); });
  }
}

// ---------------------------------------------------------------- ürün penceresi
function sepettekiAdet(id, beden) {
  return durum.sepet.find((k) => k.urunId === id && k.beden === beden)?.adet ?? 0;
}

function urunAc(id) {
  const u = urunBul(id);
  if (!u) return;
  const ilkUygun = u.stok.filter((s) => s.adet > 0);
  durum.secili = { urun: u, beden: ilkUygun.length === 1 ? ilkUygun[0].beden : null, adet: 1 };
  $('#pGorsel').replaceChildren(urunGorseli(u));
  $('#pGorsel').style.background = u.gorsel ? '#f6f1ea' : acik(u.renk, 0.84);
  $('#pKat').textContent = `${kategoriAdi(u.kategori)} · ${u.yasGrubu === 'bebek' ? 'Bebek' : 'Çocuk'}`;
  $('#pAd').textContent = u.ad;
  $('#pFiyat').replaceChildren(...fiyatHtml(u).childNodes);
  $('#pAcik').textContent = u.aciklama;
  pencereGuncelle();
  $('#urunPencere').showModal();
  document.body.classList.add('kilitli');
}

function pencereGuncelle() {
  const { urun: u, beden, adet } = durum.secili;
  $('#pBedenler').replaceChildren(...u.stok.map((s) => el('button', {
    class: 'beden-secim', type: 'button', disabled: s.adet === 0, 'aria-pressed': String(s.beden === beden),
    title: s.adet === 0 ? 'Bu beden tükendi' : '',
    onclick: () => { durum.secili.beden = s.beden; durum.secili.adet = 1; pencereGuncelle(); },
  }, s.beden)));
  const s = u.stok.find((x) => x.beden === beden);
  const kalan = s ? s.adet - sepettekiAdet(u.id, beden) : 0;
  const not = $('#pBedenNot');
  if (!s) not.textContent = toplamStok(u) ? '' : 'Bu ürün şu an tükendi.';
  else if (kalan <= 0) not.textContent = 'Bu bedenin stoktaki tamamı zaten sepetinde.';
  else if (s.adet <= 3) not.textContent = `Bu bedenden son ${s.adet} ürün!`;
  else not.textContent = '';
  $('#pAdet').textContent = adet;
  $('#pAzalt').disabled = adet <= 1;
  $('#pArttir').disabled = !s || adet >= kalan;
  const ekle = $('#pEkle');
  ekle.disabled = !s || kalan <= 0;
  ekle.textContent = !s ? 'Önce beden seç' : kalan <= 0 ? 'Sepette en fazla' : `Sepete ekle · ${para((satis(u) * 100 * adet) / 100)}`;
}

function pencereKapat() {
  $('#urunPencere').close();
}

function pencereyiBagla() {
  const p = $('#urunPencere');
  p.addEventListener('close', () => document.body.classList.remove('kilitli'));
  p.addEventListener('click', (e) => { if (e.target === p) pencereKapat(); }); // arka plana tıklama
  p.querySelector('[data-kapat]').addEventListener('click', pencereKapat);
  $('#pAzalt').addEventListener('click', () => { durum.secili.adet = Math.max(1, durum.secili.adet - 1); pencereGuncelle(); });
  $('#pArttir').addEventListener('click', () => { durum.secili.adet += 1; pencereGuncelle(); });
  $('#pEkle').addEventListener('click', () => {
    const { urun: u, beden, adet } = durum.secili;
    sepeteEkle(u.id, beden, adet);
    pencereKapat();
    bildir(`${u.ad} (${beden}) sepete eklendi`);
  });
}

// ---------------------------------------------------------------- sepet
function sepetOku() {
  try {
    const v = JSON.parse(localStorage.getItem(SEPET_ANAHTAR) || '[]');
    return Array.isArray(v) ? v.filter((k) => k && typeof k.urunId === 'string' && typeof k.beden === 'string' && k.adet > 0) : [];
  } catch { return []; }
}
function sepetYaz() {
  try { localStorage.setItem(SEPET_ANAHTAR, JSON.stringify(durum.sepet)); } catch { /* gizli pencere */ }
}

/** Sepeti güncel ürün ve stoklarla karşılaştırır: kalkan ürünü çıkarır, stoğu aşan adedi düşürür. */
function sepetiDenetle() {
  const notlar = [];
  durum.sepet = durum.sepet.filter((k) => {
    const u = urunBul(k.urunId);
    const s = u?.stok.find((x) => x.beden === k.beden);
    if (!u || !s || s.adet === 0) { notlar.push(`${u?.ad ?? 'Bir ürün'} ${k.beden ? '(' + k.beden + ')' : ''} artık satışta değil, sepetten çıkarıldı.`); return false; }
    if (k.adet > s.adet) { k.adet = s.adet; notlar.push(`${u.ad} (${k.beden}) için stokta ${s.adet} adet kaldı, adet düşürüldü.`); }
    return true;
  });
  sepetYaz();
  return notlar;
}

function sepeteEkle(id, beden, adet) {
  const k = durum.sepet.find((x) => x.urunId === id && x.beden === beden);
  if (k) k.adet += adet; else durum.sepet.push({ urunId: id, beden, adet });
  sepetiDenetle();
  sepetCiz();
  const r = $('#sepetSayi');
  r.classList.remove('zipla'); void r.offsetWidth; r.classList.add('zipla');
}

function tutarlar() {
  const ara = durum.sepet.reduce((t, k) => t + kurus(satis(urunBul(k.urunId))) * k.adet, 0);
  const sinir = kurus(durum.ayarlar.ucretsizKargo || 0);
  const kargo = ara === 0 || ara >= sinir ? 0 : kurus(durum.ayarlar.kargoUcreti || 0);
  return { ara, kargo, toplam: ara + kargo, sinir };
}

function sepetCiz(uyarilar = []) {
  const adet = durum.sepet.reduce((t, k) => t + k.adet, 0);
  $('#sepetSayi').textContent = adet;
  $('#sepetSayi').hidden = adet === 0;
  $('#sepetBaslik').textContent = adet ? `Sepetim (${adet})` : 'Sepetim';

  const bos = durum.sepet.length === 0;
  $('#sepetBos').hidden = !bos;
  $('#ozet').hidden = bos;
  $('#kargoCubuk').hidden = bos;

  $('#kalemler').replaceChildren(...durum.sepet.map((k) => {
    const u = urunBul(k.urunId);
    const stok = u.stok.find((x) => x.beden === k.beden).adet;
    const degistir = (yeni) => {
      if (yeni <= 0) durum.sepet = durum.sepet.filter((x) => x !== k);
      else k.adet = Math.min(yeni, stok);
      sepetYaz(); sepetCiz();
    };
    const resim = el('div', { class: 'kalem-gorsel' });
    resim.style.background = u.gorsel ? '#f6f1ea' : acik(u.renk, 0.84);
    resim.append(urunGorseli(u));
    return el('li', { class: 'kalem' }, resim,
      el('div', {},
        el('b', { text: u.ad }),
        el('small', { text: `Beden: ${k.beden}` }),
        el('div', { class: 'adet' },
          el('button', { type: 'button', 'aria-label': 'Azalt', onclick: () => degistir(k.adet - 1) }, '−'),
          el('output', { text: String(k.adet) }),
          el('button', { type: 'button', 'aria-label': 'Arttır', disabled: k.adet >= stok, onclick: () => degistir(k.adet + 1) }, '+'))),
      el('div', { class: 'kalem-sag' },
        el('b', { text: para((kurus(satis(u)) * k.adet) / 100) }),
        el('button', { class: 'sil', type: 'button', onclick: () => { degistir(0); bildir(`${u.ad} sepetten çıkarıldı`); } }, 'Kaldır')));
  }));
  if (uyarilar.length) $('#kalemler').prepend(...uyarilar.map((m) => el('li', { class: 'kalem-uyari', text: '⚠️ ' + m })));

  const t = tutarlar();
  $('#araToplam').textContent = para(t.ara / 100);
  $('#kargoTutar').textContent = t.kargo === 0 ? 'Ücretsiz' : para(t.kargo / 100);
  $('#genelToplam').textContent = para(t.toplam / 100);
  $('#formToplam').textContent = para(t.toplam / 100);
  const kalan = t.sinir - t.ara;
  $('#kargoMesaj').textContent = kalan > 0 ? `Ücretsiz kargo için ${para(kalan / 100)} daha ekle 🚚` : 'Kargon bedava! 🎉';
  $('#kargoDolu').style.width = `${Math.min(100, t.sinir ? (t.ara / t.sinir) * 100 : 100)}%`;
}

function adimGoster(ad) {
  for (const a of ['adimSepet', 'adimForm', 'adimTamam']) $('#' + a).hidden = a !== ad;
}

function sepetAc() {
  const s = $('#sepet');
  adimGoster('adimSepet');
  $('#perde').hidden = false;
  requestAnimationFrame(() => { $('#perde').classList.add('acik'); s.classList.add('acik'); });
  s.inert = false;
  s.setAttribute('aria-hidden', 'false');
  document.body.classList.add('kilitli');
  $('#sepetKapat').focus();
}

function sepetKapat() {
  const s = $('#sepet');
  s.classList.remove('acik');
  $('#perde').classList.remove('acik');
  s.inert = true;
  s.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('kilitli');
  setTimeout(() => { $('#perde').hidden = true; }, 250);
  $('#sepetAc').focus();
}

function sepetiBagla() {
  $('#sepetAc').addEventListener('click', sepetAc);
  $('#sepetKapat').addEventListener('click', sepetKapat);
  $('#perde').addEventListener('click', sepetKapat);
  for (const b of document.querySelectorAll('[data-sepet-kapat]')) b.addEventListener('click', sepetKapat);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#sepet').classList.contains('acik')) sepetKapat(); });
  $('#devamEt').addEventListener('click', () => { adimGoster('adimForm'); $('#formHata').hidden = true; $('#adimForm').ad.focus(); });
  $('#geriDon').addEventListener('click', () => adimGoster('adimSepet'));

  const form = $('#adimForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hata = $('#formHata');
    hata.hidden = true;
    const eksik = [];
    for (const ad of ['ad', 'adres']) {
      const alan = form[ad];
      const bos = !alan.value.trim();
      alan.setAttribute('aria-invalid', String(bos));
      if (bos) eksik.push(alan);
    }
    if (eksik.length) {
      hata.textContent = 'Lütfen ad soyad ve teslimat adresini yaz.';
      hata.hidden = false;
      eksik[0].focus();
      return;
    }
    const dugme = $('#gonder');
    dugme.disabled = true;
    // Pencereyi kullanıcı tıklarken açıyoruz; yoksa tarayıcı açılır pencere engelleyicisine takılır.
    const waPencere = window.open('', '_blank');
    try {
      const cevap = await fetch('/api/siparis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mini-Meadow': '1' },
        body: JSON.stringify({
          musteri: { ad: form.ad.value, telefon: form.telefon.value, adres: form.adres.value, not: form.not.value },
          kalemler: durum.sepet,
        }),
      });
      const veri = await cevap.json();
      if (!cevap.ok) {
        waPencere?.close();
        if (cevap.status === 409) { // stok değişmiş: ürünleri yenile, sepeti düzelt
          await yukle();
          const notlar = sepetiDenetle();
          urunleriCiz(); sepetCiz(notlar);
          adimGoster('adimSepet');
          bildir(veri.hata);
        } else {
          hata.textContent = veri.hata || 'Sipariş gönderilemedi.';
          hata.hidden = false;
        }
        return;
      }
      if (waPencere) { waPencere.opener = null; waPencere.location.href = veri.whatsapp; }
      $('#siparisNo').textContent = veri.no;
      $('#waLink').href = veri.whatsapp;
      $('#mesajOnizleme').textContent = veri.mesaj;
      durum.sepet = [];
      sepetYaz(); sepetCiz();
      form.reset();
      adimGoster('adimTamam');
    } catch {
      waPencere?.close();
      hata.textContent = 'Sunucuya ulaşılamadı. İnternet/sunucu bağlantısını kontrol edip tekrar dene.';
      hata.hidden = false;
    } finally {
      dugme.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- başlat
async function basla() {
  heroCiz();
  filtreleriBagla();
  pencereyiBagla();
  sepetiBagla();
  durum.sepet = sepetOku();
  if (!(await yukle())) return;
  ayarlariUygula();
  const notlar = sepetiDenetle();
  kategorileriCiz();
  urunleriCiz();
  sepetCiz(notlar);
  // Başka sekmede sepet değişirse bu sekme de güncellensin.
  window.addEventListener('storage', (e) => {
    if (e.key === SEPET_ANAHTAR) { durum.sepet = sepetOku(); sepetiDenetle(); sepetCiz(); }
  });
}

basla();
