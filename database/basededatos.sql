CREATE DATABASE IF NOT EXISTS monitoreo_invernadero;

USE monitoreo_invernadero;


-- =====================================================
-- ESPECIFICACIONES DE UBICACIÓN
-- =====================================================

CREATE TABLE IF NOT EXISTS especificaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    largo FLOAT COMMENT 'Distancia desde la entrada hacia adentro (metros)',
    ancho FLOAT COMMENT 'Distancia desde la izquierda hacia la derecha (metros)',
    altura FLOAT COMMENT 'Altura desde el suelo (metros)'
);


-- =====================================================
-- UBICACIONES
-- =====================================================

CREATE TABLE IF NOT EXISTS ubicacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    largo DECIMAL(8,2) NOT NULL,
    ancho DECIMAL(8,2) NOT NULL,
    altura DECIMAL(8,2) NOT NULL,
    descripcion VARCHAR(500) NULL,
    image_path VARCHAR(255) NULL,
    map_image_path VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- ZONAS
-- =====================================================

CREATE TABLE IF NOT EXISTS zona (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ubicacion_id INT NOT NULL,
    zona VARCHAR(255) NOT NULL,
    descripcion VARCHAR(500) NULL,
    image_path VARCHAR(255) NULL,
    largo_inicio DECIMAL(8,3) NULL,
    largo_fin DECIMAL(8,3) NULL,
    ancho_inicio DECIMAL(8,3) NULL,
    ancho_fin DECIMAL(8,3) NULL,
    altura_inicio DECIMAL(8,3) NULL,
    altura_fin DECIMAL(8,3) NULL,
    CONSTRAINT fk_zona_ubicacion FOREIGN KEY (ubicacion_id) REFERENCES ubicacion(id) ON DELETE CASCADE,
    INDEX idx_zona_ubicacion (ubicacion_id)
);


-- =====================================================
-- TIPOS DE DISPOSITIVO
-- =====================================================

CREATE TABLE IF NOT EXISTS tipo_dispositivo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255),
    mac_address VARCHAR(17) NULL,
    descripcion VARCHAR(255),
    image_path VARCHAR(255),
    categoria ENUM('SENSOR', 'ACTUADOR') NOT NULL DEFAULT 'SENSOR',
    activo BOOLEAN NOT NULL DEFAULT TRUE
);


-- =====================================================
-- TIPOS DE DATOS
-- =====================================================

CREATE TABLE IF NOT EXISTS tipo_dato (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255),
    unidad VARCHAR(100),
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tipo_dispositivo_tipo_dato (
    tipo_dispositivo_id INT NOT NULL,
    tipo_dato_id INT NOT NULL,
    PRIMARY KEY (tipo_dispositivo_id, tipo_dato_id),
    CONSTRAINT fk_tipo_dato_dispositivo_tipo FOREIGN KEY (tipo_dispositivo_id)
        REFERENCES tipo_dispositivo(id) ON DELETE CASCADE,
    CONSTRAINT fk_tipo_dato_dispositivo_dato FOREIGN KEY (tipo_dato_id)
        REFERENCES tipo_dato(id) ON DELETE RESTRICT
);


-- =====================================================
-- PROPÓSITOS
-- =====================================================

CREATE TABLE IF NOT EXISTS proposito (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL
);


-- =====================================================
-- DISPOSITIVOS
-- =====================================================

CREATE TABLE IF NOT EXISTS dispositivo (
    id INT AUTO_INCREMENT PRIMARY KEY,

    specs_id INT,
    zona_id INT NOT NULL,
    tipo_id INT NOT NULL,
    proposito_id INT NOT NULL,

    estado ENUM(
        'OPERATIVO',
        'INACTIVO',
        'EN MANTENIMIENTO',
        'FALLANDO'
    ),

    nombre VARCHAR(255),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    intervalo_lectura_segundos INT NULL,
    management_poll_interval_seconds INT NOT NULL DEFAULT 600,
    config_revision INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Revisión deseada monotónica del nodo; no envolver',
    ultima_comunicacion DATETIME NULL COMMENT 'Compatibilidad con reportes heredados',
    ultimo_heartbeat_at DATETIME NULL COMMENT 'Presencia separada de las lecturas productivas',

    updated_at DATETIME
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_dispositivo_specs
        FOREIGN KEY (specs_id)
        REFERENCES especificaciones(id),

    CONSTRAINT fk_dispositivo_zona
        FOREIGN KEY (zona_id)
        REFERENCES zona(id),

    CONSTRAINT fk_dispositivo_tipo
        FOREIGN KEY (tipo_id)
        REFERENCES tipo_dispositivo(id),

    CONSTRAINT fk_dispositivo_proposito
        FOREIGN KEY (proposito_id)
        REFERENCES proposito(id)
);


-- =====================================================
-- SENSORES FÍSICOS
-- =====================================================

-- Un sensor físico es independiente del nodo o microcontrolador al que
-- esté conectado. Por eso puede retirarse de un nodo y asignarse a otro
-- sin cambiar su identidad ni perder sus lecturas históricas.
CREATE TABLE IF NOT EXISTS sensor (
    id INT AUTO_INCREMENT PRIMARY KEY,

    tipo_dispositivo_id INT NOT NULL,
    identificador_fisico VARCHAR(255) NULL,
    numero_serie VARCHAR(255) NULL,
    nombre VARCHAR(255) NOT NULL,

    estado ENUM(
        'OPERATIVO',
        'ACTIVO',
        'INACTIVO',
        'EN MANTENIMIENTO',
        'RETIRADO',
        'FALLANDO'
    ) NOT NULL DEFAULT 'OPERATIVO',

    descripcion VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_sensor_tipo_dispositivo
        FOREIGN KEY (tipo_dispositivo_id)
        REFERENCES tipo_dispositivo(id)
        ON DELETE RESTRICT,

    UNIQUE KEY uq_sensor_identificador_fisico (identificador_fisico),
    UNIQUE KEY uq_sensor_numero_serie (numero_serie),
    INDEX idx_sensor_tipo_dispositivo (tipo_dispositivo_id),
    INDEX idx_sensor_estado (estado)
);

-- Credenciales y asignaciones para aprovisionar gateways/nodos sin enlazar
-- el identificador físico del firmware con el ID SQL del dispositivo.
CREATE TABLE IF NOT EXISTS gateway (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    credential_hash CHAR(64) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_gateway_activo (activo)
);

CREATE TABLE IF NOT EXISTS gateway_node_assignment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    gateway_id INT NOT NULL,
    dispositivo_id INT NOT NULL,
    firmware_node_id INT UNSIGNED NOT NULL,
    mac_address CHAR(17) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    nodo_activo_id INT GENERATED ALWAYS AS (IF(activo = 1, dispositivo_id, NULL)) STORED,
    mac_activa CHAR(17) GENERATED ALWAYS AS (IF(activo = 1, mac_address, NULL)) STORED,
    firmware_id_activo INT UNSIGNED GENERATED ALWAYS AS (IF(activo = 1, firmware_node_id, NULL)) STORED,
    firmware_id_global_activo INT UNSIGNED GENERATED ALWAYS AS (IF(activo = 1, firmware_node_id, NULL)) STORED,
    vigente_desde DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    vigente_hasta DATETIME NULL,
    CONSTRAINT fk_gateway_assignment_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT,
    CONSTRAINT fk_gateway_assignment_device FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE RESTRICT,
    UNIQUE KEY uq_gateway_firmware_node (gateway_id, firmware_id_activo),
    UNIQUE KEY uq_gateway_firmware_global_active (firmware_id_global_activo),
    UNIQUE KEY uq_gateway_node_active (nodo_activo_id),
    UNIQUE KEY uq_gateway_mac_active (mac_activa),
    INDEX idx_gateway_assignment_manifest (gateway_id, activo)
);

-- Radio discovery is advisory only. A candidate is never assigned automatically.
CREATE TABLE IF NOT EXISTS gateway_discovery_candidate (
    gateway_id INT NOT NULL,
    firmware_node_id INT UNSIGNED NOT NULL,
    mac_address CHAR(17) NOT NULL,
    boot_id CHAR(36) NULL,
    wire_version VARCHAR(32) NULL,
    firmware_version VARCHAR(64) NULL,
    capabilities JSON NULL,
    first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (gateway_id, firmware_node_id, mac_address),
    CONSTRAINT fk_gateway_candidate_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT,
    INDEX idx_gateway_candidate_seen (gateway_id, last_seen_at)
);

CREATE TABLE IF NOT EXISTS gateway_command (
    id CHAR(36) PRIMARY KEY,
    idempotency_key CHAR(36) NOT NULL UNIQUE,
    dispositivo_id INT NOT NULL,
    gateway_id INT NULL,
    firmware_node_id INT UNSIGNED NULL,
    config_revision VARCHAR(64) NULL COMMENT 'Revisión histórica textual; API nueva usa columnas *_u32',
    config_revision_expected_u32 INT UNSIGNED NULL,
    config_revision_target_u32 INT UNSIGNED NULL,
    tipo VARCHAR(64) NOT NULL,
    payload JSON NOT NULL,
    estado ENUM('EN_COLA','ENTREGADO','RECIBIDO_GATEWAY','RECIBIDO_NODO','APLICADO_NODO','RECHAZADO_NODO','SIN_CONFIRMACION','CANCELADO','CONFIRMADO','FALLIDO','VENCIDO') NOT NULL DEFAULT 'EN_COLA',
    ack_stage ENUM('NONE','RECEIVED','APPLIED','REJECTED','UNKNOWN_CONFIRMED') NOT NULL DEFAULT 'NONE',
    respuesta VARCHAR(500) NULL,
    vence_at DATETIME NOT NULL,
    creado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    entregado_at DATETIME NULL,
    respondido_at DATETIME NULL,
    gateway_received_at DATETIME NULL,
    node_received_at DATETIME NULL,
    node_completed_at DATETIME NULL,
    expired_at DATETIME NULL,
    attempts_gateway INT NOT NULL DEFAULT 0,
    attempts_radio INT NOT NULL DEFAULT 0,
    last_attempt_at DATETIME NULL,
    last_boot_id CHAR(36) NULL,
    last_seq INT UNSIGNED NULL,
    applied_config_revision VARCHAR(64) NULL,
    applied_config_revision_u32 INT UNSIGNED NULL,
    gateway_unknown_ack_at DATETIME NULL,
    late_ack_expires_at DATETIME NULL,
    delivery_lease_id CHAR(36) NULL,
    delivery_lease_expires_at DATETIME NULL,
    delivery_lease_consumed_at DATETIME NULL,
    delivery_attempts INT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT fk_gateway_command_device FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE RESTRICT,
    CONSTRAINT fk_gateway_command_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT,
    INDEX idx_gateway_command_gateway_queue (gateway_id, estado, creado_at),
    INDEX idx_gateway_command_node (dispositivo_id, creado_at)
);


-- =====================================================
-- ASIGNACIÓN DE SENSORES A NODOS
-- =====================================================

-- La asignación representa dónde está instalado el sensor. El canal o
-- puerto pertenece al nodo; no forma parte de la identidad del sensor.
-- Las asignaciones anteriores se conservan con retirado_en para mantener
-- el historial y evitar reprogramaciones innecesarias.
CREATE TABLE IF NOT EXISTS nodo_sensor (
    id INT AUTO_INCREMENT PRIMARY KEY,

    dispositivo_id INT NOT NULL,
    sensor_id INT NOT NULL,
    sensor_firmware_id VARCHAR(100) NULL,
    canal VARCHAR(100) NOT NULL,
    instalado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retirado_en DATETIME NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    notas VARCHAR(500) NULL,

    CONSTRAINT fk_nodo_sensor_dispositivo
        FOREIGN KEY (dispositivo_id)
        REFERENCES dispositivo(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_nodo_sensor_sensor
        FOREIGN KEY (sensor_id)
        REFERENCES sensor(id)
        ON DELETE RESTRICT,

    INDEX idx_nodo_sensor_dispositivo (dispositivo_id),
    INDEX idx_nodo_sensor_sensor (sensor_id),
    INDEX idx_nodo_sensor_activo (activo),
    INDEX idx_nodo_sensor_historial (dispositivo_id, canal, retirado_en)
);

-- Límites por instalación/tipo de dato y metadatos de calibración.
-- Rangos de fabricante quedan NULL hasta que exista referencia verificable.
CREATE TABLE IF NOT EXISTS sensor_measurement_config (
    sensor_id INT NOT NULL,
    tipo_dato_id INT NOT NULL,
    installation_min DECIMAL(18,6) NULL,
    installation_max DECIMAL(18,6) NULL,
    manufacturer_min DECIMAL(18,6) NULL,
    manufacturer_max DECIMAL(18,6) NULL,
    manufacturer_reference VARCHAR(500) NULL,
    calibration_status ENUM('NOT_RECORDED','UNCALIBRATED','CALIBRATED') NOT NULL DEFAULT 'NOT_RECORDED',
    calibration_reference VARCHAR(500) NULL,
    calibrated_at DATETIME NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (sensor_id, tipo_dato_id),
    CONSTRAINT fk_sensor_measurement_config_sensor FOREIGN KEY (sensor_id) REFERENCES sensor(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sensor_measurement_config_type FOREIGN KEY (tipo_dato_id) REFERENCES tipo_dato(id) ON DELETE RESTRICT
);


-- =====================================================
-- LECTURAS
-- =====================================================

CREATE TABLE IF NOT EXISTS lecturas (
    id INT AUTO_INCREMENT PRIMARY KEY,

    dato FLOAT,

    dispositivo_id INT NOT NULL,

    tipo_dato_id INT NOT NULL,

    -- Sensor físico que produjo la lectura. Es opcional para conservar
    -- compatibilidad con lecturas antiguas que solo identificaban el nodo.
    sensor_id INT NULL,
    captured_at DATETIME NULL,
    sample_uptime_ms BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_lectura_dispositivo
        FOREIGN KEY (dispositivo_id)
        REFERENCES dispositivo(id),

    CONSTRAINT fk_lectura_tipo_dato
        FOREIGN KEY (tipo_dato_id)
        REFERENCES tipo_dato(id),

    CONSTRAINT fk_lectura_sensor
        FOREIGN KEY (sensor_id)
        REFERENCES sensor(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS gateway_heartbeat (
    gateway_id INT PRIMARY KEY,
    recibido_at DATETIME NOT NULL,
    CONSTRAINT fk_gateway_heartbeat_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gateway_node_presence (
    gateway_id INT NOT NULL,
    firmware_node_id INT UNSIGNED NOT NULL,
    dispositivo_id INT NOT NULL,
    boot_id CHAR(36) NOT NULL,
    seq INT UNSIGNED NOT NULL,
    firmware_version VARCHAR(64) NULL,
    config_revision_applied VARCHAR(64) NULL,
    config_revision_applied_u32 INT UNSIGNED NULL,
    effective_mode ENUM('OPERATIVO','INACTIVO','EN MANTENIMIENTO') NULL,
    last_applied_command_id CHAR(36) NULL,
    manifest_revision_applied CHAR(64) NULL,
    assignment_revision_applied CHAR(64) NULL,
    recibido_at DATETIME NOT NULL,
    PRIMARY KEY (gateway_id, firmware_node_id),
    CONSTRAINT fk_node_presence_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT,
    CONSTRAINT fk_node_presence_device FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE RESTRICT,
    INDEX idx_node_presence_received (recibido_at)
);

CREATE TABLE IF NOT EXISTS gateway_telemetry_dedupe (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    gateway_id INT NOT NULL,
    firmware_node_id INT UNSIGNED NOT NULL,
    boot_id CHAR(36) NOT NULL,
    seq INT UNSIGNED NOT NULL,
    sensor_id INT NOT NULL,
    tipo_dato_id INT NOT NULL,
    manifest_revision CHAR(64) NOT NULL,
    assignment_revision CHAR(64) NOT NULL,
    lectura_id INT NOT NULL,
    recibido_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_telemetry_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT,
    CONSTRAINT fk_telemetry_sensor FOREIGN KEY (sensor_id) REFERENCES sensor(id) ON DELETE RESTRICT,
    CONSTRAINT fk_telemetry_reading FOREIGN KEY (lectura_id) REFERENCES lecturas(id) ON DELETE CASCADE,
    UNIQUE KEY uq_telemetry_sample (gateway_id, firmware_node_id, boot_id, seq, sensor_id, tipo_dato_id)
);

CREATE TABLE IF NOT EXISTS gateway_telemetry_rejection (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    gateway_id INT NOT NULL,
    dispositivo_id INT NOT NULL,
    firmware_node_id INT UNSIGNED NOT NULL,
    boot_id CHAR(36) NOT NULL,
    seq INT UNSIGNED NOT NULL,
    sensor_id INT NULL,
    sensor_firmware_id VARCHAR(100) NULL,
    canal VARCHAR(100) NULL,
    tipo_dato_id INT NULL,
    received_value DECIMAL(18,6) NULL,
    received_unit VARCHAR(100) NULL,
    validation_details JSON NULL,
    reason VARCHAR(64) NOT NULL,
    manifest_revision CHAR(64) NOT NULL,
    assignment_revision CHAR(64) NOT NULL,
    recibido_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rejection_gateway FOREIGN KEY (gateway_id) REFERENCES gateway(id) ON DELETE RESTRICT,
    CONSTRAINT fk_rejection_device FOREIGN KEY (dispositivo_id) REFERENCES dispositivo(id) ON DELETE RESTRICT,
    INDEX idx_rejection_sample (gateway_id, firmware_node_id, boot_id, seq)
);
