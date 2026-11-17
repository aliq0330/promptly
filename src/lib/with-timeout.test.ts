import { test } from "node:test";
import assert from "node:assert/strict";
import { TimeoutError, withTimeout } from "./with-timeout.ts";

test("withTimeout: süre içinde dönen değer aynen gelir", async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 50), 7);
});

test("withTimeout: asılı kalan istek TimeoutError ile reddedilir", async () => {
  await assert.rejects(withTimeout(new Promise<never>(() => {}), 20), TimeoutError);
});

test("withTimeout: asıl hata olduğu gibi iletilir", async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error("boom")), 50), /boom/);
});

test("withTimeout: geç dönen sonuç yok sayılır (yakalanmamış hata yok)", async () => {
  const late = new Promise<number>((resolve) => setTimeout(() => resolve(1), 40));
  await assert.rejects(withTimeout(late, 10), TimeoutError);
  await late;
});
