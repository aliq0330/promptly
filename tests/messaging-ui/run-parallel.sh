#!/usr/bin/env bash
# Verilen arayüz paketlerini (tests/messaging-ui/<ad>.mjs) PARALEL koşturur ve sonuçları verilen sırayla yazar (docs/history/412-*).
# Her paketin kendi sunucu portu vardır (4179–4209, çakışmaz) ve kendi Chromium'unu açar; yani birbirinden bağımsızdır.
# Kullanım: [UI_JOBS=4] tests/messaging-ui/run-parallel.sh run-a run-b …   (en uzun paketi başa yaz: iş dengesi için)
# Çıkış kodu: herhangi bir paket düşerse 1. Düşen paketin hata ayrıntısı (✗/FAIL satırları) günlükte görünür.
set -u
cd "$(dirname "$0")/../.."
# Varsayılan paralellik: çekirdek sayısı, en çok 4 (2 çekirdekli runner'da 4 Chromium CPU'yu boğup zamanlamaya duyarlı testleri sallar).
n=$(nproc 2>/dev/null || echo 2); [ "$n" -gt 4 ] && n=4
JOBS=${UI_JOBS:-$n}
out=$(mktemp -d)
printf '%s\n' "$@" | xargs -P "$JOBS" -I{} bash -c 'node tests/messaging-ui/{}.mjs > "$0/{}.log" 2>&1; echo $? > "$0/{}.rc"' "$out"
status=0
for s in "$@"; do
  echo "== $s"
  if [ ! -f "$out/$s.rc" ]; then echo "paket hiç koşmadı"; status=1; continue; fi
  tail -3 "$out/$s.log"
  if [ "$(cat "$out/$s.rc")" != 0 ]; then
    status=1
    grep -A12 -E "^(✗|FAIL)" "$out/$s.log" | head -60
  fi
done
exit $status
