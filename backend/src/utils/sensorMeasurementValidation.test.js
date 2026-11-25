import test from "node:test";
import assert from "node:assert/strict";
import { validateSensorMeasurement, validateSensorMeasurementConfig } from "./sensorMeasurementValidation.js";

test("installation limits are optional and calibration metadata is validated without inventing hardware limits", () => {
  const empty = validateSensorMeasurementConfig({ unidad: "°C", calibration_status: "NOT_RECORDED" }, "°C");
  assert.equal(empty.valid, true);
  assert.equal(empty.values.manufacturerMin, null);
  assert.equal(empty.values.manufacturerMax, null);
  assert.equal(validateSensorMeasurementConfig({ unidad: "°C", calibration_status: "CALIBRATED" }, "°C").valid, false);
});

test("manufacturer bounds require evidence and cannot contradict each other", () => {
  assert.equal(validateSensorMeasurementConfig({ unidad: "°C", manufacturer_min: -40, manufacturer_max: 80, calibration_status: "UNCALIBRATED" }, "°C").valid, false);
  assert.equal(validateSensorMeasurementConfig({ unidad: "°C", installation_min: 10, installation_max: 5, calibration_status: "NOT_RECORDED" }, "°C").valid, false);
  assert.equal(validateSensorMeasurementConfig({ unidad: "°C", installation_min: 0.1234567, calibration_status: "NOT_RECORDED" }, "°C").valid, false);
  assert.equal(validateSensorMeasurementConfig({ unidad: "°C", installation_max: 1_000_000_000_000, calibration_status: "NOT_RECORDED" }, "°C").valid, false);
  assert.equal(validateSensorMeasurementConfig({ unidad: "°C", manufacturer_min: -40, manufacturer_max: 80, manufacturer_reference: "datasheet:model-x", calibration_status: "NOT_RECORDED" }, "°C").valid, true);
});

test("telemetry checks declared unit and configured physical/installation ranges independently", () => {
  const config = { unidad: "°C", manufacturer_min: -40, manufacturer_max: 80, installation_min: 10, installation_max: 35, calibration_status: "UNCALIBRATED" };
  assert.equal(validateSensorMeasurement(20, "°C", config).valid, true);
  assert.equal(validateSensorMeasurement(20, null, config).valid, true);
  assert.equal(validateSensorMeasurement(20, "K", config).reason, "unit_mismatch");
  assert.equal(validateSensorMeasurement(20, undefined, { ...config, unidad: null }).reason, "unit_unavailable");
  assert.equal(validateSensorMeasurement(81, "°C", config).reason, "outside_manufacturer_range");
  assert.equal(validateSensorMeasurement(9, "°C", config).reason, "outside_installation_range");
});
