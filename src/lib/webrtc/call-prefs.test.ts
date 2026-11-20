import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOCAL_CALL_PREFS, incomingAlert, parseLocalCallPrefs } from "./call-prefs.ts";

const base = { prefs: DEFAULT_LOCAL_CALL_PREFS, quietNow: false, invisible: false, tabHidden: false, notifyGranted: true };

test("tercih ayrıştırma: varsayılanlar açık; bozuk/eksik kayıt varsayılana düşer", () => {
  assert.deepEqual(parseLocalCallPrefs(null), DEFAULT_LOCAL_CALL_PREFS);
  assert.deepEqual(parseLocalCallPrefs("bozuk"), DEFAULT_LOCAL_CALL_PREFS);
  assert.deepEqual(parseLocalCallPrefs(JSON.stringify({ ringSound: false })), { ringSound: false, respectQuietHours: true, browserNotify: true });
  assert.deepEqual(parseLocalCallPrefs(JSON.stringify({ ringSound: "evet", respectQuietHours: 0 })), DEFAULT_LOCAL_CALL_PREFS, "tip uymayan değer atılır");
});

test("gelen arama uyarıları: sekme önde → yalnız zil; arka planda → bildirim + başlık", () => {
  assert.deepEqual(incomingAlert(base), { ring: true, notify: false, title: false });
  assert.deepEqual(incomingAlert({ ...base, tabHidden: true }), { ring: true, notify: true, title: true });
  assert.deepEqual(incomingAlert({ ...base, tabHidden: true, notifyGranted: false }), { ring: true, notify: false, title: true }, "izin yoksa OS bildirimi yok, başlık var");
});

test("sessiz saat ve Görünmez zil/bildirim/başlığı susturur; sessiz saate uymayı kapatan zil çalar", () => {
  const hidden = { ...base, tabHidden: true };
  assert.deepEqual(incomingAlert({ ...hidden, quietNow: true }), { ring: false, notify: false, title: false });
  assert.deepEqual(incomingAlert({ ...hidden, invisible: true }), { ring: false, notify: false, title: false });
  assert.deepEqual(incomingAlert({ ...hidden, quietNow: true, prefs: { ...DEFAULT_LOCAL_CALL_PREFS, respectQuietHours: false } }), { ring: true, notify: true, title: true });
  assert.deepEqual(incomingAlert({ ...hidden, invisible: true, prefs: { ...DEFAULT_LOCAL_CALL_PREFS, respectQuietHours: false } }), { ring: false, notify: false, title: false }, "Görünmez her zaman sessiz");
});

test("kullanıcı kapatınca: zil kapalıysa ses yok; bildirim kapalıysa bildirim/başlık yok", () => {
  const hidden = { ...base, tabHidden: true };
  assert.equal(incomingAlert({ ...hidden, prefs: { ...DEFAULT_LOCAL_CALL_PREFS, ringSound: false } }).ring, false);
  const off = incomingAlert({ ...hidden, prefs: { ...DEFAULT_LOCAL_CALL_PREFS, browserNotify: false } });
  assert.deepEqual([off.notify, off.title], [false, false]);
});
