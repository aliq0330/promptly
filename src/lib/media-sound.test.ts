import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaSoundStore, isAudible, MEDIA_SOUND_KEY, nextSound, parseStoredSound, soundState, type SoundStorage } from "./media-sound.ts";

function memory(initial: Record<string, string> = {}): SoundStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
}

test("varsayılan KAPALI; yalnız 'on' değeri açık sayılır", () => {
  assert.equal(parseStoredSound(null), false);
  assert.equal(parseStoredSound(undefined), false);
  assert.equal(parseStoredSound("off"), false);
  assert.equal(parseStoredSound("1"), false);
  assert.equal(parseStoredSound("on"), true);
});

test("durum: kapalı / dokunuş bekliyor / açık", () => {
  assert.equal(soundState(false, true), "off");
  assert.equal(soundState(false, false), "off");
  assert.equal(soundState(true, false), "pending");
  assert.equal(soundState(true, true), "on");
});

test("ses ancak tercih açık VE tarayıcı izin veriyorsa duyulur", () => {
  assert.equal(isAudible({ soundOn: true, unlocked: true }), true);
  assert.equal(isAudible({ soundOn: true, unlocked: false }), false);
  assert.equal(isAudible({ soundOn: false, unlocked: true }), false);
});

test("düğmeye basış: kapalıyken açar, açıkken kapatır", () => {
  assert.deepEqual(nextSound({ soundOn: false, unlocked: true }), { snapshot: { soundOn: true, unlocked: true }, result: "on" });
  assert.deepEqual(nextSound({ soundOn: true, unlocked: true }), { snapshot: { soundOn: false, unlocked: true }, result: "off" });
});

test("sayfa yeni açıldıysa (tercih açık, dokunuş yok) ilk basış tercihi KAPATMAZ, yalnız sesi getirir", () => {
  assert.deepEqual(nextSound({ soundOn: true, unlocked: false }), { snapshot: { soundOn: true, unlocked: true }, result: "unlocked" });
  // Tercih kapalıyken dokunuş yoksa basış normal açar.
  assert.equal(nextSound({ soundOn: false, unlocked: false }).result, "on");
});

test("depo: tercih cihaza yazılır ve yeniden açılışta okunur", () => {
  const storage = memory();
  const first = createMediaSoundStore(storage, true);
  assert.equal(first.get().soundOn, false);
  assert.equal(first.toggle(), "on");
  assert.equal(storage.data[MEDIA_SOUND_KEY], "on");
  assert.equal(first.toggle(), "off");
  assert.equal(storage.data[MEDIA_SOUND_KEY], "off");
  first.toggle();
  // Sayfa yenilendi: tercih açık kalır ama tarayıcı henüz dokunuş görmedi.
  const second = createMediaSoundStore(storage, false);
  assert.deepEqual(second.get(), { soundOn: true, unlocked: false });
  assert.equal(soundState(second.get().soundOn, second.get().unlocked), "pending");
  second.markUnlocked();
  assert.equal(isAudible(second.get()), true);
});

test("depo: dokunuş durumu tercihi yazmaz; engellenen oynatma yeniden dokunuş bekler ama tercih kalır", () => {
  const storage = memory({ [MEDIA_SOUND_KEY]: "on" });
  const store = createMediaSoundStore(storage, true);
  store.markUnlocked();
  store.reportBlocked();
  assert.deepEqual(store.get(), { soundOn: true, unlocked: false });
  assert.equal(storage.data[MEDIA_SOUND_KEY], "on");
});

test("depo: dinleyiciler yalnız gerçek değişimde çağrılır", () => {
  const store = createMediaSoundStore(memory(), true);
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.markUnlocked(); // zaten açık
  assert.equal(calls, 0);
  store.enable();
  assert.equal(calls, 1);
  store.enable();
  assert.equal(calls, 1);
  off();
  store.toggle();
  assert.equal(calls, 1);
});

test("depo: başka sekmede değişen tercih okunur; engelli depolama sorun çıkarmaz", () => {
  const storage = memory();
  const store = createMediaSoundStore(storage, true);
  storage.data[MEDIA_SOUND_KEY] = "on";
  store.reload();
  assert.equal(store.get().soundOn, true);

  const broken: SoundStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  const safe = createMediaSoundStore(broken, true);
  assert.equal(safe.get().soundOn, false);
  assert.equal(safe.toggle(), "on");
  assert.equal(safe.get().soundOn, true);
});
