const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACK_STAGES = new Set(["RECEIVED", "APPLIED", "REJECTED", "NO_CONFIRMATION_UNKNOWN"]);

export function validateGatewayCommandAck(body = {}) {
  const { firmware_node_id, boot_id, seq, message } = body;
  const revisionAliasConflict = Object.hasOwn(body, "command_config_revision_expected") && Object.hasOwn(body, "config_revision_expected") && body.command_config_revision_expected !== body.config_revision_expected ||
    Object.hasOwn(body, "command_config_revision_applied") && Object.hasOwn(body, "config_revision_applied") && body.command_config_revision_applied !== body.config_revision_applied;
  const config_revision_expected = body.command_config_revision_expected ?? body.config_revision_expected;
  const config_revision_applied = body.command_config_revision_applied ?? body.config_revision_applied;
  const stage = body.stage || (body.success === true ? "APPLIED" : body.success === false ? "REJECTED" : "");
  const unknownStage = stage === "NO_CONFIRMATION_UNKNOWN";
  const hasBootId = boot_id !== undefined && boot_id !== null;
  const hasSeq = seq !== undefined && seq !== null;
  const validNodeCorrelation = unknownStage
    ? hasBootId === hasSeq && (!hasBootId || (typeof boot_id === "string" && UUID_PATTERN.test(boot_id) && Number.isInteger(Number(seq)) && Number(seq) >= 0 && Number(seq) <= 4294967295))
    : typeof boot_id === "string" && UUID_PATTERN.test(boot_id) && Number.isInteger(Number(seq)) && Number(seq) >= 0 && Number(seq) <= 4294967295;

  if (revisionAliasConflict || !Number.isInteger(Number(firmware_node_id)) || Number(firmware_node_id) < 1 || Number(firmware_node_id) > 4294967295 ||
      !validNodeCorrelation || !Number.isInteger(config_revision_expected) || config_revision_expected < 0 || config_revision_expected > 4294967295 ||
      !ACK_STAGES.has(stage) ||
      (stage === "APPLIED" && (!Number.isInteger(config_revision_applied) || config_revision_applied < 1 || config_revision_applied > 4294967295)) ||
      (message !== undefined && (typeof message !== "string" || message.length > 500))) {
    return { valid: false, stage, error: "Se requiere firmware_node_id, config_revision_expected y stage; RECEIVED/APPLIED/REJECTED requieren boot_id y seq válidos; NO_CONFIRMATION_UNKNOWN los admite omitidos o null; APPLIED requiere config_revision_applied" };
  }
  return { valid: true, stage };
}

export function isIdempotentTerminalAck(command, requestedStage) {
  if (command.estado === "APLICADO_NODO") return requestedStage === "APPLIED" && command.ack_stage === "APPLIED";
  if (command.estado === "RECHAZADO_NODO") return requestedStage === "REJECTED" && command.ack_stage === "REJECTED";
  return false;
}
