# 311 — `promptly-mcp` yayını: NPM_TOKEN yerine npm Trusted Publisher (OIDC)

**Neden:** 297'deki yayın 90 günlük, 2FA'yı atlayan bir `NPM_TOKEN` ile yapılıyordu (27 Ocak 2027'de biter; npm bu tür doğrudan yayını
Ocak 2027'de kaldırıyor). Kalıcı yol Trusted Publisher: npm, GitHub Actions'ın kimliğini doğrudan tanır, depoda/secret'ta token kalmaz.

**Yapılan (2026-11-01):**
- Kullanıcı npm'de `promptly-mcp` → Settings → Trusted Publisher: GitHub Actions, `aliq0330/promptly`, `publish-mcp.yml`, environment boş,
  "Allow npm publish" açık. Durum "Pending validation": **ilk yayın 3 Kasım 2026 18:13 UTC'den ÖNCE yapılmazsa yapılandırma doğrulanmaz.**
- `.github/workflows/publish-mcp.yml`: `NPM_TOKEN` / `NODE_AUTH_TOKEN` ve `registry-url` kaldırıldı (token tanımlıysa npm OIDC yerine onu
  kullanır), npm CLI `^11.5.1`'e yükseltilir (Node 22'nin npm'i OIDC bilmez), `id-token: write` ve `--provenance` kaldı.
- `mcp/package.json` + lock: `0.1.0` → `0.1.1` (aynı sürüm ikinci kez yayınlanamaz; 0.1.1 yalnız yayın yolunu doğrulamak içindir, kod aynı).

**Sonuç (kullanıcı bildirdi, 2026-11-01):** "Publish MCP package" elle çalıştırıldı, npm'deki Trusted Publisher durumu "Pending validation"dan çıktı. Bu oturumda ne çalışmanın logu ne npm sayfası görüldü; sandbox'tan gerçek npm yayını denenemez.

**Sonraki adım (kullanıcı yaptığını bildirdi):** npm → Publishing access → "Require two-factor authentication and disallow tokens"; eski npm token'ı ve GitHub `NPM_TOKEN` secret'ı silindi. Yeni sürüm: `mcp/package.json` sürümünü artır + iş akışını elle çalıştır.
