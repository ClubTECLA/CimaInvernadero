import test from "node:test";
import assert from "node:assert/strict";
import { zonasSeTraslapan } from "./zonas.js";

function caja(largoInicio, largoFin, anchoInicio = 0, anchoFin = 6.72, alturaInicio = 0, alturaFin = 2.55) {
  return {
    largo_inicio: largoInicio,
    largo_fin: largoFin,
    ancho_inicio: anchoInicio,
    ancho_fin: anchoFin,
    altura_inicio: alturaInicio,
    altura_fin: alturaFin,
  };
}

test("zonas contiguas que solo comparten el borde no se traslapan", () => {
  assert.equal(zonasSeTraslapan(caja(0, 1.94), caja(1.94, 3.88)), false);
});

test("detecta un traslape aunque sea de un centímetro", () => {
  assert.equal(zonasSeTraslapan(caja(0, 1.95), caja(1.94, 3.88)), true);
});

test("no considera traslape cuando coinciden en largo pero no en ancho", () => {
  assert.equal(zonasSeTraslapan(caja(0, 2, 0, 2), caja(0, 2, 2, 4)), false);
});

test("la altura no cambia el traslape de zonas, que se define solo en 2D", () => {
  assert.equal(zonasSeTraslapan(caja(0, 2, 0, 2, 0, 1), caja(1, 3, 1, 3, 1, 3)), true);
});
