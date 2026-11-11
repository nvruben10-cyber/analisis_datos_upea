import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

/**
 * Página del Servidor para el Dashboard IoT.
 * Realiza la validación de autenticación de usuario y pre-carga los datos iniciales
 * de telemetría y estado de los actuadores de relé desde Supabase.
 */
export default async function DashboardPage() {
  const supabase = await createClient();

  // 1. Validar identidad del usuario autenticado
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Obtener las últimas 50 lecturas históricas de sensores
  const { data: lecturasIniciales } = await supabase
    .from("sensores_iot")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(50);

  // 3. Obtener el estado actual de los relés (Relé 1 y Relé 2)
  const { data: actuadoresIniciales } = await supabase
    .from("actuadores_iot")
    .select("*")
    .limit(10);

  return (
    <DashboardClient
      usuarioEmail={user.email || "Operador"}
      lecturasIniciales={lecturasIniciales || []}
      actuadoresIniciales={actuadoresIniciales || []}
    />
  );
}

