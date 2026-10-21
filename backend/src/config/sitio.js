export const DIMENSIONES_SITIO = {
  largo: 9.7,
  ancho: 6.72,
  altura: 2.55,
};

export const ZONAS_INICIALES = Array.from({ length: 5 }, (_, indice) => {
  const inicio = Number(((DIMENSIONES_SITIO.largo / 5) * indice).toFixed(3));
  const fin = indice === 4
    ? DIMENSIONES_SITIO.largo
    : Number(((DIMENSIONES_SITIO.largo / 5) * (indice + 1)).toFixed(3));

  return {
    zona: `Zona ${indice + 1}`,
    largo_inicio: inicio,
    largo_fin: fin,
    ancho_inicio: 0,
    ancho_fin: DIMENSIONES_SITIO.ancho,
    altura_inicio: 0,
    altura_fin: DIMENSIONES_SITIO.altura,
  };
});
