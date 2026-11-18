**English** · [Türkçe](README.tr.md)

# Mini Meadow — kids' clothing store (learning project)

The website of an imaginary shop selling baby and kids' clothes. No real sales are made; it runs only on your computer.

## Running it
- Double-click `Mini Meadow.command`: the server starts and http://127.0.0.1:8772 opens in the browser.
- Or from the terminal: `python3 sunucu.py` (Ctrl+C to stop).
- No extra packages needed, only Python 3.

## Features
- **Store** (`/`): category, age and gender filters, search, sorting; size selection (out-of-stock sizes are disabled),
  cart (saved in the browser), free-shipping progress bar, ordering via WhatsApp.
- **Ordering:** The customer enters their name and address. The server checks prices and stock itself, assigns an order number
  and opens WhatsApp with a ready-made message. The order shows up in the panel as "New".
- **Admin panel** (`/yonetim`): password protected. Overview, orders (changing status: Confirmed → stock goes down, Cancelled → stock comes back),
  add/edit/hide/delete products (drawing + color + pattern, or a photo), sizes/stock, categories, store settings, password change.

## Data (no database)
As in Zarif Çiçekçilik, all data lives in plain JSON files:

| File | Contents | In git? |
|---|---|---|
| `veri/urunler.json` | products, prices, sizes and stock | yes |
| `veri/kategoriler.json` | categories (and their order) | yes |
| `veri/ayarlar.json` | store name, announcement, WhatsApp number, shipping | yes |
| `veri/siparisler.json` | incoming orders (customer name/address) | no |
| `veri/gorseller/` | photos uploaded from the panel | yes |
| `.env` | `YONETIM_SIFRE=...` panel password | no |

- The files can also be edited by hand; the server re-reads them on every request. If the JSON breaks, the panel tells you which line.
- Writes go to a temporary file first and then replace the original; if a write is interrupted, the old file stays intact.
- If `.env` doesn't exist on first launch, the panel asks you to set a password and writes the file itself. If you forget the password, change the line in `.env`.

## Security notes
- The server listens only on `127.0.0.1`; other devices on the same network can't reach it.
- The panel session is kept in an `HttpOnly; SameSite=Strict` cookie for 8 hours. After 5 wrong passwords in 5 minutes, login is locked.
- Every request that changes data requires the `X-Mini-Meadow: 1` header and the same origin (blocks requests from other sites).
- Photos are resized to 800x800 in the browser; the server checks from the file's bytes that it really is a JPG/PNG/WEBP.

## Copyright
Product images are the site's own SVG drawings (`public/cizimler.js`). Fonts come from Google Fonts (Baloo 2, Nunito; open licenses).
Only upload photos you took yourself or have the right to use.
