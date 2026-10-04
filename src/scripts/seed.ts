import { supabase } from '../api/supabaseClient';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('📦 OpenWMS 3PL - Iniciando Verificación & Seed Data...');

  // 1. Verificar conexión a Supabase
  const { data: almacenes, error: errAlm } = await supabase.from('almacenes').select('*');
  if (errAlm) {
    console.error('❌ Error conectando a Supabase:', errAlm.message);
    process.exit(1);
  }

  console.log(`✅ Conexión establecida con Supabase PostgreSQL 17.`);
  console.log(`🏢 Almacenes registrados: ${almacenes?.length || 0}`);

  // 2. Reporte de entidades pobladas
  const [
    { count: clientesCount },
    { count: articulosCount },
    { count: inventarioCount },
    { count: recepcionesCount },
    { count: pedidosCount },
    { count: kardexCount },
  ] = await Promise.all([
    supabase.from('clientes').select('*', { count: 'exact', head: true }),
    supabase.from('articulos').select('*', { count: 'exact', head: true }),
    supabase.from('inventario').select('*', { count: 'exact', head: true }),
    supabase.from('ordenes_recepcion').select('*', { count: 'exact', head: true }),
    supabase.from('pedidos').select('*', { count: 'exact', head: true }),
    supabase.from('movimientos_inventario').select('*', { count: 'exact', head: true }),
  ]);

  console.log('----------------------------------------------------');
  console.log(`👥 Clientes 3PL:              ${clientesCount || 0}`);
  console.log(`🏷️  Artículos / SKUs:           ${articulosCount || 0}`);
  console.log(`📦 Posiciones Inventario:       ${inventarioCount || 0}`);
  console.log(`🚢 Órdenes de Recepción:       ${recepcionesCount || 0}`);
  console.log(`📋 Pedidos Solicitados:        ${pedidosCount || 0}`);
  console.log(`📜 Asientos de Kardex:         ${kardexCount || 0}`);
  console.log('----------------------------------------------------');

  // 3. Resumen de M3 por cliente
  const { data: invRows } = await supabase
    .from('inventario')
    .select('volumen_m3, cliente:clientes(razon_social)');

  const m3ByClient: Record<string, number> = {};
  (invRows || []).forEach((row: any) => {
    const name = row.cliente?.razon_social || 'Desconocido';
    m3ByClient[name] = (m3ByClient[name] || 0) + Number(row.volumen_m3 || 0);
  });

  console.log('📊 Volumen Cúbico (M3) Ocupado por Cliente 3PL:');
  Object.entries(m3ByClient).forEach(([cli, m3]) => {
    console.log(`   - ${cli}: ${m3.toFixed(3)} m³`);
  });

  console.log('\n✨ ¡Base de datos OpenWMS 3PL lista y operativa!');
}

main().catch((err) => {
  console.error('Fatal seed script error:', err);
  process.exit(1);
});
