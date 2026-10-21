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
-- ZONAS
-- =====================================================

CREATE TABLE IF NOT EXISTS zona (
    id INT AUTO_INCREMENT PRIMARY KEY,
    zona VARCHAR(255)
);


-- =====================================================
-- TIPOS DE DISPOSITIVO
-- =====================================================

CREATE TABLE IF NOT EXISTS tipo_dispositivo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255),
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
        'ACTIVO',
        'INACTIVO',
        'RETIRADO',
        'FALLANDO'
    ) NOT NULL DEFAULT 'ACTIVO',

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
