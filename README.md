# Mini Meadow — çocuk giyim mağazası (öğrenme projesi)

Bebek ve çocuk kıyafetleri satan hayali bir dükkanın sitesi. Gerçek satış yapılmaz; yalnız bilgisayarda çalışır.

## Çalıştırma
- `Mini Meadow.command` dosyasına çift tıkla: sunucu açılır, tarayıcıda http://127.0.0.1:8772 gelir.
- Ya da terminalde: `python3 sunucu.py` (kapatmak için Ctrl+C).
- Ek paket gerekmez, yalnız Python 3 kullanılır.

## Neler var
- **Mağaza** (`/`): kategori, yaş, cinsiyet filtreleri, arama, sıralama; beden seçimi (stokta olmayan beden kapalı),
  sepet (tarayıcıda saklanır), ücretsiz kargo çubuğu, WhatsApp ile sipariş.
- **Sipariş:** Müşteri ad ve adresini yazar. Sunucu fiyatları ve stoğu kendisi kontrol eder, sipariş numarası verir,
  hazır mesajla WhatsApp'ı açar. Sipariş panele "Yeni" olarak düşer.
- **Yönetim paneli** (`/yonetim`): şifreli. Özet, siparişler (durum değiştirme: Onaylandı → stok düşer, İptal → stok geri gelir),
  ürün ekle/düzenle/gizle/sil (çizim + renk + desen ya da fotoğraf), beden/stok, kategoriler, mağaza ayarları, şifre değiştirme.

## Veri (veritabanı yok)
Zarif Çiçekçilik'teki gibi bütün veri düz JSON dosyalarında durur:

| Dosya | İçerik | Git'te mi? |
|---|---|---|
| `veri/urunler.json` | ürünler, fiyatlar, beden ve stoklar | evet |
| `veri/kategoriler.json` | kategoriler (sırası da burada) | evet |
| `veri/ayarlar.json` | mağaza adı, duyuru, WhatsApp no, kargo | evet |
| `veri/siparisler.json` | gelen siparişler (müşteri adı/adresi) | hayır |
| `veri/gorseller/` | panelden yüklenen fotoğraflar | evet |
| `.env` | `YONETIM_SIFRE=...` panel şifresi | hayır |

- Dosyalar elle de düzenlenebilir; sunucu her istekte yeniden okur. JSON bozulursa panel hangi satırda olduğunu söyler.
- Yazarken önce geçici dosyaya yazılıp yerine konur; yazım yarıda kalırsa eski dosya bozulmaz.
- İlk açılışta `.env` yoksa panel şifre belirlemeni ister ve dosyayı kendisi yazar. Şifreyi unutursan `.env`'deki satırı değiştir.

## Güvenlik notları
- Sunucu yalnız `127.0.0.1`'i dinler; aynı ağdaki başka cihazlar erişemez.
- Panel oturumu `HttpOnly; SameSite=Strict` çerezde, 8 saat. 5 dakikada 5 yanlış şifreden sonra giriş kilitlenir.
- Veri değiştiren her istek `X-Mini-Meadow: 1` başlığı ve aynı köken ister (başka sitelerin istek atması engellenir).
- Fotoğraflar tarayıcıda 800x800'e küçültülür; sunucu dosyanın gerçekten JPG/PNG/WEBP olduğunu baytlarından kontrol eder.

## Telif
Ürün görselleri sitenin kendi SVG çizimleridir (`public/cizimler.js`). Yazı tipleri Google Fonts'tan (Baloo 2, Nunito; açık lisans).
Panelden yalnız kendi çektiğin ya da kullanma hakkın olan fotoğrafları yükle.
