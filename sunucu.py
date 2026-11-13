#!/usr/bin/env python3
"""Mini Meadow sunucusu: çocuk giyim mağazası + yönetim paneli (veritabanı yok).

Çalıştır:  python3 sunucu.py            (http://127.0.0.1:8772)
           python3 sunucu.py --tarayici (açılınca tarayıcıyı da açar)
Ek paket gerekmez; yalnız Python 3 standart kütüphanesi.

Veriler düz JSON dosyalarında durur (Zarif Çiçekçilik'teki gibi):
  veri/urunler.json, veri/kategoriler.json, veri/ayarlar.json  -> mağaza içeriği (git'te)
  veri/siparisler.json                                         -> gelen siparişler (git'e girmez)
  veri/gorseller/                                              -> panelden yüklenen ürün fotoğrafları
Panel şifresi .env dosyasında: YONETIM_SIFRE=...
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import threading
import time
import unicodedata
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse

KOK = Path(__file__).resolve().parent
SAYFALAR = KOK / "public"
VERI = KOK / "veri"
GORSELLER = VERI / "gorseller"
ENV = KOK / ".env"
PORT = int(os.environ.get("MAGAZA_PORT", "8772"))

DOSYALAR = {
    "urunler": VERI / "urunler.json",
    "kategoriler": VERI / "kategoriler.json",
    "ayarlar": VERI / "ayarlar.json",
    "siparisler": VERI / "siparisler.json",
}

OTURUM_SURESI = 8 * 3600
OTURUM_COOKIE = "mm_oturum"
ISTEK_BASLIGI = "X-Mini-Meadow"  # veri değiştiren her istek bu başlığı taşır (başka sitelerden gelen istekleri keser)
EN_FAZLA_GOVDE = 100_000
EN_FAZLA_GORSEL = 3_000_000

CIZIMLER = {"tisort", "body", "elbise", "pantolon", "etek", "sweatshirt", "mont", "salopet", "bere", "corap"}
DESENLER = {"duz", "cizgili", "puantiye", "yildiz"}
YAS_GRUPLARI = {"bebek", "cocuk"}
CINSIYETLER = {"kiz", "erkek", "unisex"}
DURUMLAR = ["yeni", "onaylandi", "kargoda", "teslim", "iptal"]
STOK_DUSEN = {"onaylandi", "kargoda", "teslim"}
RENK_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
GORSEL_RE = re.compile(r"^[a-f0-9]{32}\.(jpg|png|webp)$")

BEBEK_BEDEN = ["0-3 ay", "3-6 ay", "6-12 ay", "12-18 ay", "18-24 ay"]
COCUK_BEDEN = ["2-3 yaş", "3-4 yaş", "4-5 yaş", "5-6 yaş", "7-8 yaş", "9-10 yaş"]

VARSAYILAN_AYARLAR = {
    "magazaAdi": "Mini Meadow",
    "slogan": "Küçük maceracılar için rahat ve renkli kıyafetler",
    "duyuru": "1.500 TL ve üzeri siparişlerde kargo bedava!",
    "whatsapp": "",
    "kargoUcreti": 89.9,
    "ucretsizKargo": 1500,
}
VARSAYILAN_KATEGORILER = ["Üst Giyim", "Alt Giyim", "Elbise & Etek", "Tulum & Body", "Dış Giyim", "Aksesuar"]
# (ad, açıklama, kategori, yaş, cinsiyet, fiyat, indirimli, çizim, renk, desen, yeni, bedenler, adetler)
ORNEK_URUNLER = [
    ("Çizgili Pamuklu Tişört", "Yumuşak penye kumaş, her gün giyilecek rahat kesim. Yıkamada şeklini korur.",
     "Üst Giyim", "cocuk", "unisex", 249.9, None, "tisort", "#7cc4f2", "cizgili", False, COCUK_BEDEN, [4, 6, 5, 3, 2, 0]),
    ("Kapüşonlu Sweatshirt", "İçi şardonlu, kanguru cepli kapüşonlu sweatshirt. Serin akşamların favorisi.",
     "Üst Giyim", "cocuk", "unisex", 449.9, None, "sweatshirt", "#3bb39a", "duz", True, COCUK_BEDEN, [2, 4, 4, 3, 1, 1]),
    ("Puantiyeli Kısa Kollu Body", "Çıtçıtlı, zarf yakalı bebek body. Kolay giydirilir, cilde dost pamuk.",
     "Tulum & Body", "bebek", "unisex", 179.9, 149.9, "body", "#ffc94d", "puantiye", False, BEBEK_BEDEN, [5, 6, 4, 2, 1]),
    ("Yıldızlı Uzun Kollu Body", "Uzun kollu, alttan çıtçıtlı body. Gece gökyüzü desenli.",
     "Tulum & Body", "bebek", "unisex", 199.9, None, "body", "#b9a7f0", "yildiz", True, BEBEK_BEDEN, [3, 3, 2, 2, 0]),
    ("Puantiyeli Yazlık Elbise", "Hafif dokuma kumaş, belde kurdele detayı. Yaz günleri için serin bir seçim.",
     "Elbise & Etek", "cocuk", "kiz", 389.9, 329.9, "elbise", "#ff9db5", "puantiye", False, COCUK_BEDEN, [2, 3, 3, 2, 1, 1]),
    ("Yıldızlı Tül Elbise", "Kat kat tül etek, astarlı gövde. Doğum günleri ve özel günler için.",
     "Elbise & Etek", "cocuk", "kiz", 459.9, None, "elbise", "#c9b6ff", "yildiz", True, COCUK_BEDEN, [1, 2, 2, 1, 1, 0]),
    ("Pileli Etek", "Lastikli bel, rahat pile kesim. Tişört ve sweatlerle kolay kombinlenir.",
     "Elbise & Etek", "cocuk", "kiz", 279.9, None, "etek", "#e86a8a", "duz", False, COCUK_BEDEN, [3, 3, 2, 2, 2, 1]),
    ("Rahat Kesim Jogger", "Lastikli paça ve bel, oyun parkının en rahat pantolonu.",
     "Alt Giyim", "cocuk", "unisex", 299.9, None, "pantolon", "#6b7a99", "duz", False, COCUK_BEDEN, [4, 5, 5, 4, 3, 2]),
    ("Fitilli Kadife Pantolon", "Yumuşak fitilli kadife, ayarlanabilir iç lastik.",
     "Alt Giyim", "cocuk", "erkek", 339.9, None, "pantolon", "#a0704f", "cizgili", False, COCUK_BEDEN, [0, 0, 0, 0, 0, 0]),
    ("Denim Salopet", "Yumuşak yıkamalı denim, ayarlanabilir askılar ve ön cep.",
     "Tulum & Body", "cocuk", "unisex", 499.9, 429.9, "salopet", "#4f7fbf", "duz", False, COCUK_BEDEN, [2, 2, 3, 2, 1, 0]),
    ("Bebek Salopet", "Bacak içi çıtçıtlı, bez değiştirmesi kolay bebek salopeti.",
     "Tulum & Body", "bebek", "unisex", 359.9, None, "salopet", "#ff7a59", "puantiye", False, BEBEK_BEDEN, [2, 3, 3, 2, 1]),
    ("Hafif Şişme Mont", "Katlanınca çantaya sığan hafif şişme mont. Rüzgâr geçirmez dış yüzey.",
     "Dış Giyim", "cocuk", "unisex", 899.9, None, "mont", "#ffb347", "duz", True, COCUK_BEDEN, [1, 2, 2, 2, 1, 1]),
    ("Puantiyeli Yağmurluk", "Su itici kumaş, kapüşonlu ve yansıtıcı şeritli yağmurluk.",
     "Dış Giyim", "cocuk", "unisex", 749.9, 649.9, "mont", "#ffd23f", "puantiye", False, COCUK_BEDEN, [2, 2, 1, 1, 0, 0]),
    ("Ponponlu Örgü Bere", "Akrilik karışımlı yumuşak örgü, kocaman ponpon.",
     "Aksesuar", "cocuk", "unisex", 149.9, None, "bere", "#ff7a59", "cizgili", False, ["Standart"], [8]),
    ("Bebek Beresi", "İnce pamuk örgü, yeni doğanlar için sıcacık.",
     "Aksesuar", "bebek", "unisex", 119.9, None, "bere", "#9fd8cb", "puantiye", False, ["0-6 ay", "6-12 ay"], [4, 3]),
    ("Renkli Çorap Seti (3'lü)", "Kaydırmaz tabanlı, pamuklu üçlü çorap seti.",
     "Aksesuar", "cocuk", "unisex", 129.9, None, "corap", "#7cc4f2", "cizgili", True,
     ["19-22", "23-26", "27-30", "31-34"], [6, 5, 4, 3]),
]

_kilit = threading.RLock()        # dosya okuma-yazma ve stok değişikliklerini sıraya sokar
_oturumlar: dict[str, float] = {}
_hatali_giris: dict[str, list[float]] = {}
_siparis_denemeleri: dict[str, list[float]] = {}


# ---------------------------------------------------------------- JSON dosyaları
def oku(ad: str):
    yol = DOSYALAR[ad]
    if not yol.exists():
        return [] if ad != "ayarlar" else dict(VARSAYILAN_AYARLAR)
    return json.loads(yol.read_text("utf-8"))


def yaz(ad: str, veri) -> None:
    """Önce geçici dosyaya yazar, sonra yerine koyar: yazım yarıda kalırsa eski dosya bozulmaz."""
    yol = DOSYALAR[ad]
    gecici = yol.with_suffix(".json.tmp")
    gecici.write_text(json.dumps(veri, ensure_ascii=False, indent=2) + "\n", "utf-8")
    os.replace(gecici, yol)


def simdi() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def kimlik_uret(ad: str, mevcut: set) -> str:
    """Addan okunur kimlik üretir: 'Çizgili Tişört' -> 'cizgili-tisort'. Ad sonra değişse de kimlik değişmez."""
    s = ad.lower().translate(str.maketrans("çğıöşü", "cgiosu"))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40] or "kayit"
    aday, n = s, 2
    while aday in mevcut:
        aday, n = f"{s}-{n}", n + 1
    return aday


def kurulum() -> None:
    VERI.mkdir(exist_ok=True)
    GORSELLER.mkdir(exist_ok=True)
    with _kilit:
        if not DOSYALAR["ayarlar"].exists():
            yaz("ayarlar", VARSAYILAN_AYARLAR)
        if not DOSYALAR["kategoriler"].exists():
            ids: set = set()
            kategoriler = []
            for ad in VARSAYILAN_KATEGORILER:
                k = kimlik_uret(ad, ids)
                ids.add(k)
                kategoriler.append({"id": k, "ad": ad})
            yaz("kategoriler", kategoriler)
        if not DOSYALAR["urunler"].exists():
            kat = {k["ad"]: k["id"] for k in oku("kategoriler")}
            urunler, ids = [], set()
            for (ad, acik, k, yas, cins, fiyat, ind, cizim, renk, desen, yeni, bedenler, adetler) in ORNEK_URUNLER:
                uid = kimlik_uret(ad, ids)
                ids.add(uid)
                urunler.append({
                    "id": uid, "ad": ad, "aciklama": acik, "kategori": kat[k], "yasGrubu": yas, "cinsiyet": cins,
                    "fiyat": fiyat, "indirimli": ind, "cizim": cizim, "renk": renk, "desen": desen, "gorsel": "",
                    "yeni": yeni, "aktif": True, "stok": [{"beden": b, "adet": a} for b, a in zip(bedenler, adetler)],
                })
            yaz("urunler", urunler)
            print("Örnek ürünler oluşturuldu:", DOSYALAR["urunler"])
        if not DOSYALAR["siparisler"].exists():
            yaz("siparisler", [])
        # Panelde yüklenip kaydedilmeden vazgeçilen fotoğrafları temizle.
        kullanilan = {u.get("gorsel") for u in oku("urunler")}
        for dosya in GORSELLER.iterdir():
            if GORSEL_RE.match(dosya.name) and dosya.name not in kullanilan:
                dosya.unlink()


# ---------------------------------------------------------------- para
def kurus(tl) -> int:
    return int(round(float(tl) * 100))


def satis_fiyati(u: dict) -> float:
    ind = u.get("indirimli")
    return ind if ind is not None and ind < u["fiyat"] else u["fiyat"]


def tl_yaz(k: int) -> str:
    s = f"{k / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s + " ₺"


# ---------------------------------------------------------------- şifre (.env) ve oturum
def env_oku() -> dict:
    sonuc = {}
    if ENV.exists():
        for satir in ENV.read_text("utf-8").splitlines():
            satir = satir.strip()
            if satir and not satir.startswith("#") and "=" in satir:
                k, _, v = satir.partition("=")
                sonuc[k.strip()] = v.strip().strip('"').strip("'")
    return sonuc


def panel_sifresi() -> str:
    """Her girişte .env yeniden okunur: şifreyi dosyadan değiştirince sunucuyu yeniden başlatmak gerekmez."""
    return env_oku().get("YONETIM_SIFRE", "")


def sifre_yaz(sifre: str) -> None:
    satirlar = ENV.read_text("utf-8").splitlines() if ENV.exists() else [
        "# Mini Meadow yönetim paneli şifresi (http://127.0.0.1:8772/yonetim). Bu dosya git'e girmez."]
    satirlar = [s for s in satirlar if not s.strip().startswith("YONETIM_SIFRE=")]
    satirlar.append(f"YONETIM_SIFRE={sifre}")
    ENV.write_text("\n".join(satirlar) + "\n", "utf-8")
    os.chmod(ENV, 0o600)


def sifre_dogru(sifre: str) -> bool:
    kayitli = panel_sifresi()
    if not kayitli:
        return False
    return hmac.compare_digest(hashlib.sha256(sifre.encode()).digest(), hashlib.sha256(kayitli.encode()).digest())


def oturum_ac() -> str:
    jeton = secrets.token_urlsafe(32)
    with _kilit:
        _oturumlar[jeton] = time.time() + OTURUM_SURESI
    return jeton


def sinirda_mi(kayitlar: dict, anahtar: str, pencere: float, sinir: int) -> bool:
    simdi_ = time.time()
    kayitlar[anahtar] = [t for t in kayitlar.get(anahtar, []) if t > simdi_ - pencere]
    return len(kayitlar[anahtar]) >= sinir


# ---------------------------------------------------------------- doğrulama
class Hata(Exception):
    def __init__(self, mesaj: str, kod: int = 400):
        super().__init__(mesaj)
        self.kod = kod


def metin(v, ad: str, en_cok: int, zorunlu: bool = False) -> str:
    s = str(v if v is not None else "").strip()
    if zorunlu and not s:
        raise Hata(f"{ad} boş olamaz.")
    if len(s) > en_cok:
        raise Hata(f"{ad} en fazla {en_cok} karakter olabilir.")
    return s


def para(v, ad: str, bos_olabilir: bool = False):
    if v in (None, ""):
        if bos_olabilir:
            return None
        raise Hata(f"{ad} girilmeli.")
    try:
        k = kurus(str(v).replace(",", "."))
    except ValueError:
        raise Hata(f"{ad} sayı olmalı.")
    if k < 0 or k > 10_000_000:
        raise Hata(f"{ad} geçersiz.")
    return k / 100 if k % 100 else k // 100  # 249.9 ya da 250 olarak saklanır


def urun_dogrula(g: dict, kategoriler: list) -> dict:
    if g.get("kategori") not in {k["id"] for k in kategoriler}:
        raise Hata("Kategori seçilmeli.")
    d = {
        "ad": metin(g.get("ad"), "Ürün adı", 80, True),
        "aciklama": metin(g.get("aciklama"), "Açıklama", 600),
        "kategori": g["kategori"],
        "yasGrubu": g.get("yasGrubu") if g.get("yasGrubu") in YAS_GRUPLARI else "cocuk",
        "cinsiyet": g.get("cinsiyet") if g.get("cinsiyet") in CINSIYETLER else "unisex",
        "fiyat": para(g.get("fiyat"), "Fiyat"),
        "indirimli": para(g.get("indirimli"), "İndirimli fiyat", True),
        "cizim": g.get("cizim") if g.get("cizim") in CIZIMLER else "tisort",
        "renk": g.get("renk") if RENK_RE.match(str(g.get("renk", ""))) else "#7cc4f2",
        "desen": g.get("desen") if g.get("desen") in DESENLER else "duz",
        "gorsel": "",
        "yeni": bool(g.get("yeni")),
        "aktif": bool(g.get("aktif", True)),
    }
    if d["indirimli"] is not None and kurus(d["indirimli"]) >= kurus(d["fiyat"]):
        raise Hata("İndirimli fiyat normal fiyattan düşük olmalı.")
    gorsel = str(g.get("gorsel") or "").removeprefix("/gorseller/")
    if gorsel and not (GORSEL_RE.match(gorsel) and (GORSELLER / gorsel).exists()):
        raise Hata("Fotoğraf bulunamadı, yeniden yükleyin.")
    d["gorsel"] = gorsel
    stok, gorulen = [], set()
    for s in g.get("stok") or []:
        b = metin(s.get("beden"), "Beden", 20, True)
        if b in gorulen:
            raise Hata(f"'{b}' bedeni iki kez yazılmış.")
        gorulen.add(b)
        try:
            a = int(s.get("adet") or 0)
        except (TypeError, ValueError):
            raise Hata(f"'{b}' stok adedi tam sayı olmalı.")
        if not 0 <= a <= 9999:
            raise Hata(f"'{b}' stok adedi 0 ile 9999 arasında olmalı.")
        stok.append({"beden": b, "adet": a})
    if not stok:
        raise Hata("En az bir beden eklenmeli.")
    if len(stok) > 20:
        raise Hata("En fazla 20 beden eklenebilir.")
    d["stok"] = stok
    return d


def disari(u: dict) -> dict:
    """Ürünü tarayıcıya gönderirken fotoğraf adını tam adrese çevirir."""
    return u | {"gorsel": ("/gorseller/" + u["gorsel"]) if u.get("gorsel") else ""}


def kullanilmayan_gorseli_sil(urunler: list, dosya: str) -> None:
    if dosya and GORSEL_RE.match(dosya) and not any(u.get("gorsel") == dosya for u in urunler):
        (GORSELLER / dosya).unlink(missing_ok=True)


# ---------------------------------------------------------------- sipariş
def siparis_olustur(g: dict) -> dict:
    m = g.get("musteri") or {}
    musteri = metin(m.get("ad"), "Ad soyad", 80, True)
    telefon = metin(m.get("telefon"), "Telefon", 25)
    if telefon and not re.fullmatch(r"[0-9 +()\-]{7,25}", telefon):
        raise Hata("Telefon numarası geçersiz.")
    adres = metin(m.get("adres"), "Teslimat adresi", 400, True)
    notlar = metin(m.get("not"), "Not", 300)
    gelen = g.get("kalemler") or []
    if not isinstance(gelen, list) or not gelen or len(gelen) > 30:
        raise Hata("Sepet boş.")
    a = oku("ayarlar")
    urunler = {u["id"]: u for u in oku("urunler") if u.get("aktif")}
    kalemler, ara = [], 0
    for k in gelen:
        if not isinstance(k, dict):
            raise Hata("Sepette geçersiz ürün var.")
        u = urunler.get(str(k.get("urunId")))
        if not u:
            raise Hata("Sepetteki bir ürün artık satışta değil, sepeti yenileyin.", 409)
        beden = str(k.get("beden") or "")
        s = next((s for s in u["stok"] if s["beden"] == beden), None)
        if not s:
            raise Hata(f"{u['ad']} için '{beden}' bedeni yok.", 409)
        try:
            adet = int(k.get("adet"))
        except (TypeError, ValueError):
            raise Hata("Adet sayı olmalı.")
        if not 1 <= adet <= 20:
            raise Hata("Adet 1 ile 20 arasında olmalı.")
        if adet > s["adet"]:
            raise Hata(f"{u['ad']} ({beden}) için stokta {s['adet']} adet var.", 409)
        birim = kurus(satis_fiyati(u))
        kalemler.append({"urunId": u["id"], "ad": u["ad"], "beden": beden, "adet": adet,
                         "birim": birim / 100, "tutar": birim * adet / 100})
        ara += birim * adet
    kargo = 0 if ara >= kurus(a.get("ucretsizKargo", 0)) else kurus(a.get("kargoUcreti", 0))
    toplam = ara + kargo
    siparisler = oku("siparisler")
    sira = max((s.get("sira", 0) for s in siparisler), default=0) + 1
    no = f"MM-{datetime.now():%y%m%d}-{sira:04d}"
    siparisler.insert(0, {
        "sira": sira, "no": no, "tarih": simdi(), "musteri": musteri, "telefon": telefon, "adres": adres,
        "not": notlar, "kalemler": kalemler, "araToplam": ara / 100, "kargo": kargo / 100,
        "toplam": toplam / 100, "durum": "yeni", "stokDusuldu": False,
    })
    yaz("siparisler", siparisler)

    satirlar = [f"Merhaba {a.get('magazaAdi') or 'Mini Meadow'}! Sipariş vermek istiyorum.", "", f"Sipariş no: {no}"]
    for k in kalemler:
        satirlar.append(f"• {k['ad']} — {k['beden']} × {k['adet']} = {tl_yaz(kurus(k['tutar']))}")
    satirlar += ["", f"Ara toplam: {tl_yaz(ara)}", f"Kargo: {'Ücretsiz' if kargo == 0 else tl_yaz(kargo)}",
                 f"Toplam: {tl_yaz(toplam)}", "", f"Ad soyad: {musteri}"]
    if telefon:
        satirlar.append(f"Telefon: {telefon}")
    satirlar.append(f"Adres: {adres}")
    if notlar:
        satirlar.append(f"Not: {notlar}")
    mesaj = "\n".join(satirlar)
    numara = re.sub(r"\D", "", str(a.get("whatsapp", "")))
    link = f"https://wa.me/{numara}?text={quote(mesaj)}" if numara else f"https://wa.me/?text={quote(mesaj)}"
    return {"no": no, "mesaj": mesaj, "whatsapp": link, "toplam": toplam / 100}


def siparis_durum_degistir(no: str, durum: str) -> None:
    if durum not in DURUMLAR:
        raise Hata("Geçersiz durum.")
    siparisler = oku("siparisler")
    sp = next((s for s in siparisler if s["no"] == no), None)
    if not sp:
        raise Hata("Sipariş bulunamadı.", 404)
    urunler = oku("urunler")
    bul = {u["id"]: u for u in urunler}

    def stok_kaydi(k):
        u = bul.get(k["urunId"])
        return next((s for s in u["stok"] if s["beden"] == k["beden"]), None) if u else None

    if durum in STOK_DUSEN and not sp["stokDusuldu"]:
        eksik = []
        for k in sp["kalemler"]:
            s = stok_kaydi(k)
            if not s or s["adet"] < k["adet"]:
                eksik.append(f"{k['ad']} ({k['beden']}): stokta {s['adet'] if s else 0}, istenen {k['adet']}")
        if eksik:
            raise Hata("Stok yetmiyor: " + "; ".join(eksik), 409)
        for k in sp["kalemler"]:
            stok_kaydi(k)["adet"] -= k["adet"]
        sp["stokDusuldu"] = True
        yaz("urunler", urunler)
    elif durum not in STOK_DUSEN and sp["stokDusuldu"]:
        for k in sp["kalemler"]:  # iptal ya da 'yeni'ye dönüş: stoğu geri koy (ürün/beden silinmişse atla)
            s = stok_kaydi(k)
            if s:
                s["adet"] += k["adet"]
        sp["stokDusuldu"] = False
        yaz("urunler", urunler)
    sp["durum"] = durum
    yaz("siparisler", siparisler)


def magaza_ayarlari(a: dict, panel: bool = False) -> dict:
    sonuc = {k: a.get(k, VARSAYILAN_AYARLAR[k]) for k in ("magazaAdi", "slogan", "duyuru", "kargoUcreti", "ucretsizKargo")}
    if panel:
        sonuc["whatsapp"] = a.get("whatsapp", "")
    return sonuc


# ---------------------------------------------------------------- HTTP
class Isleyici(SimpleHTTPRequestHandler):
    server_version = "MiniMeadow/1.0"

    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(SAYFALAR), **k)

    def log_message(self, fmt, *args):
        if args and "/api/" in str(args[0]):
            sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; img-src 'self' data: blob:; "
                         "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                         "font-src 'self' https://fonts.gstatic.com; script-src 'self'; "
                         "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
        super().end_headers()

    def json_gonder(self, veri, kod=200, cerez: str | None = None):
        govde = json.dumps(veri, ensure_ascii=False).encode()
        self.send_response(kod)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(govde)))
        if cerez is not None:
            self.send_header("Set-Cookie", cerez)
        self.end_headers()
        self.wfile.write(govde)

    def govde_oku(self, sinir=EN_FAZLA_GOVDE) -> dict:
        try:
            boy = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise Hata("Geçersiz istek.")
        if boy > sinir:
            raise Hata("İstek çok büyük.", 413)
        try:
            veri = json.loads(self.rfile.read(boy) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise Hata("Geçersiz JSON.")
        if not isinstance(veri, dict):
            raise Hata("Geçersiz istek.")
        return veri

    def jeton(self) -> str:
        for parca in (self.headers.get("Cookie") or "").split(";"):
            ad, _, deger = parca.strip().partition("=")
            if ad == OTURUM_COOKIE:
                return deger
        return ""

    def giriste_mi(self) -> bool:
        j = self.jeton()
        with _kilit:
            bitis = _oturumlar.get(j)
            if bitis and bitis > time.time():
                return True
            _oturumlar.pop(j, None)
        return False

    def cerez(self, deger: str, omur: int = OTURUM_SURESI) -> str:
        return f"{OTURUM_COOKIE}={deger}; Path=/; HttpOnly; SameSite=Strict; Max-Age={omur}"

    # --- yönlendirme
    def do_GET(self):
        yol = urlparse(self.path).path
        if yol.startswith("/api/"):
            return self.api("GET", yol)
        if yol.startswith("/gorseller/"):
            ad = yol.removeprefix("/gorseller/")
            dosya = GORSELLER / ad
            if not GORSEL_RE.match(ad) or not dosya.is_file():
                return self.send_error(404)
            veri = dosya.read_bytes()
            self.send_response(200)
            tur = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[ad.rsplit(".", 1)[1]]
            self.send_header("Content-Type", tur)
            self.send_header("Content-Length", str(len(veri)))
            self.end_headers()
            return self.wfile.write(veri)
        if yol in ("/yonetim", "/yonetim/"):
            self.path = "/yonetim.html"
        return super().do_GET()

    def do_HEAD(self):
        if urlparse(self.path).path.startswith(("/api/", "/gorseller/")):
            return self.send_error(405)
        return super().do_HEAD()

    def do_POST(self):
        self.api("POST", urlparse(self.path).path)

    def do_PUT(self):
        self.api("PUT", urlparse(self.path).path)

    def do_DELETE(self):
        self.api("DELETE", urlparse(self.path).path)

    def api(self, yontem: str, yol: str):
        try:
            if yontem != "GET":
                if self.headers.get(ISTEK_BASLIGI) != "1":
                    raise Hata("İstek reddedildi.", 403)
                origin = self.headers.get("Origin")
                if origin and urlparse(origin).netloc != self.headers.get("Host"):
                    raise Hata("İstek reddedildi.", 403)
            if yol.startswith("/api/yonetim/"):
                return self.yonetim_api(yontem, yol.removeprefix("/api/yonetim/").strip("/"))
            return self.genel_api(yontem, yol)
        except Hata as h:
            self.json_gonder({"hata": str(h)}, h.kod)
        except json.JSONDecodeError as e:
            self.json_gonder({"hata": f"Veri dosyası bozuk ({e.msg}, satır {e.lineno}). JSON dosyasını düzeltin."}, 500)
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.json_gonder({"hata": "Sunucu hatası: " + type(e).__name__}, 500)

    def genel_api(self, yontem: str, yol: str):
        if yontem == "GET" and yol == "/api/magaza":
            with _kilit:
                return self.json_gonder({
                    "ayarlar": magaza_ayarlari(oku("ayarlar")),
                    "kategoriler": oku("kategoriler"),
                    "urunler": [disari(u) for u in oku("urunler") if u.get("aktif")],
                })
        if yontem == "POST" and yol == "/api/siparis":
            ip = self.client_address[0]
            with _kilit:
                if sinirda_mi(_siparis_denemeleri, ip, 600, 10):
                    raise Hata("Çok fazla sipariş denemesi, biraz sonra tekrar deneyin.", 429)
                _siparis_denemeleri[ip].append(time.time())
            g = self.govde_oku()
            with _kilit:
                return self.json_gonder(siparis_olustur(g), 201)
        raise Hata("Bulunamadı.", 404)

    def yonetim_api(self, yontem: str, yol: str):
        ip = self.client_address[0]
        if yontem == "GET" and yol == "durum":
            return self.json_gonder({"kurulu": bool(panel_sifresi()), "giris": self.giriste_mi()})
        if yontem == "POST" and yol == "kurulum":
            sifre = str(self.govde_oku().get("sifre") or "")
            with _kilit:
                if panel_sifresi():
                    raise Hata("Şifre zaten belirlenmiş.", 409)
                if len(sifre) < 8 or any(c in sifre for c in "\n\r"):
                    raise Hata("Şifre en az 8 karakter olmalı.")
                sifre_yaz(sifre)
            return self.json_gonder({"tamam": True}, cerez=self.cerez(oturum_ac()))
        if yontem == "POST" and yol == "giris":
            with _kilit:
                if sinirda_mi(_hatali_giris, ip, 300, 5):
                    raise Hata("Çok fazla hatalı deneme. 5 dakika sonra tekrar deneyin.", 429)
            sifre = str(self.govde_oku().get("sifre") or "")
            if not panel_sifresi():
                raise Hata("Panel şifresi belirlenmemiş.", 503)
            if not sifre_dogru(sifre):
                with _kilit:
                    _hatali_giris.setdefault(ip, []).append(time.time())
                time.sleep(0.4)
                raise Hata("Şifre yanlış.", 401)
            return self.json_gonder({"tamam": True}, cerez=self.cerez(oturum_ac()))
        if yontem == "POST" and yol == "cikis":
            with _kilit:
                _oturumlar.pop(self.jeton(), None)
            return self.json_gonder({"tamam": True}, cerez=self.cerez("", 0))

        if not self.giriste_mi():
            raise Hata("Oturum kapalı, yeniden giriş yapın.", 401)

        kaynak, _, kimlik = yol.partition("/")

        if yontem == "GET" and kaynak == "veri":
            with _kilit:
                return self.json_gonder({
                    "ayarlar": magaza_ayarlari(oku("ayarlar"), panel=True),
                    "kategoriler": oku("kategoriler"),
                    "urunler": [disari(u) for u in oku("urunler")],
                    "siparisler": oku("siparisler"),
                })

        if kaynak == "urun":
            g = self.govde_oku() if yontem in ("POST", "PUT") else {}
            with _kilit:
                urunler = oku("urunler")
                if yontem == "POST" and not kimlik:
                    d = urun_dogrula(g, oku("kategoriler"))
                    d = {"id": kimlik_uret(d["ad"], {u["id"] for u in urunler})} | d
                    urunler.insert(0, d)
                    yaz("urunler", urunler)
                    return self.json_gonder({"id": d["id"]}, 201)
                i = next((i for i, u in enumerate(urunler) if u["id"] == kimlik), None)
                if i is None:
                    raise Hata("Ürün bulunamadı.", 404)
                eski = urunler[i]
                if yontem == "PUT":
                    if set(g) == {"aktif"}:  # listeden hızlı aç/kapa
                        eski["aktif"] = bool(g["aktif"])
                    else:
                        urunler[i] = {"id": eski["id"]} | urun_dogrula(g, oku("kategoriler"))
                    yaz("urunler", urunler)
                    kullanilmayan_gorseli_sil(urunler, eski.get("gorsel", ""))
                    return self.json_gonder({"tamam": True})
                if yontem == "DELETE":
                    urunler.pop(i)
                    yaz("urunler", urunler)
                    kullanilmayan_gorseli_sil(urunler, eski.get("gorsel", ""))
                    return self.json_gonder({"tamam": True})

        if kaynak == "kategori":
            g = self.govde_oku() if yontem in ("POST", "PUT") else {}
            with _kilit:
                kategoriler = oku("kategoriler")
                if yontem == "POST" and not kimlik:
                    ad = metin(g.get("ad"), "Kategori adı", 40, True)
                    if any(k["ad"].lower() == ad.lower() for k in kategoriler):
                        raise Hata("Bu adda bir kategori zaten var.", 409)
                    kategoriler.append({"id": kimlik_uret(ad, {k["id"] for k in kategoriler}), "ad": ad})
                    yaz("kategoriler", kategoriler)
                    return self.json_gonder({"tamam": True}, 201)
                i = next((i for i, k in enumerate(kategoriler) if k["id"] == kimlik), None)
                if i is None:
                    raise Hata("Kategori bulunamadı.", 404)
                if yontem == "PUT":
                    if "ad" in g:
                        ad = metin(g.get("ad"), "Kategori adı", 40, True)
                        if any(k["ad"].lower() == ad.lower() and k["id"] != kimlik for k in kategoriler):
                            raise Hata("Bu adda bir kategori zaten var.", 409)
                        kategoriler[i]["ad"] = ad
                    if g.get("yon") in (-1, 1):  # sıra değiştir
                        j = i + g["yon"]
                        if 0 <= j < len(kategoriler):
                            kategoriler[i], kategoriler[j] = kategoriler[j], kategoriler[i]
                    yaz("kategoriler", kategoriler)
                    return self.json_gonder({"tamam": True})
                if yontem == "DELETE":
                    n = sum(1 for u in oku("urunler") if u["kategori"] == kimlik)
                    if n:
                        raise Hata(f"Bu kategoride {n} ürün var. Önce ürünleri başka kategoriye taşıyın.", 409)
                    kategoriler.pop(i)
                    yaz("kategoriler", kategoriler)
                    return self.json_gonder({"tamam": True})

        if kaynak == "siparis" and kimlik:
            with _kilit:
                if yontem == "PUT":
                    siparis_durum_degistir(kimlik, str(self.govde_oku().get("durum")))
                    return self.json_gonder({"tamam": True})
                if yontem == "DELETE":
                    siparisler = oku("siparisler")
                    sp = next((s for s in siparisler if s["no"] == kimlik), None)
                    if not sp:
                        raise Hata("Sipariş bulunamadı.", 404)
                    if sp["durum"] != "iptal":
                        raise Hata("Yalnız iptal edilmiş siparişler silinebilir.", 409)
                    siparisler.remove(sp)
                    yaz("siparisler", siparisler)
                    return self.json_gonder({"tamam": True})

        if kaynak == "ayarlar" and yontem == "PUT":
            g = self.govde_oku()
            numara = re.sub(r"\D", "", str(g.get("whatsapp") or ""))
            if numara and not 10 <= len(numara) <= 15:
                raise Hata("WhatsApp numarası ülke koduyla birlikte 10-15 rakam olmalı (örn. 90 5xx xxx xx xx).")
            yeni = {
                "magazaAdi": metin(g.get("magazaAdi"), "Mağaza adı", 40, True),
                "slogan": metin(g.get("slogan"), "Slogan", 120),
                "duyuru": metin(g.get("duyuru"), "Duyuru", 140),
                "whatsapp": numara,
                "kargoUcreti": para(g.get("kargoUcreti"), "Kargo ücreti"),
                "ucretsizKargo": para(g.get("ucretsizKargo"), "Ücretsiz kargo sınırı"),
            }
            with _kilit:
                yaz("ayarlar", yeni)
            return self.json_gonder({"tamam": True})

        if kaynak == "sifre" and yontem == "POST":
            g = self.govde_oku()
            yeni_sifre = str(g.get("yeni") or "")
            if not sifre_dogru(str(g.get("eski") or "")):
                raise Hata("Mevcut şifre yanlış.", 401)
            if len(yeni_sifre) < 8 or any(c in yeni_sifre for c in "\n\r"):
                raise Hata("Yeni şifre en az 8 karakter olmalı.")
            with _kilit:
                sifre_yaz(yeni_sifre)
                _oturumlar.clear()  # diğer tarayıcılardaki oturumlar kapanır
            return self.json_gonder({"tamam": True}, cerez=self.cerez(oturum_ac()))

        if kaynak == "gorsel" and yontem == "POST":
            veri_url = str(self.govde_oku(EN_FAZLA_GORSEL * 4 // 3 + 1000).get("veri") or "")
            m = re.fullmatch(r"data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)", veri_url)
            if not m:
                raise Hata("Yalnız JPG, PNG ya da WEBP fotoğraf yüklenebilir.")
            ham = base64.b64decode(m.group(2))
            if len(ham) > EN_FAZLA_GORSEL:
                raise Hata("Fotoğraf çok büyük.", 413)
            if ham.startswith(b"\xff\xd8\xff"):
                uzanti = "jpg"
            elif ham.startswith(b"\x89PNG\r\n\x1a\n"):
                uzanti = "png"
            elif ham[:4] == b"RIFF" and ham[8:12] == b"WEBP":
                uzanti = "webp"
            else:
                raise Hata("Dosya bir fotoğraf değil.")
            ad = f"{secrets.token_hex(16)}.{uzanti}"
            (GORSELLER / ad).write_bytes(ham)
            return self.json_gonder({"gorsel": "/gorseller/" + ad}, 201)

        raise Hata("Bulunamadı.", 404)


def main():
    kurulum()
    sunucu = ThreadingHTTPServer(("127.0.0.1", PORT), Isleyici)
    adres = f"http://127.0.0.1:{PORT}/"
    print(f"Mini Meadow çalışıyor: {adres}  (yönetim: {adres}yonetim)  — kapatmak için Ctrl+C")
    if "--tarayici" in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(adres)).start()
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        print("\nSunucu kapatıldı.")


if __name__ == "__main__":
    main()
