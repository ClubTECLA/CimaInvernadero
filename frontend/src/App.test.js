import { render, screen } from "@testing-library/react";
import AppErrorBoundary from "./components/AppErrorBoundary";

function ComponenteConError() {
  throw new Error("Error de prueba");
}

test("muestra una recuperación clara cuando una pantalla falla", () => {
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  render(
    <AppErrorBoundary>
      <ComponenteConError />
    </AppErrorBoundary>,
  );

  expect(screen.getByText("Ocurrió un problema inesperado")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Recargar pantalla" })).toBeInTheDocument();

  errorSpy.mockRestore();
});
