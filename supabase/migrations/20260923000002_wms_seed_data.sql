-- ==============================================================================
-- OPENWMS 3PL - SEED DATA REALISTA Y OPERATIVO
-- Clientes Depositantes Multirrubro, Racks, LPNs, Existencias M3 y Transacciones
-- Idioma: Español Latinoamericano (es-419)
-- ==============================================================================

-- 1. ALMACÉN CENTRAL
INSERT INTO almacenes (id, codigo, nombre, direccion, activo)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'ALM-NORTE-01',
  'Centro de Distribución Logístico Norte - Hub Buenos Aires',
  'Av. Panamericana Km 34.5, Pacheco, Buenos Aires',
  true
)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre;

-- 2. ZONAS DEL ALMACÉN
INSERT INTO zonas (id, almacen_id, codigo, nombre, tipo_zona, activo)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Z-REC', 'Playa de Recepción & Staging Inbound', 'recepcion', true),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Z-RCK-A', 'Racks Convencionales Pasillo A (Alimentos & Retail)', 'almacenamiento', true),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Z-RCK-B', 'Racks Climatizados Pasillo B (Farma & Tech)', 'almacenamiento', true),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Z-PCK', 'Área de Picking y Fraccionado (Nivel 0)', 'picking', true),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Z-QUA', 'Área de Cuarentena y Control Calidad', 'cuarentena', true),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Z-DES', 'Playa de Despacho & Consolidación Outbound', 'despacho', true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre;

-- 3. UBICACIONES FÍSICAS (RACKS Y PLAYAS)
INSERT INTO ubicaciones (id, almacen_id, zona_id, codigo_etiqueta, pasillo, estante, nivel, posicion, capacidad_peso_kg, capacidad_volumen_m3, permite_mezcla_clientes, estado)
VALUES
  -- Playa de Recepción (Inbound Staging)
  ('b1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'REC-STG-01', 'REC', '01', '01', '01', 25000.00, 100.000, true, 'activa'),
  ('b1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'REC-STG-02', 'REC', '01', '01', '02', 25000.00, 100.000, true, 'activa'),

  -- Racks Pasillo A (Alimentos / Consumo Masivo)
  ('b1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'A01-E01-N01-P01', 'A01', 'E01', 'N01', 'P01', 1200.00, 2.500, false, 'activa'),
  ('b1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'A01-E01-N02-P01', 'A01', 'E01', 'N02', 'P01', 1200.00, 2.500, false, 'activa'),
  ('b1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'A01-E02-N01-P01', 'A01', 'E02', 'N01', 'P01', 1200.00, 2.500, false, 'activa'),
  ('b1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'A01-E02-N02-P01', 'A01', 'E02', 'N02', 'P01', 1200.00, 2.500, false, 'activa'),
  ('b1000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'A02-E01-N01-P01', 'A02', 'E01', 'N01', 'P01', 1200.00, 2.500, false, 'activa'),
  ('b1000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'A02-E01-N02-P01', 'A02', 'E01', 'N02', 'P01', 1200.00, 2.500, false, 'activa'),

  -- Racks Pasillo B (Farma & Tech)
  ('b1000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'B01-E01-N01-P01', 'B01', 'E01', 'N01', 'P01', 1000.00, 2.200, false, 'activa'),
  ('b1000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'B01-E01-N02-P01', 'B01', 'E01', 'N02', 'P01', 1000.00, 2.200, false, 'activa'),
  ('b1000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'B01-E02-N01-P01', 'B01', 'E02', 'N01', 'P01', 1000.00, 2.200, false, 'activa'),
  ('b1000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'B02-E01-N01-P01', 'B02', 'E01', 'N01', 'P01', 1000.00, 2.200, false, 'activa'),
  ('b1000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'B02-E01-N02-P01', 'B02', 'E01', 'N02', 'P01', 1000.00, 2.200, false, 'activa'),

  -- Zona Picking Fraccionado
  ('b1000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'PCK-MOD-01', 'PCK', '01', '00', '01', 500.00, 1.200, true, 'activa'),
  ('b1000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'PCK-MOD-02', 'PCK', '01', '00', '02', 500.00, 1.200, true, 'activa'),

  -- Cuarentena
  ('b1000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 'QUA-ISO-01', 'QUA', '01', '01', '01', 1200.00, 2.500, true, 'bloqueada'),

  -- Playa de Despacho (Outbound Staging)
  ('b1000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006', 'DES-RAM-01', 'DES', '01', '01', '01', 30000.00, 150.000, true, 'activa'),
  ('b1000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006', 'DES-RAM-02', 'DES', '01', '01', '02', 30000.00, 150.000, true, 'activa')
ON CONFLICT (id) DO NOTHING;

-- 4. CLIENTES DEPOSITANTES 3PL
INSERT INTO clientes (id, codigo, razon_social, unidad_negocio, identificacion_fiscal, direccion, telefono, email_contacto, activo)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'CLI-AND-001', 'Distribuidora Alimentos Andina S.A.', 'Consumo Masivo & Retail', '30-71234567-8', 'Ruta 8 Km 60, Pilar, Buenos Aires', '+54 11 4789-1000', 'logistica@alimentosandina.com.ar', true),
  ('c0000000-0000-0000-0000-000000000002', 'CLI-FAR-002', 'Laboratorios Roemmers & Farma Corp', 'Farmacéutica & Cosmética', '30-50239841-3', 'Fray Justo Sta. María de Oro 1744, CABA', '+54 11 4778-9000', 'supplychain@roemmersfarma.com.ar', true),
  ('c0000000-0000-0000-0000-000000000003', 'CLI-NEX-003', 'Nexus Tech Distribution S.R.L.', 'Electrónica & Informática', '30-79841256-5', 'Av. del Libertador 6800, CABA', '+54 11 5236-4000', 'deposito@nexustech.la', true)
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  razon_social = EXCLUDED.razon_social,
  unidad_negocio = EXCLUDED.unidad_negocio;

-- 5. DESTINATARIOS / SUCURSALES AUTORIZADAS
INSERT INTO destinatarios (id, cliente_id, codigo_sucursal, razon_social, direccion_entrega, ciudad, contacto_recepcion, telefono, ventana_horaria_entrega, activo)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'SUC-CABA-01', 'Hipermercado Andina Palermo', 'Av. Juan B. Justo 1500', 'CABA', 'Marcelo Gómez', '+54 11 4771-2233', '06:00 - 11:00', true),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'SUC-ROS-02', 'Supermercados del Litoral Rosario', 'Bv. Oroño 3400', 'Rosario, Santa Fe', 'Andrea Ríos', '+54 341 455-8899', '07:00 - 13:00', true),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'HOSP-GAR-01', 'Hospital de Pediatría Prof. Dr. Garrahan', 'Pichincha 1890', 'CABA', 'Farm. Lucía Benítez', '+54 11 4122-6000', '08:00 - 16:00', true),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'DROG-SUD-02', 'Droguería Central del Sud', 'Corrientes 4500', 'Córdoba Capital', 'Dr. Pablo Martínez', '+54 351 480-1122', '06:00 - 12:00', true),
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003', 'TECH-MEGA-01', 'MegaStore Tecnológico Unicenter', 'Paraná 3745', 'Martínez, Buenos Aires', 'Esteban Suárez', '+54 11 4717-9900', '09:00 - 13:00', true)
ON CONFLICT (id) DO NOTHING;

-- 6. CATEGORÍAS Y SUBCATEGORÍAS
INSERT INTO categorias_articulos (id, codigo, nombre, descripcion, activo)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'CAT-ALIM', 'Alimentos Secos y Conservas', 'Comestibles no perecederos de alta rotación', true),
  ('e0000000-0000-0000-0000-000000000002', 'CAT-FARM', 'Medicamentos y Salud', 'Fármacos hospitalarios y dermatológicos', true),
  ('e0000000-0000-0000-0000-000000000003', 'CAT-TECH', 'Hardware y Computación', 'Equipamiento tecnológico y movilidad industrial', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO subcategorias_articulos (id, categoria_id, codigo, nombre, descripcion, activo)
VALUES
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'SUB-ACE-PAS', 'Aceites y Pastas', 'Aceites vegetales y fideos secos', true),
  ('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'SUB-GALLET', 'Galletitas y Snacks', 'Galletitas dulces y crackers', true),
  ('e1000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 'SUB-HOSP', 'Soluciones Parenterales', 'Sueros fisiológicos y dextrosas', true),
  ('e1000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000002', 'SUB-DERM', 'Dermatología', 'Cremas, pomadas y cicatrizantes', true),
  ('e1000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000003', 'SUB-MONIT', 'Pantallas & Monitores', 'Displays LED y monitores de oficina/gaming', true),
  ('e1000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000003', 'SUB-MOBIL', 'Movilidad & Auto-ID', 'Tablets rugerizadas y terminales barcode', true)
ON CONFLICT (id) DO NOTHING;

-- 7. CATÁLOGO MAESTRO DE ARTÍCULOS (CON CUBICAJE M3)
INSERT INTO articulos (id, cliente_id, categoria_id, subcategoria_id, sku, codigo_barras, nombre, descripcion, unidad_medida, unidades_por_bulto, bultos_por_pallet, rotacion_abc, valor_declarado, moneda, peso_unitario_kg, volumen_unitario_m3, activo)
VALUES
  -- Cliente Andina (Alimentos)
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'AND-ACE-01', '7791234567011', 'Aceite de Oliva Extra Virgen 500ml', 'Caja x12 botellas de vidrio 500ml', 'caja', 12.00, 80, 'A', 48.00, 'USD', 10.500, 0.0240, true),
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'AND-PAS-02', '7791234567028', 'Fideos Spaghetti Semolados 500g', 'Caja x20 paquetes 500g', 'caja', 20.00, 60, 'A', 22.50, 'USD', 10.200, 0.0350, true),
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'AND-GAL-03', '7791234567035', 'Galletitas Dulces Surtidas 400g', 'Caja x18 paquetes 400g', 'caja', 18.00, 50, 'B', 19.80, 'USD', 7.500, 0.0400, true),

  -- Cliente Roemmers (Farma)
  ('f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000003', 'FAR-SUE-01', '7795023900015', 'Solución Fisiológica 0.9% 500ml', 'Caja x24 sachets estériles hospitalarios', 'caja', 24.00, 54, 'B', 65.00, 'USD', 12.800, 0.0300, true),
  ('f0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000004', 'FAR-DER-02', '7795023900022', 'Crema Dérmica Regeneradora 100g', 'Caja x48 pomadas individuales', 'caja', 48.00, 72, 'B', 145.00, 'USD', 6.200, 0.0180, true),
  ('f0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000003', 'FAR-ANA-03', '7795023900039', 'Analgésico Inyectable Hospitalario', 'Caja x100 ampollas 2ml vidrio ámbar', 'caja', 100.00, 90, 'C', 310.00, 'USD', 3.800, 0.0120, true),

  -- Cliente Nexus Tech (Electrónica)
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000005', 'NEX-MON-01', '8806091234018', 'Monitor Gamer IPS 27" QHD 165Hz', 'Caja individual con pie y cables HDMI/DP', 'unidad', 1.00, 24, 'C', 285.00, 'USD', 6.900, 0.0650, true),
  ('f0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000006', 'NEX-TAB-02', '8806091234025', 'Tablet Rugged Industrial IP68 10"', 'Embalaje reforzado con docking y stylus', 'unidad', 1.00, 48, 'C', 620.00, 'USD', 1.450, 0.0150, true),
  ('f0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000006', 'NEX-SCA-03', '8806091234032', 'Lector Láser Barcode 2D Bluetooth', 'Caja con base de carga USB y receptor', 'unidad', 1.00, 80, 'B', 175.00, 'USD', 0.850, 0.0080, true)
ON CONFLICT (cliente_id, sku) DO NOTHING;

-- 8. LOTES DE CLIENTE
INSERT INTO lotes_cliente (id, cliente_id, numero_lote, fecha_fabricacion, fecha_vencimiento, bloqueado, motivo_bloqueo)
VALUES
  ('f1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'L-AND-2026-A1', '2026-01-10', '2027-06-30', false, null),
  ('f1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'L-AND-2026-A2', '2026-02-15', '2027-08-31', false, null),
  ('f1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'L-FAR-260301', '2026-03-01', '2028-03-01', false, null),
  ('f1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'L-FAR-260315', '2026-03-15', '2027-09-15', false, null),
  ('f1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003', 'L-NEX-SN-2026', '2026-01-20', null, false, null)
ON CONFLICT (cliente_id, numero_lote) DO NOTHING;

-- 9. PALLETS LPN (LICENSE PLATE NUMBERS)
INSERT INTO pallets_lpn (id, cliente_id, codigo_lpn, tipo_pallet, volumen_total_m3, peso_total_kg, estado)
VALUES
  ('f2000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'PLT-2026-000101', 'arlog', 1.9200, 840.000, 'en_stock'),
  ('f2000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'PLT-2026-000102', 'arlog', 2.1000, 612.000, 'en_stock'),
  ('f2000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'PLT-2026-000103', 'madera', 2.0000, 375.000, 'en_stock'),
  ('f2000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'PLT-2026-000104', 'plastico', 1.6200, 691.200, 'en_stock'),
  ('f2000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'PLT-2026-000105', 'plastico', 1.2960, 446.400, 'en_stock'),
  ('f2000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', 'PLT-2026-000106', 'madera', 1.5600, 165.600, 'en_stock'),
  ('f2000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000003', 'PLT-2026-000107', 'madera', 0.7200, 69.600, 'en_stock')
ON CONFLICT (id) DO NOTHING;

-- 10. INVENTARIO FÍSICO (STOCK CON CUBICAJE M3 VALORIZADO)
INSERT INTO inventario (id, cliente_id, lote_id, articulo_id, almacen_id, ubicacion_id, pallet_id, cantidad_disponible, cantidad_reservada, volumen_m3, unidad_medida)
VALUES
  -- Andina: Aceite (80 cajas = 1.92 m³) en A01-E01-N01-P01
  ('f3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'f2000000-0000-0000-0000-000000000001', 80.00, 0.00, 1.9200, 'caja'),

  -- Andina: Fideos (60 cajas = 2.10 m³) en A01-E01-N02-P01
  ('f3000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000002', 60.00, 0.00, 2.1000, 'caja'),

  -- Andina: Galletitas (50 cajas = 2.00 m³) en A01-E02-N01-P01
  ('f3000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000003', 50.00, 0.00, 2.0000, 'caja'),

  -- Farma: Suero (54 cajas = 1.62 m³) en B01-E01-N01-P01
  ('f3000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000009', 'f2000000-0000-0000-0000-000000000004', 54.00, 0.00, 1.6200, 'caja'),

  -- Farma: Crema Dérmica (72 cajas = 1.296 m³) en B01-E01-N02-P01
  ('f3000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000010', 'f2000000-0000-0000-0000-000000000005', 72.00, 0.00, 1.2960, 'caja'),

  -- Nexus: Monitores (24 unidades = 1.56 m³) en B01-E02-N01-P01
  ('f3000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000011', 'f2000000-0000-0000-0000-000000000006', 24.00, 0.00, 1.5600, 'unidad'),

  -- Nexus: Tablets (48 unidades = 0.72 m³) en B02-E01-N01-P01
  ('f3000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000012', 'f2000000-0000-0000-0000-000000000007', 48.00, 0.00, 0.7200, 'unidad'),

  -- Nexus: Lectores Barcode en Picking Modulo 1 (60 unidades = 0.48 m³)
  ('f3000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000014', null, 60.00, 0.00, 0.4800, 'unidad')
ON CONFLICT (id) DO NOTHING;

-- 11. INBOUND: ÓRDENES DE RECEPCIÓN
-- Orden 1: Finalizada
INSERT INTO ordenes_recepcion (id, cliente_id, almacen_id, numero_recepcion, nro_contenedor_oc, tipo_contenedor, fecha_hora_arribo, transporte_empresa, chofer_nombre, patente_camion, estado, observaciones)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'REC-2026-0001',
  'OC-AND-99120',
  'Furgón Térmico',
  now() - interval '2 days',
  'Transportes Expreso Pampeano',
  'Jorge Peralta',
  'AD 889 RT',
  'finalizada',
  'Ingreso completo de aceite y fideos sin novedades de calidad.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ordenes_recepcion_detalle (id, recepcion_id, articulo_id, lote_declarado, fecha_vencimiento, cantidad_esperada, ubicacion_sugerida_id, comentarios)
VALUES (
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  'L-AND-2026-A1',
  '2027-06-30',
  80.00,
  'b1000000-0000-0000-0000-000000000003',
  'Paletizado completo estandar 80 cajas'
)
ON CONFLICT (id) DO NOTHING;

-- Orden 2: En Playa / Control con Tarea de Putaway Pendiente (Interactiva en UI)
INSERT INTO ordenes_recepcion (id, cliente_id, almacen_id, numero_recepcion, nro_contenedor_oc, tipo_contenedor, fecha_hora_arribo, transporte_empresa, chofer_nombre, chofer_documento, patente_camion, estado, observaciones)
VALUES (
  'a1000000-0000-0000-0000-000000000002',
  'c0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'REC-2026-0002',
  'MSKU-789234-1',
  '40ft High Cube Marítimo',
  now() - interval '2 hours',
  'Logística Multimodal del Plata',
  'Carlos Méndez',
  '28.455.912',
  'AF 342 LK',
  'en_control',
  'Contenedor arribado del Puerto de BsAs. Precinto intacto ML-88912.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ordenes_recepcion_detalle (id, recepcion_id, articulo_id, lote_declarado, fecha_vencimiento, cantidad_esperada, ubicacion_sugerida_id, comentarios)
VALUES (
  'a2000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000002',
  'f0000000-0000-0000-0000-000000000004',
  'L-FAR-260315',
  '2027-09-15',
  54.00,
  'b1000000-0000-0000-0000-000000000010',
  'Esperando confirmación de guardado en rack B01'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tareas_putaway_control (id, recepcion_detalle_id, articulo_id, lote_id, pallet_id, cantidad_recibida, volumen_calculado_m3, ubicacion_origen_id, ubicacion_destino_id, estado)
VALUES (
  'a3000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000002',
  'f0000000-0000-0000-0000-000000000004',
  'f1000000-0000-0000-0000-000000000004',
  null,
  0.00,
  0.0000,
  'b1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000010',
  'pendiente'
)
ON CONFLICT (id) DO NOTHING;

-- 12. OUTBOUND: PEDIDOS DE CLIENTES Y TAREAS DE PICKING
-- Pedido 1: En Picking con Tarea Pendiente (Interactiva en UI)
INSERT INTO pedidos (id, cliente_id, destinatario_id, numero_pedido, orden_compra_cliente, fecha_solicitud, fecha_compromiso_entrega, prioridad, estado, observaciones)
VALUES (
  'a4000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'd0000000-0000-0000-0000-000000000005',
  'PED-2026-0001',
  'OC-MEGA-4421',
  now() - interval '4 hours',
  now() + interval '1 day',
  'normal',
  'en_picking',
  'Despacho para apertura de sucursal Unicenter.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pedidos_detalle (id, pedido_id, articulo_id, cantidad_solicitada, cantidad_reservada, cantidad_separada)
VALUES (
  'a5000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000009',
  12.00,
  12.00,
  0.00
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tareas_picking (id, pedido_id, pedido_detalle_id, articulo_id, lote_id, pallet_origen_id, ubicacion_origen_id, cantidad_a_recolectar, cantidad_recolectada, observaciones_picking, estado)
VALUES (
  'a6000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000009',
  'f1000000-0000-0000-0000-000000000005',
  null,
  'b1000000-0000-0000-0000-000000000014',
  12.00,
  0.00,
  'Recolectar 12 lectores láser de la posición PCK-MOD-01',
  'pendiente'
)
ON CONFLICT (id) DO NOTHING;

-- 13. ÓRDENES DE SALIDA Y REMITOS DE TRÁNSITO RX
INSERT INTO ordenes_salida (id, almacen_id, numero_orden_salida, fecha_salida_programada, estado, observaciones)
VALUES (
  'a7000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'OS-2026-0001',
  now() + interval '5 hours',
  'remitida',
  'Salida consolidada Corredor Norte'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ordenes_salida_pedidos (id, orden_salida_id, pedido_id)
VALUES (
  'a8000000-0000-0000-0000-000000000001',
  'a7000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO remitos_transito (id, orden_salida_id, pedido_id, cliente_id, destinatario_id, numero_remito_rx, cae_o_autorizacion_fiscal, fecha_emision, total_bultos, total_pallets, peso_total_kg, volumen_total_m3, valor_declarado_total, estado)
VALUES (
  'a9000000-0000-0000-0000-000000000001',
  'a7000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  'd0000000-0000-0000-0000-000000000005',
  'RX-0001-00045892',
  'CAE-74291849182394',
  now(),
  12,
  1,
  10.200,
  0.0960,
  2100.00,
  'emitido'
)
ON CONFLICT (id) DO NOTHING;

-- 14. KARDEX INMUTABLE (ASIENTOS HISTÓRICOS DE STOCK)
INSERT INTO movimientos_inventario (id, cliente_id, lote_id, articulo_id, pallet_id, ubicacion_origen_id, ubicacion_destino_id, tipo_movimiento, cantidad, volumen_m3, documento_referencia, notas, fecha_hora)
VALUES
  ('aa000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'recepcion', 80.00, 1.9200, 'REC-2026-0001', 'Ingreso inicial por putaway', now() - interval '2 days'),
  ('aa000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'recepcion', 60.00, 2.1000, 'REC-2026-0001', 'Ingreso inicial por putaway', now() - interval '2 days'),
  ('aa000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000009', 'recepcion', 54.00, 1.6200, 'REC-2026-0001', 'Ingreso paletizado Farma', now() - interval '1 day'),
  ('aa000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000007', 'f2000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000011', 'recepcion', 24.00, 1.5600, 'REC-2026-0001', 'Ingreso monitores IPS', now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;
