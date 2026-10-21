const ejes = [
  ["largo_inicio", "largo_fin"],
  ["ancho_inicio", "ancho_fin"],
];

export function zonasSeTraslapan(a, b) {
  return ejes.every(([inicio, fin]) =>
    Number(a[inicio]) < Number(b[fin]) &&
    Number(a[fin]) > Number(b[inicio]),
  );
}
