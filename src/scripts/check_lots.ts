import { supabase } from '../api/supabaseClient.js';

async function check() {
  const clienteId = '1832eaab-805b-47ea-9b7e-b6d40ab0c967';
  console.log('=== LOTES DE ESTE CLIENTE EN lotes_cliente ===');
  const { data: lotes, error: errL } = await supabase
    .from('lotes_cliente')
    .select('*')
    .eq('cliente_id', clienteId);

  if (errL) console.error('Error lotes_cliente:', errL);
  else console.log('Lotes del cliente:', lotes);

  console.log('=== TODO EL INVENTARIO DE ESTE CLIENTE ===');
  const { data: inv, error: errI } = await supabase
    .from('inventario')
    .select(`
      id, articulo_id, lote_id, ubicacion_id, cantidad_disponible, cantidad_reservada,
      articulo:articulos(id, sku, nombre),
      lote:lotes_cliente(id, numero_lote),
      ubicacion:ubicaciones(codigo_etiqueta)
    `)
    .eq('cliente_id', clienteId);

  if (errI) console.error('Error inv:', errI);
  else console.log('Inventario del cliente:', inv);
}

check();
