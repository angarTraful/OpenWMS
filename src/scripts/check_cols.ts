import { supabase } from '../api/supabaseClient.js';

async function check() {
  const { data, error } = await supabase
    .from('pedidos_detalle')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching pedidos_detalle:', error);
  } else {
    console.log('Sample row from pedidos_detalle:', data);
  }
}

check();
