import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Container } from "react-bootstrap";

import { API_URL } from "../../utils/api";

function Login() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleLogin() {
    if (!usuario || !password) {
      setError("Usuario y contraseña son obligatorios");
      return;
    }

    setCargando(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      });

      const datos = await res.json();

      if (!res.ok) {
        setError(datos.error);
        return;
      }

      login(datos.token);
      navigate("/");
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setCargando(false);
    }
  }

  return (
    <Container className="login-section">
      <div className="login-card card-component">
        <h2>Iniciar sesión</h2>
        <p>Accede para gestionar el invernadero</p>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="form-group mb-3">
          <label className="form-label fw-bold">Usuario</label>
          <input
            type="text"
            className="form-control"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="admin"
          />
        </div>

        <div className="form-group mb-3">
          <label className="form-label fw-bold">Contraseña</label>
          <input
            type="password"
            className="form-control"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
        </div>

        <button
          className="btn btn-success w-100"
          onClick={handleLogin}
          disabled={cargando}
        >
          {cargando ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </Container>
  );
}

export default Login;
