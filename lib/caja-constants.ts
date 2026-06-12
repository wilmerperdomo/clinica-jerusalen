import { ArrowRightLeft, Banknote, Clock, CreditCard } from 'lucide-react'

export const FORMAS_PAGO = [
  { key: 'EFECTIVO',      label: 'Efectivo',      icon: Banknote },
  { key: 'TARJETA',       label: 'Tarjeta',        icon: CreditCard },
  { key: 'TRANSFERENCIA', label: 'Transferencia',  icon: ArrowRightLeft },
  { key: 'CREDITO',       label: 'A Crédito',      icon: Clock },
] as const
