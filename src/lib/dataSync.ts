/**
 * Sincronización Global de Datos WMS
 * Permite notificar a todos los monitores y vistas que ha ocurrido un cambio en el backend
 * (Picking, Despacho, Putaway, Movimiento, Remito o Edición) para que se refresquen automáticamente.
 */

export function notifyDataChanged() {
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('wms:data-changed'));
    } catch {
      // Ignorar en entornos fuera de navegador
    }
  }
}
