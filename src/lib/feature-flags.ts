/**
 * Geçici özellik bayrakları (CLAUDE.md §9.145, Aşama 2).
 *
 * Generator ayrı bir içerik türü olmaktan çıkarılıyor: özellikleri normal Prompt'un
 * değişken sistemine taşındı. `GENERATORS_ENABLED = false` iken Generator
 * KEŞFEDİLEMEZ ve OLUŞTURULAMAZ (menü, Oluştur, arama, keşif, akış, profil,
 * Workflow adımı, Studio kaynağı…), ama var olan Generator'lar salt-okunur
 * çalışmaya devam eder ve `/generators/local?slug=…` bağlantıları kırılmaz.
 * Veri silinmez. Aşama 3'te (ayrı onayla) kod ve tablo kaldırılacak; o zaman bu
 * bayrak ve onu okuyan dallar da silinir.
 */
export const GENERATORS_ENABLED = false;
