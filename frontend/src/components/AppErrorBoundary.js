import React from "react";

export default class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Error no controlado en la interfaz:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-error-boundary" role="alert">
        <div className="app-error-boundary__card">
          <span className="app-error-boundary__eyebrow">La pantalla no pudo cargarse</span>
          <h1>Ocurrió un problema inesperado</h1>
          <p>La información no se modificó. Puede intentar cargar la pantalla nuevamente.</p>
          <button type="button" className="btn btn-success" onClick={() => window.location.reload()}>
            Recargar pantalla
          </button>
        </div>
      </main>
    );
  }
}
