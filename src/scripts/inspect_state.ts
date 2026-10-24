import { supabase } from '../api/supabaseClient.js';

async function check() {
  console.log('--- INSPECTING RECENT MOVIMIENTOS ---');
  const { data: movs, error: errMovs } = await supabase
    .from('movimientos_inventario')
    .select('id, fecha_hora, tipo_movimiento, cantidad, volumen_m3, documento_referencia, notas, articulo:articulos(sku, nombre)')
    .order('fecha_hora', { ascending: false })
    .limit(10);

  if (errMovs) console.error('Error movs:', errMovs);
  else console.log('Movs:', JSON.stringify(movs, null, 2));

  console.log('--- INSPECTING RECENT PEDIDOS ---');
  const { data: peds, error: errPeds } = await supabase
    .from('pedidos')
    .select('id, numero_pedido, estado, modalidad_entrega, cliente:clientes(razon_social), actualizado_en')
    .order('actualizado_en', { ascending: false })
    .limit(5);

  if (errPeds) console.error('Error peds:', errPeds);
  else console.log('Pedidos:', JSON.stringify(peds, null, 2));

  console.log('--- INSPECTING INVENTARIO CON RESERVAS ---');
  const { data: inv, error: errInv } = await supabase
    .from('inventario')
    .select('id, articulo_id, cantidad_disponible, cantidad_reservada, volumen_m3, articulo:articulos(sku)')
    .gt('cantidad_reservada', 0);

  if (errInv) console.error('Error inv:', errInv);
  else console.log('Inventario con reservas:', JSON.stringify(inv, null, 2));
}

check();
