"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LOCAL_CALL_PREFS, readCallDevices, readLocalCallPrefs, writeCallDevices, writeLocalCallPrefs, type LocalCallPrefs } from "@/lib/webrtc/call-prefs";
import type { CallDevicePrefs } from "@/lib/webrtc/types";

/**
 * Cihaza özel arama tercihleri deposu (docs/history/450-*): `localStorage`'dan bir kez okunur, değişince yazılır ve abonelere haber verilir
 * (Ayarlar → Aramalar, görüşme menüsü, hazırlık ekranı, sağlayıcı aynı değeri okur). Sunucuya gitmez.
 */
const EMPTY_DEVICES: CallDevicePrefs = { mic: null, camera: null, speaker: null };
let prefs: LocalCallPrefs | null = null;
let devices: CallDevicePrefs | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function getCallPrefs(): LocalCallPrefs {
  prefs ??= readLocalCallPrefs();
  return prefs;
}
export function getCallDevices(): CallDevicePrefs {
  devices ??= readCallDevices();
  return devices;
}
export function setCallPrefs(next: LocalCallPrefs): void {
  prefs = next;
  writeLocalCallPrefs(next);
  emit();
}
export function setCallDevices(next: Partial<CallDevicePrefs>): void {
  devices = { ...getCallDevices(), ...next };
  writeCallDevices(devices);
  emit();
}

export function useCallPrefs(): [LocalCallPrefs, (next: Partial<LocalCallPrefs>) => void] {
  const value = useSyncExternalStore(subscribe, getCallPrefs, () => DEFAULT_LOCAL_CALL_PREFS);
  const set = useCallback((next: Partial<LocalCallPrefs>) => setCallPrefs({ ...getCallPrefs(), ...next }), []);
  return [value, set];
}

export function useCallDevices(): [CallDevicePrefs, (next: Partial<CallDevicePrefs>) => void] {
  const value = useSyncExternalStore(subscribe, getCallDevices, () => EMPTY_DEVICES);
  return [value, setCallDevices];
}
