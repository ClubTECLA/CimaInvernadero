import test from "node:test";
import assert from "node:assert/strict";
import { deriveCommunicationStatus, heartbeatThresholdSeconds } from "./heartbeat.js";

test("communication remains recent just before rendezvous threshold and becomes late at threshold", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const threshold = heartbeatThresholdSeconds(600, 120);
  assert.equal(threshold, 1320);
  assert.equal(deriveCommunicationStatus({ lastHeartbeatAt: now - (threshold - 1) * 1000, now, intervalSeconds: 600 }).status, "RECIBIENDO");
  assert.equal(deriveCommunicationStatus({ lastHeartbeatAt: now - threshold * 1000, now, intervalSeconds: 600 }).status, "ATRASADO");
});

test("legacy timestamps are explicitly marked as compatibility presence, never as a heartbeat", () => {
  const status = deriveCommunicationStatus({ legacyLastCommunication: "2026-01-01T00:00:00Z", now: Date.parse("2026-01-01T00:01:00Z"), intervalSeconds: 600 });
  assert.equal(status.status, "RECIBIENDO");
  assert.equal(status.source, "LEGACY_TELEMETRY_COMPAT");
});

test("a missing report is distinct from administrative node state", () => {
  assert.equal(deriveCommunicationStatus({ now: Date.now(), intervalSeconds: 600 }).status, "SIN_COMUNICACION");
});
