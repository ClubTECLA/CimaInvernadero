import test from "node:test";
import assert from "node:assert/strict";
import { isIdempotentTerminalAck, validateGatewayCommandAck } from "./gatewayCommandAck.js";

const base = { firmware_node_id: 70001, config_revision_expected: 1 };
const bootId = "4d8b49e4-3fc4-423c-912a-58ac68219eaf";

test("UNKNOWN ACK does not require node boot or sequence that were never received", () => {
  assert.equal(validateGatewayCommandAck({ ...base, stage: "NO_CONFIRMATION_UNKNOWN" }).valid, true);
  assert.equal(validateGatewayCommandAck({ ...base, stage: "NO_CONFIRMATION_UNKNOWN", boot_id: null, seq: null }).valid, true);
  assert.equal(validateGatewayCommandAck({ ...base, stage: "NO_CONFIRMATION_UNKNOWN", boot_id: bootId, seq: 24 }).valid, true);
});

test("UNKNOWN ACK rejects partial or malformed node correlation", () => {
  assert.equal(validateGatewayCommandAck({ ...base, stage: "NO_CONFIRMATION_UNKNOWN", boot_id: bootId }).valid, false);
  assert.equal(validateGatewayCommandAck({ ...base, stage: "NO_CONFIRMATION_UNKNOWN", boot_id: "bad", seq: 24 }).valid, false);
});

test("node-originated ACK stages require boot_id and seq", () => {
  for (const stage of ["RECEIVED", "APPLIED", "REJECTED"]) {
    const payload = { ...base, stage, boot_id: bootId, seq: 25 };
    if (stage === "APPLIED") payload.config_revision_applied = 2;
    assert.equal(validateGatewayCommandAck(payload).valid, true);
    delete payload.boot_id;
    assert.equal(validateGatewayCommandAck(payload).valid, false);
  }
});

test("command_config_revision aliases are accepted and conflicting names are rejected", () => {
  const canonical = { firmware_node_id: 70001, command_config_revision_expected: 1, stage: "APPLIED", boot_id: bootId, seq: 26, command_config_revision_applied: 2 };
  assert.equal(validateGatewayCommandAck(canonical).valid, true);
  assert.equal(validateGatewayCommandAck({ ...canonical, config_revision_expected: 1, config_revision_applied: 2 }).valid, true);
  assert.equal(validateGatewayCommandAck({ ...canonical, config_revision_expected: 0 }).valid, false);
});

test("terminal command ACKs are idempotent only for the same recorded result", () => {
  assert.equal(isIdempotentTerminalAck({ estado: "APLICADO_NODO", ack_stage: "APPLIED" }, "APPLIED"), true);
  assert.equal(isIdempotentTerminalAck({ estado: "APLICADO_NODO", ack_stage: "APPLIED" }, "REJECTED"), false);
  assert.equal(isIdempotentTerminalAck({ estado: "RECHAZADO_NODO", ack_stage: "REJECTED" }, "REJECTED"), true);
  assert.equal(isIdempotentTerminalAck({ estado: "SIN_CONFIRMACION", ack_stage: "UNKNOWN_CONFIRMED" }, "APPLIED"), false);
});
