import test from "node:test";
import assert from "node:assert/strict";
import { composeCommunityPostShareText, parseCommunityPostShareBody } from "./community-post-share.ts";

const ID = "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb";
const URL = `https://example.dev/promptly/communities/post/local?id=${ID}`;

test("gönderi paylaşımı: not + başlık + bağlantı yazılır ve aynen ayrıştırılır", () => {
  const body = composeCommunityPostShareText("bak buna", "Gün batımı promptu", URL);
  assert.equal(body, `bak buna\n\nGün batımı promptu\n${URL}`);
  assert.deepEqual(parseCommunityPostShareBody(body), { note: "bak buna", id: ID });
});

test("gönderi paylaşımı: notsuz paylaşımda not null; çok satırlı not korunur", () => {
  assert.deepEqual(parseCommunityPostShareBody(composeCommunityPostShareText("", "Başlık", URL)), { note: null, id: ID });
  assert.equal(parseCommunityPostShareBody(composeCommunityPostShareText("satır 1\nsatır 2", "Başlık", URL))?.note, "satır 1\nsatır 2");
});

test("gönderi paylaşımı: sıradan metin, başlıksız bağlantı ve başka sayfa bağlantıları kart sayılmaz", () => {
  assert.equal(parseCommunityPostShareBody(null), null);
  assert.equal(parseCommunityPostShareBody("merhaba"), null);
  assert.equal(parseCommunityPostShareBody(URL), null, "başlık satırı yok");
  assert.equal(parseCommunityPostShareBody(`Başlık\nhttps://example.dev/promptly/prompts/local?id=${ID}`), null, "başka sayfa");
  assert.equal(parseCommunityPostShareBody(`Başlık\nhttps://example.dev/promptly/communities/post/local?id=kisa`), null, "geçersiz kimlik");
});
