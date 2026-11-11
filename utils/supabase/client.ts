import { createBrowserClient } from "@supabase/ssr";

/**
 * Crea una instancia del cliente Supabase para ser utilizada
 * en componentes del lado del cliente ('use client').
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  return createBrowserClient(supabaseUrl, supabaseKey);
}
