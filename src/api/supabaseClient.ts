import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';

const supabaseUrl =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  'https://zgrsagjhrwvutrxihhng.supabase.co';

const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpncnNhZ2pocnd2dXRyeGloaG5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNjM3MDYsImV4cCI6MjEwNTczOTcwNn0.05-pypAcRgCFv6cC2yi6_GcwRvoMtJQMG6500UjadD4';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
