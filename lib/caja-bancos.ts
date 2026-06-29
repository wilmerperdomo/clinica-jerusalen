/** Bancos comunes en Honduras para registrar transferencias en caja */
export const BANCOS_HONDURAS = [
  'BAC Honduras',
  'BANHCAFE',
  'BANPAÍS',
  'BANRURAL',
  'BANTRAB',
  'Banco Atlántida',
  'Banco Azteca',
  'Banco de Occidente',
  'Banco del País (BANPAÍS)',
  'Banco Ficohsa',
  'Banco Lafise',
  'Banco Popular',
  'Banco Promerica',
  'Banco Davivienda',
  'Banco Cuscatlán',
  'Banco de los Trabajadores (BANTRAB)',
  'Banco de Honduras (BCH)',
  'Banco Hondureño del Café (BANHCAFE)',
  'Banco Nacional de Desarrollo Agrícola (BANADESA)',
  'Banco Central de Honduras',
  'Otro',
] as const

export type BancoHonduras = (typeof BANCOS_HONDURAS)[number]
