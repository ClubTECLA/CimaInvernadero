import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { calculateGatewayAssignmentRevision } from "./gatewayRevisions.js";

test("assignment revision hashes the active node and sensor mapping in manifest shape", async () => {
  const calls = [];
  const connection = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM gateway_node_assignment")) {
        return [[{ nodo_id: 42, firmware_node_id: 70001, mac_address: "24:6F:28:AA:BB:CC" }]];
      }
      return [[{ sensor_id: 81, sensor_firmware_id: "dht22-1", canal: "gpio4" }]];
    },
  };
  const snapshot = [{
    nodo_id: 42,
    firmware_node_id: 70001,
    mac_address: "24:6F:28:AA:BB:CC",
    sensores: [{ sensor_id: 81, sensor_firmware_id: "dht22-1", canal: "gpio4" }],
  }];
  const expected = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

  assert.equal(await calculateGatewayAssignmentRevision(connection, 12), expected);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].params, [12]);
  assert.deepEqual(calls[1].params, [42]);
});

test("an empty gateway assignment has a stable empty snapshot revision", async () => {
  const connection = { async query() { return [[]]; } };
  const expected = createHash("sha256").update("[]").digest("hex");
  assert.equal(await calculateGatewayAssignmentRevision(connection, 12), expected);
});
