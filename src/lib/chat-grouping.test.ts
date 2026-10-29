import test from "node:test";
import assert from "node:assert/strict";
import { formatClockTime, layoutChatMessages } from "./chat-grouping.ts";
import type { Message } from "@/types";

function msg(id: string, senderId: string, createdAt: string, extra: Partial<Message> = {}): Message {
  return {
    id,
    conversationId: "c",
    senderId,
    body: id,
    sharedPromptId: null,
    sharedRequestId: null,
    replyToMessageId: null,
    attachments: [],
    editedAt: null,
    deletedAt: null,
    createdAt,
    announcementId: null,
    storyId: null,
    isStoryReply: false,
    ...extra,
  };
}

test("aynı kişinin yakın mesajları tek öbek olur, öbeğin ilki/sonu işaretlenir", () => {
  const layout = layoutChatMessages([
    msg("a", "u1", "2026-10-20T10:00:00"),
    msg("b", "u1", "2026-10-20T10:02:00"),
    msg("c", "u2", "2026-10-20T10:03:00"),
  ]);
  assert.deepEqual(layout.map((l) => [l.groupStart, l.groupEnd]), [
    [true, false],
    [false, true],
    [true, true],
  ]);
});

test("uzun aralık ve gün değişimi öbeği böler; gün değişimi ayraç ister", () => {
  const layout = layoutChatMessages([
    msg("a", "u1", "2026-10-20T10:00:00"),
    msg("b", "u1", "2026-10-20T11:00:00"),
    msg("c", "u1", "2026-10-21T11:01:00"),
  ]);
  assert.deepEqual(layout.map((l) => l.dayStart), [true, false, true]);
  assert.deepEqual(layout.map((l) => l.groupStart), [true, true, true]);
  assert.deepEqual(layout.map((l) => l.groupEnd), [true, true, true]);
});

test("duyuru kartı hiçbir öbeğe girmez", () => {
  const layout = layoutChatMessages([
    msg("a", "u1", "2026-10-20T10:00:00"),
    msg("b", "u1", "2026-10-20T10:01:00", { announcementId: "x" }),
  ]);
  assert.deepEqual(layout.map((l) => [l.groupStart, l.groupEnd]), [
    [true, true],
    [true, true],
  ]);
});

test("saat biçimi 24 saatlik ve iki haneli", () => {
  assert.match(formatClockTime("2026-10-20T09:05:00", "tr"), /^09[.:]05$/);
  assert.match(formatClockTime("2026-10-20T09:05:00", "en"), /^09[.:]05$/);
});
