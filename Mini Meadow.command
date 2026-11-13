#!/bin/bash
# Çift tıkla: sunucuyu başlatır ve tarayıcıda açar. Kapatmak için pencereyi kapat ya da Ctrl+C.
cd "$(dirname "$0")"
if lsof -iTCP:8772 -sTCP:LISTEN >/dev/null 2>&1; then
  open "http://127.0.0.1:8772/"
  exit 0
fi
python3 sunucu.py --tarayici
