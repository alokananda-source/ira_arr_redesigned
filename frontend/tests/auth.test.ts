import { describe, expect, it } from "vitest";

import { createSessionToken, safeEqual, verifySessionToken } from "@/lib/auth";

describe("safeEqual", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("hunter2", "hunter2")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(safeEqual("hunter2", "hunter3")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(safeEqual("short", "muchlonger")).toBe(false);
  });
});

describe("session tokens", () => {
  const secret = "test-secret";

  it("verifies a freshly created token", async () => {
    const token = await createSessionToken(secret);
    await expect(verifySessionToken(token, secret)).resolves.toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken(secret);
    await expect(verifySessionToken(token, "wrong-secret")).resolves.toBe(false);
  });

  it("rejects a tampered payload", async () => {
    const token = await createSessionToken(secret);
    const [, signature] = token.split(".");
    const tampered = `tampered-payload.${signature}`;
    await expect(verifySessionToken(tampered, secret)).resolves.toBe(false);
  });

  it("rejects a malformed token", async () => {
    await expect(verifySessionToken("not-a-real-token", secret)).resolves.toBe(false);
  });

  it("rejects an undefined token", async () => {
    await expect(verifySessionToken(undefined, secret)).resolves.toBe(false);
  });

  it("rejects an expired token", async () => {
    const originalNow = Date.now;
    Date.now = () => originalNow() - 8 * 24 * 60 * 60 * 1000; // pretend the token was minted 8 days ago
    const token = await createSessionToken(secret);
    Date.now = originalNow;
    await expect(verifySessionToken(token, secret)).resolves.toBe(false);
  });
});
