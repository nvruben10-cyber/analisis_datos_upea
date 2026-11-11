import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

/**
 * Servidor SCADA IoT para Proyecto de Grado:
 * Recupera telemetría, estado de actuadores, inventario de nodos,
 * eventos de auditoría y alertas agronómicas activas.
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

  // 2. Telemetría reciente de sensores
  const { data: lecturasIniciales } = await supabase
    .from("sensores_iot")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(50);

  // 3. Actuadores de relé (Bomba y Ventilación)
  const { data: actuadoresIniciales } = await supabase
    .from("actuadores_iot")
    .select("*");

  // 4. Catálogo de Nodos / Dispositivos
  const { data: dispositivosIniciales } = await supabase
    .from("dispositivos_iot")
    .select("*");

  // 5. Alertas e incidentes
  const { data: alertasIniciales } = await supabase
    .from("alertas_incidentes_iot")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(10);

  // 6. Bitácora de auditoría de comandos
  const { data: auditoriaInicial } = await supabase
    .from("auditoria_comandos_actuadores")
    .select("*")
    .order("fecha_ejecucion", { ascending: false })
    .limit(15);

  return (
    <DashboardClient
      usuarioEmail={user.email || "Investigador UPEA"}
      lecturasIniciales={lecturasIniciales || []}
      actuadoresIniciales={actuadoresIniciales || []}
      dispositivosIniciales={dispositivosIniciales || []}
      alertasIniciales={alertasIniciales || []}
      auditoriaInicial={auditoriaInicial || []}
    />
  );
}
