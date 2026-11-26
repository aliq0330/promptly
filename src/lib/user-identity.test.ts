import test from "node:test";
import assert from "node:assert/strict";
import { userSignature } from "./user-identity.ts";

const base = {
  id: "u1",
  email: "a@b.c",
  phone: "",
  role: "authenticated",
  user_metadata: { username: "ali", display_name: "Ali" },
  app_metadata: { provider: "email", providers: ["email"] },
};

test("a fresh object for the same person (token refresh) has the same signature", () => {
  const refreshed = { ...base, user_metadata: { display_name: "Ali", username: "ali" }, last_sign_in_at: "2026-11-26T12:00:00Z", updated_at: "x" };
  assert.equal(userSignature(refreshed), userSignature(base));
});

test("another person, a changed e-mail or changed metadata changes the signature", () => {
  assert.notEqual(userSignature({ ...base, id: "u2" }), userSignature(base));
  assert.notEqual(userSignature({ ...base, email: "x@y.z" }), userSignature(base));
  assert.notEqual(userSignature({ ...base, user_metadata: { username: "ali", display_name: "Ali K" } }), userSignature(base));
  assert.notEqual(userSignature({ ...base, app_metadata: { provider: "google" } }), userSignature(base));
});

test("signed out has its own signature", () => {
  assert.equal(userSignature(null), "");
  assert.notEqual(userSignature(base), "");
});
