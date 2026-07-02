-- Este script se ejecuta automáticamente la primera vez que se crea
-- el volumen de la base de datos (gracias a /docker-entrypoint-initdb.d/).

CREATE TABLE IF NOT EXISTS lecturas_sensores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  temperatura DECIMAL(5,2) NOT NULL,
  humedad DECIMAL(5,2) NOT NULL,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO lecturas_sensores (temperatura, humedad) VALUES
  (24.5, 60.2),
  (25.1, 58.7),
  (23.8, 62.0);
