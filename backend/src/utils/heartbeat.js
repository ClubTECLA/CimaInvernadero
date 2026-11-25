export function parseHeartbeatGraceSeconds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(30, Math.min(3600, parsed)) : 120;
}

export function heartbeatThresholdSeconds(intervalSeconds, graceSeconds = 120) {
  const interval = Number(intervalSeconds);
  const expectedInterval = Number.isFinite(interval) && interval > 0 ? interval : 600;
  return Math.ceil(expectedInterval * 2 + parseHeartbeatGraceSeconds(graceSeconds));
}

export function deriveCommunicationStatus({ lastHeartbeatAt, legacyLastCommunication, now = Date.now(), intervalSeconds, graceSeconds = 120 }) {
  const heartbeat = lastHeartbeatAt ? new Date(lastHeartbeatAt).getTime() : NaN;
  const legacy = legacyLastCommunication ? new Date(legacyLastCommunication).getTime() : NaN;
  const timestamp = Number.isFinite(heartbeat) ? heartbeat : legacy;
  const source = Number.isFinite(heartbeat) ? "HEARTBEAT" : Number.isFinite(legacy) ? "LEGACY_TELEMETRY_COMPAT" : "NONE";
  if (!Number.isFinite(timestamp)) return { status: "SIN_COMUNICACION", source, threshold_seconds: heartbeatThresholdSeconds(intervalSeconds, graceSeconds) };
  const ageSeconds = Math.max(0, (Number(now) - timestamp) / 1000);
  return {
    status: ageSeconds >= heartbeatThresholdSeconds(intervalSeconds, graceSeconds) ? "ATRASADO" : "RECIBIENDO",
    source,
    threshold_seconds: heartbeatThresholdSeconds(intervalSeconds, graceSeconds),
  };
}
