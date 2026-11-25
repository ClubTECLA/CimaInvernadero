export const SENSOR_CALIBRATION_STATES = new Set(["NOT_RECORDED", "UNCALIBRATED", "CALIBRATED"]);

function optionalFiniteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) >= 1_000_000_000_000 || Number(parsed.toFixed(6)) !== parsed) return NaN;
  return parsed;
}

export function validateSensorMeasurementConfig(body = {}, catalogUnit) {
  const installationMin = optionalFiniteNumber(body.installation_min);
  const installationMax = optionalFiniteNumber(body.installation_max);
  const manufacturerMin = optionalFiniteNumber(body.manufacturer_min);
  const manufacturerMax = optionalFiniteNumber(body.manufacturer_max);
  const calibrationStatus = body.calibration_status;
  const manufacturerReference = typeof body.manufacturer_reference === "string" ? body.manufacturer_reference.trim() : "";
  const calibrationReference = typeof body.calibration_reference === "string" ? body.calibration_reference.trim() : "";
  const hasManufacturerRange = manufacturerMin !== null || manufacturerMax !== null;

  if (typeof catalogUnit !== "string" || !catalogUnit.trim()) return { valid: false, error: "El tipo de dato requiere una unidad en catálogo" };
  if (body.unidad !== catalogUnit) return { valid: false, conflict: true, error: "unidad debe coincidir exactamente con la unidad del tipo de dato en catálogo" };
  if ([installationMin, installationMax, manufacturerMin, manufacturerMax].some(Number.isNaN)) return { valid: false, error: "Los límites deben ser números finitos o null" };
  if ((installationMin !== null && installationMax !== null && installationMin > installationMax) ||
      (manufacturerMin !== null && manufacturerMax !== null && manufacturerMin > manufacturerMax)) return { valid: false, error: "El límite mínimo no puede superar al máximo" };
  if (!SENSOR_CALIBRATION_STATES.has(calibrationStatus)) return { valid: false, error: "calibration_status debe ser NOT_RECORDED, UNCALIBRATED o CALIBRATED" };
  if (hasManufacturerRange && !manufacturerReference) return { valid: false, error: "Los límites del fabricante requieren una referencia verificable" };
  if (manufacturerReference.length > 500 || calibrationReference.length > 500) return { valid: false, error: "Las referencias no pueden superar 500 caracteres" };
  if (calibrationStatus === "CALIBRATED" && !calibrationReference) return { valid: false, error: "CALIBRATED requiere una referencia de calibración" };

  return { valid: true, values: {
    installationMin, installationMax, manufacturerMin, manufacturerMax,
    manufacturerReference: manufacturerReference || null,
    calibrationStatus,
    calibrationReference: calibrationReference || null,
  } };
}

export function validateSensorMeasurement(value, receivedUnit, config = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return { valid: false, reason: "non_finite_value" };
  const unit = config.unidad || null;
  if (!unit) return { valid: false, reason: "unit_unavailable", unit: null };
  if (receivedUnit !== undefined && receivedUnit !== null && receivedUnit !== unit) {
    return { valid: false, reason: "unit_mismatch", unit, receivedUnit };
  }
  const bounds = {
    manufacturer_min: config.manufacturer_min === null || config.manufacturer_min === undefined ? null : Number(config.manufacturer_min),
    manufacturer_max: config.manufacturer_max === null || config.manufacturer_max === undefined ? null : Number(config.manufacturer_max),
    installation_min: config.installation_min === null || config.installation_min === undefined ? null : Number(config.installation_min),
    installation_max: config.installation_max === null || config.installation_max === undefined ? null : Number(config.installation_max),
  };
  const outside = (min, max) => (min !== null && numericValue < min) || (max !== null && numericValue > max);
  if (outside(bounds.manufacturer_min, bounds.manufacturer_max)) return { valid: false, reason: "outside_manufacturer_range", unit, bounds, calibration_status: config.calibration_status || "NOT_RECORDED" };
  if (outside(bounds.installation_min, bounds.installation_max)) return { valid: false, reason: "outside_installation_range", unit, bounds, calibration_status: config.calibration_status || "NOT_RECORDED" };
  return { valid: true, unit, unit_assumed: receivedUnit === undefined || receivedUnit === null, bounds, calibration_status: config.calibration_status || "NOT_RECORDED" };
}
