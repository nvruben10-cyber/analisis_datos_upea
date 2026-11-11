import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

/**
 * Página principal raíz: Verifica si el usuario cuenta con sesión activa
 * y lo redirige automáticamente a la sección correspondiente.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}

