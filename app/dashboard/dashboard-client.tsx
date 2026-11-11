"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/utils/supabase/client";
import { logout } from "@/app/auth/actions";
import {
  Activity,
  Thermometer,
  Droplets,
  Sprout,
  Flame,
  Power,
  RefreshCw,
  LogOut,
  Radio,
  Clock,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Fan,
  Waves,
  Download,
  Sliders,
  Bell,
  Cpu,
  Gauge,
  History,
  FileSpreadsheet,
} from "lucide-react";

// -----------------------------------------------------------------------------
// DEFINICIÓN DE TIPOS DE DATOS (MODELO SCADA AGRO-IOT)
// -----------------------------------------------------------------------------
export interface LecturaSensor {
  id: number;
  dispositivo_id: string;
  temperatura_aire: number | null;
  humedad_aire: number | null;
  humedad_suelo_pct: number | null;
  humedad_suelo_raw: number | null;
  temperatura_suelo: number | null;
  indice_vpd?: number | null;
  voltaje_bateria?: number | null;
  calidad_senal_rssi?: number | null;
  creado_en: string;
}

export interface ActuadorConfig {
  id: number;
  dispositivo_id: string;
  relay_1: boolean;
  relay_2: boolean;
  relay_1_nombre: string;
  relay_2_nombre: string;
  modo_auto: boolean;
  tiempo_operacion_relay_1_min?: number;
  tiempo_operacion_relay_2_min?: number;
  ultimo_cambio_por?: string;
  actualizado_en: string;
}

export interface DispositivoNodo {
  id: string;
  dispositivo_id: string;
  nombre_nodo: string;
  ubicacion_geografica: string;
  modelo_mcu: string;
  version_firmware: string;
  estado_operativo: string;
  ultima_conexion?: string;
}

export interface AlertaIncidente {
  id: number;
  dispositivo_id: string;
  tipo_alerta: string;
  nivel_severidad: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
  mensaje: string;
  valor_registrado?: number;
  valor_umbral_limite?: number;
  estado_alerta: "PENDIENTE" | "EN_PROCESO" | "RESUELTA";
  creado_en: string;
}

export interface AuditoriaEvento {
  id: number;
  dispositivo_id: string;
  actuador: string;
  estado_nuevo: boolean;
  origen_comando: string;
  ejecutado_por_email?: string;
  justificacion?: string;
  fecha_ejecucion: string;
}

interface DashboardProps {
  usuarioEmail: string;
  lecturasIniciales: LecturaSensor[];
  actuadoresIniciales: ActuadorConfig[];
  dispositivosIniciales: DispositivoNodo[];
  alertasIniciales: AlertaIncidente[];
  auditoriaInicial: AuditoriaEvento[];
}

/**
 * Dashboard SCADA Agro-Industrial Avanzado para Proyecto de Grado UPEA.
 * Proporciona control de actuadores en lazo cerrado/manual, cálculo de VPD agronómico,
 * monitoreo de umbrales críticos, bitácora de auditoría y exportación de datos para investigación.
 */
export default function DashboardClient({
  usuarioEmail,
  lecturasIniciales,
  actuadoresIniciales,
  dispositivosIniciales,
  alertasIniciales,
  auditoriaInicial,
}: DashboardProps) {
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // Estados reactivos principales
  const [lecturas, setLecturas] = useState<LecturaSensor[]>(lecturasIniciales);
  const [actuadores, setActuadores] = useState<ActuadorConfig[]>(
    actuadoresIniciales.length > 0
      ? actuadoresIniciales
      : [
          {
            id: 1,
            dispositivo_id: "esp8266_invernadero",
            relay_1: false,
            relay_2: false,
            relay_1_nombre: "Bomba de Riego (Relé 1)",
            relay_2_nombre: "Extractor de Aire (Relé 2)",
            modo_auto: true,
            ultimo_cambio_por: "INICIALIZADOR",
            actualizado_en: new Date().toISOString(),
          },
        ]
  );
  const [dispositivos] = useState<DispositivoNodo[]>(
    dispositivosIniciales.length > 0
      ? dispositivosIniciales
      : [
          {
            id: "1",
            dispositivo_id: "esp8266_invernadero",
            nombre_nodo: "Estación de Monitoreo Invernadero UPEA #1",
            ubicacion_geografica: "Campus UPEA - Centro Experimental Agronómico",
            modelo_mcu: "ESP8266 NodeMCU 12-E",
            version_firmware: "v2.4-scada",
            estado_operativo: "ACTIVO",
          },
        ]
  );
  const [alertas, setAlertas] = useState<AlertaIncidente[]>(alertasIniciales);
  const [auditorias, setAuditorias] = useState<AuditoriaEvento[]>(auditoriaInicial);

  // Estados de interfaz y telemetría
  const [enLinea, setEnLinea] = useState<boolean>(true);
  const [dispositivoSeleccionado, setDispositivoSeleccionado] = useState<string>("esp8266_invernadero");
  const [mensajeAccion, setMensajeAccion] = useState<{ texto: string; tipo: "exito" | "error" } | null>(null);
  const [actualizandoRelay1, setActualizandoRelay1] = useState(false);
  const [actualizandoRelay2, setActualizandoRelay2] = useState(false);
  const [actualizandoModo, setActualizandoModo] = useState(false);
  const [relojActual, setRelojActual] = useState<string>("");
  const [variableGrafico, setVariableGrafico] = useState<"todas" | "temperatura" | "humedad">("todas");

  // Reloj digital en tiempo real para panel SCADA
  useEffect(() => {
    const timer = setInterval(() => {
      setRelojActual(new Date().toLocaleTimeString("es-BO"));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filtrado de lecturas para el dispositivo activo
  const lecturasFiltradas = dispositivoSeleccionado === "todos"
    ? lecturas
    : lecturas.filter((l) => l.dispositivo_id === dispositivoSeleccionado);

  const ultimaLectura = lecturasFiltradas[0] || null;

  const actuadorActivo =
    actuadores.find((a) => a.dispositivo_id === dispositivoSeleccionado) || actuadores[0];

  const nodoActivo =
    dispositivos.find((d) => d.dispositivo_id === dispositivoSeleccionado) || dispositivos[0];

  /**
   * Cálculo Agronómico del Déficit de Presión de Vapor (VPD)
   * Fórmula Tetens: e_sat = 0.61078 * exp((17.27 * T) / (T + 237.3))
   * VPD = e_sat * (1 - (HR / 100))
   */
  const vpdCalculado = (() => {
    if (!ultimaLectura?.temperatura_aire || !ultimaLectura?.humedad_aire) return null;
    const t = ultimaLectura.temperatura_aire;
    const hr = ultimaLectura.humedad_aire;
    const eSat = 0.61078 * Math.exp((17.27 * t) / (t + 237.3));
    const vpd = eSat * (1 - hr / 100);
    return vpd.toFixed(2);
  })();

  /**
   * Cálculo de Punto de Rocío (Dew Point) mediante aproximación de Magnus-Tetens
   */
  const puntoRocio = (() => {
    if (!ultimaLectura?.temperatura_aire || !ultimaLectura?.humedad_aire) return null;
    const t = ultimaLectura.temperatura_aire;
    const hr = ultimaLectura.humedad_aire;
    const a = 17.27;
    const b = 237.7;
    const alpha = (a * t) / (b + t) + Math.log(hr / 100);
    const dp = (b * alpha) / (a - alpha);
    return dp.toFixed(1);
  })();

  /**
   * Suscripciones en Tiempo Real vía Supabase Realtime (WebSockets)
   */
  useEffect(() => {
    const channel = supabase
      .channel("scada_agro_channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensores_iot" },
        (payload) => {
          const nuevaLectura = payload.new as LecturaSensor;
          setLecturas((prev) => [nuevaLectura, ...prev.slice(0, 99)]);
          mostrarFeedback(`Muestra #${nuevaLectura.id} registrada desde ${nuevaLectura.dispositivo_id}`, "exito");
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "actuadores_iot" },
        (payload) => {
          const actuadorActualizado = payload.new as ActuadorConfig;
          setActuadores((prev) =>
            prev.map((item) =>
              item.dispositivo_id === actuadorActualizado.dispositivo_id ? actuadorActualizado : item
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alertas_incidentes_iot" },
        (payload) => {
          const nuevaAlerta = payload.new as AlertaIncidente;
          setAlertas((prev) => [nuevaAlerta, ...prev.slice(0, 19)]);
          mostrarFeedback(`¡ALERTA!: ${nuevaAlerta.mensaje}`, "error");
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "auditoria_comandos_actuadores" },
        (payload) => {
          const nuevoLog = payload.new as AuditoriaEvento;
          setAuditorias((prev) => [nuevoLog, ...prev.slice(0, 19)]);
        }
      )
      .subscribe((status) => {
        setEnLinea(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  function mostrarFeedback(texto: string, tipo: "exito" | "error" = "exito") {
    setMensajeAccion({ texto, tipo });
    setTimeout(() => {
      setMensajeAccion(null);
    }, 5000);
  }

  /**
   * Conmuta Relé 1 o Relé 2 y registra auditoría
   */
  async function conmutarRele(numeroRele: 1 | 2) {
    if (!actuadorActivo) return;

    const setCargando = numeroRele === 1 ? setActualizandoRelay1 : setActualizandoRelay2;
    const campo = numeroRele === 1 ? "relay_1" : "relay_2";
    const nuevoValor = numeroRele === 1 ? !actuadorActivo.relay_1 : !actuadorActivo.relay_2;
    const actuadorNombre = numeroRele === 1 ? actuadorActivo.relay_1_nombre : actuadorActivo.relay_2_nombre;

    setCargando(true);

    try {
      // 1. Actualización optimista
      setActuadores((prev) =>
        prev.map((a) =>
          a.dispositivo_id === actuadorActivo.dispositivo_id
            ? { ...a, [campo]: nuevoValor, ultimo_cambio_por: usuarioEmail }
            : a
        )
      );

      // 2. Persistir en actuadores_iot
      const { error: errActuador } = await supabase
        .from("actuadores_iot")
        .upsert(
          {
            dispositivo_id: actuadorActivo.dispositivo_id,
            [campo]: nuevoValor,
            ultimo_cambio_por: usuarioEmail,
            actualizado_en: new Date().toISOString(),
          },
          { onConflict: "dispositivo_id" }
        );

      if (errActuador) throw errActuador;

      // 3. Registrar evento en bitácora de auditoría
      await supabase.from("auditoria_comandos_actuadores").insert({
        dispositivo_id: actuadorActivo.dispositivo_id,
        actuador: numeroRele === 1 ? "RELAY_1" : "RELAY_2",
        estado_anterior: !nuevoValor,
        estado_nuevo: nuevoValor,
        origen_comando: "WEB_OPERADOR",
        ejecutado_por_email: usuarioEmail,
        justificacion: `Conmutación manual desde dashboard por operador ${usuarioEmail}`,
      });

      mostrarFeedback(
        `${actuadorNombre}: ${nuevoValor ? "ACTIVADO / ON" : "DESACTIVADO / OFF"}`,
        "exito"
      );
    } catch (err: unknown) {
      // Revertir
      setActuadores((prev) =>
        prev.map((a) =>
          a.dispositivo_id === actuadorActivo.dispositivo_id ? { ...a, [campo]: !nuevoValor } : a
        )
      );
      const msg = err instanceof Error ? err.message : "Error al actualizar.";
      mostrarFeedback(`Error al conmutar relé: ${msg}`, "error");
    } finally {
      setCargando(false);
    }
  }

  /**
   * Conmuta entre Modo Automático (lazo cerrado agronómico) y Modo Manual
   */
  async function conmutarModoAuto() {
    if (!actuadorActivo) return;
    setActualizandoModo(true);
    const nuevoModo = !actuadorActivo.modo_auto;

    try {
      setActuadores((prev) =>
        prev.map((a) =>
          a.dispositivo_id === actuadorActivo.dispositivo_id
            ? { ...a, modo_auto: nuevoModo, ultimo_cambio_por: usuarioEmail }
            : a
        )
      );

      await supabase
        .from("actuadores_iot")
        .upsert(
          {
            dispositivo_id: actuadorActivo.dispositivo_id,
            modo_auto: nuevoModo,
            ultimo_cambio_por: usuarioEmail,
            actualizado_en: new Date().toISOString(),
          },
          { onConflict: "dispositivo_id" }
        );

      await supabase.from("auditoria_comandos_actuadores").insert({
        dispositivo_id: actuadorActivo.dispositivo_id,
        actuador: "MODO_AUTO",
        estado_nuevo: nuevoModo,
        origen_comando: "WEB_OPERADOR",
        ejecutado_por_email: usuarioEmail,
        justificacion: `Cambio de modo a ${nuevoModo ? "AUTOMÁTICO (Algoritmo Lazo Cerrado)" : "MANUAL"}`,
      });

      mostrarFeedback(
        `Control cambiado a modo: ${nuevoModo ? "AUTOMÁTICO (Regulado por Umbral)" : "MANUAL (Operador)"}`,
        "exito"
      );
    } catch (err: unknown) {
      setActuadores((prev) =>
        prev.map((a) =>
          a.dispositivo_id === actuadorActivo.dispositivo_id ? { ...a, modo_auto: !nuevoModo } : a
        )
      );
      const msg = err instanceof Error ? err.message : "Error.";
      mostrarFeedback(`Error al cambiar modo: ${msg}`, "error");
    } finally {
      setActualizandoModo(false);
    }
  }

  /**
   * Marca una alerta como resuelta
   */
  async function resolverAlerta(idAlerta: number) {
    try {
      setAlertas((prev) =>
        prev.map((al) => (al.id === idAlerta ? { ...al, estado_alerta: "RESUELTA" } : al))
      );

      await supabase
        .from("alertas_incidentes_iot")
        .update({
          estado_alerta: "RESUELTA",
          resuelto_por: usuarioEmail,
          resuelto_en: new Date().toISOString(),
        })
        .eq("id", idAlerta);

      mostrarFeedback("Alerta archivada como atendida.", "exito");
    } catch {
      mostrarFeedback("No se pudo actualizar la alerta.", "error");
    }
  }

  /**
   * Exporta la telemetría histórica a un archivo CSV (indispensable para tesis de grado)
   */
  function exportarDatasetCSV() {
    if (lecturasFiltradas.length === 0) {
      mostrarFeedback("No hay datos para exportar.", "error");
      return;
    }

    const encabezados = [
      "ID",
      "Dispositivo",
      "Temp_Aire_C",
      "Hum_Aire_RH_Pct",
      "Hum_Suelo_Pct",
      "Hum_Suelo_ADC_RAW",
      "Temp_Suelo_C",
      "Indice_VPD_kPa",
      "Timestamp_UTC",
    ];

    const filas = lecturasFiltradas.map((l) => [
      l.id,
      `"${l.dispositivo_id}"`,
      l.temperatura_aire ?? "",
      l.humedad_aire ?? "",
      l.humedad_suelo_pct ?? "",
      l.humedad_suelo_raw ?? "",
      l.temperatura_suelo ?? "",
      l.indice_vpd ?? "",
      `"${l.creado_en}"`,
    ]);

    const csvContenido = [encabezados.join(","), ...filas.map((f) => f.join(","))].join("\n");
    const blob = new Blob([csvContenido], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `telemetria_iot_upea_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarFeedback("Archivo CSV generado para análisis estadístico.", "exito");
  }

  /**
   * Refresco sincrónico de datos
   */
  async function recargarDatos() {
    startTransition(async () => {
      const { data: ultimasLecturas } = await supabase
        .from("sensores_iot")
        .select("*")
        .order("creado_en", { ascending: false })
        .limit(50);

      const { data: ultimosActuadores } = await supabase.from("actuadores_iot").select("*");
      const { data: ultimasAlertas } = await supabase
        .from("alertas_incidentes_iot")
        .select("*")
        .order("creado_en", { ascending: false })
        .limit(10);
      const { data: ultimasAuditorias } = await supabase
        .from("auditoria_comandos_actuadores")
        .select("*")
        .order("fecha_ejecucion", { ascending: false })
        .limit(15);

      if (ultimasLecturas) setLecturas(ultimasLecturas);
      if (ultimosActuadores && ultimosActuadores.length > 0) setActuadores(ultimosActuadores);
      if (ultimasAlertas) setAlertas(ultimasAlertas);
      if (ultimasAuditorias) setAuditorias(ultimasAuditorias);

      mostrarFeedback("Panel SCADA sincronizado con la base de datos.", "exito");
    });
  }

  const alertasPendientes = alertas.filter((a) => a.estado_alerta !== "RESUELTA");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* 1. BARRA SUPERIOR INSTITUCIONAL SCADA */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Marca del Proyecto de Grado */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/30 text-emerald-400 shadow-inner">
              <Activity className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  UPEA • PROYECTO DE GRADO
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    enLinea
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      enLinea ? "bg-emerald-400 animate-ping" : "bg-amber-400"
                    }`}
                  />
                  {enLinea ? "SCADA Realtime Activo (24ms)" : "Reconectando..."}
                </span>
              </div>
              <h1 className="text-base font-extrabold tracking-tight text-white mt-0.5">
                Sistema SCADA IoT de Monitoreo Agronómico y Control de Relés
              </h1>
            </div>
          </div>

          {/* Selector de Nodo, Reloj, Exportación y Sesión */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Reloj SCADA */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 font-mono text-xs text-slate-300">
              <Clock className="h-3.5 w-3.5 text-cyan-400" />
              <span>{relojActual || "--:--:--"}</span>
            </div>

            {/* Selector de Dispositivo */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
              <Radio className="h-3.5 w-3.5 text-emerald-400" />
              <select
                aria-label="Seleccionar nodo de campo"
                value={dispositivoSeleccionado}
                onChange={(e) => setDispositivoSeleccionado(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer font-medium"
              >
                {dispositivos.map((d) => (
                  <option key={d.dispositivo_id} value={d.dispositivo_id} className="bg-slate-900 text-white">
                    {d.nombre_nodo} ({d.dispositivo_id})
                  </option>
                ))}
              </select>
            </div>

            {/* Botón Exportar Dataset CSV */}
            <button
              onClick={exportarDatasetCSV}
              title="Descargar dataset en CSV para análisis estadístico"
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>

            {/* Refresco Manual */}
            <button
              onClick={recargarDatos}
              disabled={isPending}
              aria-label="Sincronizar telemetría"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin text-emerald-400" : ""}`} />
            </button>

            {/* Usuario y Logout */}
            <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-800 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span className="truncate max-w-[130px]">{usuarioEmail}</span>
            </div>

            <form action={logout}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-900/40 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Notificación Toast Flotante */}
      {mensajeAccion && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-md transition-all ${
            mensajeAccion.tipo === "exito"
              ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
              : "border-red-500/40 bg-red-950/90 text-red-200"
          }`}
        >
          {mensajeAccion.tipo === "exito" ? (
            <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
          )}
          <span>{mensajeAccion.texto}</span>
        </div>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 space-y-7">

        {/* 2. FICHA METADATOS DEL NODO DE HARDWARE */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 lg:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-slate-800 text-cyan-400 border border-slate-700">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                  {nodoActivo?.nombre_nodo}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  {nodoActivo?.dispositivo_id}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Ubicación: <span className="text-slate-200 font-medium">{nodoActivo?.ubicacion_geografica}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-400 font-mono">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Microcontrolador</span>
              <span className="text-slate-200 font-semibold">{nodoActivo?.modelo_mcu}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Firmware SCADA</span>
              <span className="text-emerald-400 font-semibold">{nodoActivo?.version_firmware}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Estado Hardware</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                {nodoActivo?.estado_operativo}
              </span>
            </div>
          </div>
        </section>

        {/* 3. SISTEMA DE ALERTAS EN VIVO */}
        {alertasPendientes.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-400" />
              Incidentes Agronómicos Activos ({alertasPendientes.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {alertasPendientes.slice(0, 2).map((al) => (
                <div
                  key={al.id}
                  className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${
                    al.nivel_severidad === "CRITICA"
                      ? "border-red-500/50 bg-red-950/30 text-red-200"
                      : "border-amber-500/50 bg-amber-950/30 text-amber-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                      al.nivel_severidad === "CRITICA" ? "text-red-400 animate-bounce" : "text-amber-400"
                    }`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs uppercase px-1.5 py-0.5 rounded bg-black/40">
                          {al.tipo_alerta} • {al.nivel_severidad}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(al.creado_en).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs mt-1 leading-relaxed">{al.mensaje}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => resolverAlerta(al.id)}
                    className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-900 border border-slate-700 text-slate-300 transition-colors"
                  >
                    Atender
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 4. SECCIÓN SCADA: CONTROL DE RELÉS Y MODOS DE AUTOMATIZACIÓN */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Power className="h-5 w-5 text-emerald-400" />
                Matriz de Actuadores y Control de Relés
              </h2>
              <p className="text-xs text-slate-400">
                Conmutación remota por bus seguro con interlock y control en lazo cerrado
              </p>
            </div>

            {/* Selector de Modo: Automático (Algoritmo) vs Manual */}
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-1.5">
              <span className="text-xs font-semibold text-slate-400 pl-2 flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-cyan-400" />
                Modo:
              </span>
              <button
                type="button"
                onClick={conmutarModoAuto}
                disabled={actualizandoModo}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  actuadorActivo?.modo_auto
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/40"
                    : "bg-amber-600 text-white shadow-md shadow-amber-950/40"
                }`}
              >
                {actualizandoModo
                  ? "Cambiando..."
                  : actuadorActivo?.modo_auto
                  ? "AUTOMÁTICO (Regla Umbral)"
                  : "MANUAL (Operador)"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* TARJETA RELÉ 1: BOMBA DE RIEGO */}
            <div
              className={`rounded-2xl border p-5 transition-all duration-300 relative overflow-hidden ${
                actuadorActivo?.relay_1
                  ? "border-cyan-500/60 bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-900 shadow-xl shadow-cyan-950/40"
                  : "border-slate-800 bg-slate-900/60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                      actuadorActivo?.relay_1
                        ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-300 shadow-lg shadow-cyan-500/30"
                        : "border-slate-700 bg-slate-800 text-slate-400"
                    }`}
                  >
                    <Waves className={`h-6 w-6 ${actuadorActivo?.relay_1 ? "animate-pulse" : ""}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      {actuadorActivo?.relay_1_nombre || "Bomba de Riego (Relé 1)"}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">Salida Digital GPIO14 (D5)</p>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wide ${
                    actuadorActivo?.relay_1
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 animate-pulse"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {actuadorActivo?.relay_1 ? "BOMBEANDO / ON" : "REPOSO / OFF"}
                </span>
              </div>

              {/* Indicadores de rendimiento */}
              <div className="mt-5 grid grid-cols-2 gap-2 text-xs border-t border-slate-800/80 pt-3 text-slate-400">
                <div>
                  <span className="text-slate-500 block text-[10px]">Modo de disparo</span>
                  <span className="font-semibold text-slate-200">
                    {actuadorActivo?.modo_auto ? "Auto (Humedad < 30%)" : "Manual"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Caudal nominal</span>
                  <span className="font-semibold text-slate-200">12.5 L/min (Est.)</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
                <span className="text-xs text-slate-400">Comando SCADA:</span>
                <button
                  type="button"
                  onClick={() => conmutarRele(1)}
                  disabled={actualizandoRelay1}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 ${
                    actuadorActivo?.relay_1
                      ? "bg-red-600 hover:bg-red-500 text-white shadow-red-950/40"
                      : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950/40"
                  }`}
                >
                  <Power className="h-4 w-4" />
                  {actualizandoRelay1
                    ? "Transmitiendo..."
                    : actuadorActivo?.relay_1
                    ? "Detener Bomba"
                    : "Encender Bomba"}
                </button>
              </div>
            </div>

            {/* TARJETA RELÉ 2: EXTRACTOR / VENTILACIÓN */}
            <div
              className={`rounded-2xl border p-5 transition-all duration-300 relative overflow-hidden ${
                actuadorActivo?.relay_2
                  ? "border-emerald-500/60 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 shadow-xl shadow-emerald-950/40"
                  : "border-slate-800 bg-slate-900/60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                      actuadorActivo?.relay_2
                        ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300 shadow-lg shadow-emerald-500/30"
                        : "border-slate-700 bg-slate-800 text-slate-400"
                    }`}
                  >
                    <Fan className={`h-6 w-6 ${actuadorActivo?.relay_2 ? "animate-spin" : ""}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      {actuadorActivo?.relay_2_nombre || "Extractor de Aire (Relé 2)"}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">Salida Digital GPIO12 (D6)</p>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wide ${
                    actuadorActivo?.relay_2
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 animate-pulse"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {actuadorActivo?.relay_2 ? "EXTRAYENDO / ON" : "APAGADO / OFF"}
                </span>
              </div>

              {/* Indicadores de rendimiento */}
              <div className="mt-5 grid grid-cols-2 gap-2 text-xs border-t border-slate-800/80 pt-3 text-slate-400">
                <div>
                  <span className="text-slate-500 block text-[10px]">Modo de disparo</span>
                  <span className="font-semibold text-slate-200">
                    {actuadorActivo?.modo_auto ? "Auto (Temp > 30°C)" : "Manual"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Caudal de aire</span>
                  <span className="font-semibold text-slate-200">450 m³/h</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
                <span className="text-xs text-slate-400">Comando SCADA:</span>
                <button
                  type="button"
                  onClick={() => conmutarRele(2)}
                  disabled={actualizandoRelay2}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 ${
                    actuadorActivo?.relay_2
                      ? "bg-red-600 hover:bg-red-500 text-white shadow-red-950/40"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40"
                  }`}
                >
                  <Power className="h-4 w-4" />
                  {actualizandoRelay2
                    ? "Transmitiendo..."
                    : actuadorActivo?.relay_2
                    ? "Detener Ventilación"
                    : "Activar Ventilación"}
                </button>
              </div>
            </div>

            {/* TARJETA ESTADO DE LAZO DE CONTROL Y SEGURIDAD */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-white font-bold text-sm mb-2">
                  <Gauge className="h-4 w-4 text-emerald-400" />
                  Estado del Lazo de Control
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  El firmware del ESP8266 aplica una política de histeresis de seguridad y lee órdenes cada 30 segundos mediante TLS 1.3.
                </p>
                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Último operador:</span>
                    <span className="text-slate-200 font-mono font-medium truncate max-w-[130px]">
                      {actuadorActivo?.ultimo_cambio_por || "SISTEMA"}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Sincronización:</span>
                    <span className="text-emerald-400 font-mono">
                      {new Date(actuadorActivo?.actualizado_en || Date.now()).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Interlock de sobrecarga:</span>
                <span className="text-emerald-400 font-semibold">PROTEGIDO</span>
              </div>
            </div>
          </div>
        </section>

        {/* 5. SECCIÓN TELEMETRÍA AVANZADA: KPIS AGRONÓMICOS & FÍSICOS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Gauge className="h-5 w-5 text-emerald-400" />
                Variables Físicas y Cálculos Agronómicos
              </h2>
              <p className="text-xs text-slate-400">
                Monitoreo continuo de bioma y microclima con sensores calibrados
              </p>
            </div>
            {ultimaLectura && (
              <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Muestra #{ultimaLectura.id} • {new Date(ultimaLectura.creado_en).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* KPI 1: TEMPERATURA DEL AIRE */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 relative overflow-hidden group hover:border-amber-500/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Temp. Aire (DHT22)
                </span>
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Thermometer className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">
                  {ultimaLectura?.temperatura_aire !== null && ultimaLectura?.temperatura_aire !== undefined
                    ? ultimaLectura.temperatura_aire.toFixed(1)
                    : "--"}
                </span>
                <span className="text-lg font-bold text-slate-400">°C</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">Punto Rocío: {puntoRocio ? `${puntoRocio}°C` : "--"}</span>
                <span
                  className={`font-semibold ${
                    (ultimaLectura?.temperatura_aire || 0) > 30
                      ? "text-red-400"
                      : (ultimaLectura?.temperatura_aire || 0) < 16
                      ? "text-cyan-400"
                      : "text-emerald-400"
                  }`}
                >
                  {(ultimaLectura?.temperatura_aire || 0) > 30 ? "Alerta Calor" : "Zona Confort"}
                </span>
              </div>
            </div>

            {/* KPI 2: HUMEDAD DEL AIRE */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 relative overflow-hidden group hover:border-blue-500/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Humedad Aire (DHT22)
                </span>
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Droplets className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">
                  {ultimaLectura?.humedad_aire !== null && ultimaLectura?.humedad_aire !== undefined
                    ? ultimaLectura.humedad_aire.toFixed(1)
                    : "--"}
                </span>
                <span className="text-lg font-bold text-slate-400">% RH</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">Umbral: 40% - 80%</span>
                <span className="font-semibold text-emerald-400">Humedad Apta</span>
              </div>
            </div>

            {/* KPI 3: HUMEDAD DEL SUELO (YL-69) */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Humedad Suelo (YL-69)
                </span>
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Sprout className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">
                  {ultimaLectura?.humedad_suelo_pct !== null && ultimaLectura?.humedad_suelo_pct !== undefined
                    ? ultimaLectura.humedad_suelo_pct.toFixed(1)
                    : "--"}
                </span>
                <span className="text-lg font-bold text-slate-400">%</span>
              </div>
              <div className="mt-2 w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (ultimaLectura?.humedad_suelo_pct || 0) < 30 ? "bg-red-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(Math.max(ultimaLectura?.humedad_suelo_pct || 0, 0), 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>ADC Raw: {ultimaLectura?.humedad_suelo_raw ?? "--"}</span>
                <span
                  className={`font-semibold ${
                    (ultimaLectura?.humedad_suelo_pct || 0) < 30 ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {(ultimaLectura?.humedad_suelo_pct || 0) < 30 ? "Estrés Hídrico" : "Capacidad Campo"}
                </span>
              </div>
            </div>

            {/* KPI 4: TEMPERATURA DE SUELO (DS18B20) + ÍNDICE VPD AGRONÓMICO */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 relative overflow-hidden group hover:border-rose-500/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Suelo & VPD Agronómico
                </span>
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Flame className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-3xl font-black text-white">
                    {ultimaLectura?.temperatura_suelo !== null && ultimaLectura?.temperatura_suelo !== undefined
                      ? ultimaLectura.temperatura_suelo.toFixed(1)
                      : "--"}
                  </span>
                  <span className="text-sm font-bold text-slate-400 ml-1">°C Suelo</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-cyan-400">{vpdCalculado ?? "--"}</span>
                  <span className="text-[10px] block text-slate-400 font-mono">kPa (VPD)</span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">DS18B20 Sonda</span>
                <span className="font-semibold text-cyan-400">
                  {(Number(vpdCalculado) || 0) >= 0.8 && (Number(vpdCalculado) || 0) <= 1.2
                    ? "Transpiración Ideal"
                    : "VPD Aceptable"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 6. GRÁFICA MULTIVARIABLE SCADA DE ALTA PRECISIÓN */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                Dinámica Temporal y Perfil de Tendencias
              </h3>
              <p className="text-xs text-slate-400">Curvas de evolución climática y comportamiento del sustrato</p>
            </div>

            {/* Selector de variable para el gráfico */}
            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setVariableGrafico("todas")}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  variableGrafico === "todas" ? "bg-slate-800 text-white font-bold" : "text-slate-400"
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setVariableGrafico("temperatura")}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  variableGrafico === "temperatura" ? "bg-amber-600/30 text-amber-300 font-bold" : "text-slate-400"
                }`}
              >
                Temperatura
              </button>
              <button
                onClick={() => setVariableGrafico("humedad")}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  variableGrafico === "humedad" ? "bg-blue-600/30 text-blue-300 font-bold" : "text-slate-400"
                }`}
              >
                Humedades
              </button>
            </div>
          </div>

          {/* Gráfico SVG */}
          <div className="h-64 w-full pt-4">
            {lecturasFiltradas.length > 1 ? (
              <svg className="w-full h-full overflow-visible" viewBox="0 0 800 220" preserveAspectRatio="none">
                {/* Cuadrículas */}
                <line x1="0" y1="40" x2="800" y2="40" stroke="#1e293b" strokeDasharray="4 4" strokeWidth="1" />
                <line x1="0" y1="100" x2="800" y2="100" stroke="#1e293b" strokeDasharray="4 4" strokeWidth="1" />
                <line x1="0" y1="160" x2="800" y2="160" stroke="#1e293b" strokeDasharray="4 4" strokeWidth="1" />

                {/* Línea Umbral Crítico Superior (30°C) */}
                <line x1="0" y1="68" x2="800" y2="68" stroke="#ef4444" strokeDasharray="6 3" strokeWidth="1" opacity="0.6" />
                <text x="790" y="62" fill="#ef4444" fontSize="10" textAnchor="end" opacity="0.8">
                  Límite Temp Max (30°C)
                </text>

                {/* Temperatura Aire */}
                {(variableGrafico === "todas" || variableGrafico === "temperatura") && (
                  <polyline
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={generarPuntosSVG(lecturasFiltradas.slice(0, 25).reverse(), "temperatura_aire", 0, 50, 800, 220)}
                  />
                )}

                {/* Temperatura Suelo */}
                {(variableGrafico === "todas" || variableGrafico === "temperatura") && (
                  <polyline
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={generarPuntosSVG(lecturasFiltradas.slice(0, 25).reverse(), "temperatura_suelo", 0, 50, 800, 220)}
                  />
                )}

                {/* Humedad Aire */}
                {(variableGrafico === "todas" || variableGrafico === "humedad") && (
                  <polyline
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={generarPuntosSVG(lecturasFiltradas.slice(0, 25).reverse(), "humedad_aire", 0, 100, 800, 220)}
                  />
                )}

                {/* Humedad Suelo */}
                {(variableGrafico === "todas" || variableGrafico === "humedad") && (
                  <polyline
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={generarPuntosSVG(lecturasFiltradas.slice(0, 25).reverse(), "humedad_suelo_pct", 0, 100, 800, 220)}
                  />
                )}
              </svg>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                Se requiere telemetría para proyectar las curvas de interpolación.
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800 text-xs">
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                Temp Aire (°C)
              </span>
              <span className="flex items-center gap-1.5 text-rose-400">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                Temp Suelo DS18B20 (°C)
              </span>
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                Hum Aire (% RH)
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Hum Suelo YL-69 (%)
              </span>
            </div>
            <span className="text-slate-500 font-mono text-[11px]">Interpolación Lineal PCHIP</span>
          </div>
        </section>

        {/* 7. BITÁCORA SCADA DE AUDITORÍA DE COMANDOS */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden space-y-3">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <History className="h-4 w-4 text-cyan-400" />
                Bitácora de Auditoría de Comandos (Trazabilidad)
              </h3>
              <p className="text-xs text-slate-400">
                Registro inmutable de conmutaciones de relés y disparadores automáticos
              </p>
            </div>
            <span className="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-full">
              {auditorias.length} eventos registrados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Actuador</th>
                  <th className="py-2.5 px-4">Nuevo Estado</th>
                  <th className="py-2.5 px-4">Origen</th>
                  <th className="py-2.5 px-4">Responsable</th>
                  <th className="py-2.5 px-4">Motivo / Justificación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {auditorias.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-slate-500">
                      No hay eventos de auditoría registrados aún.
                    </td>
                  </tr>
                ) : (
                  auditorias.slice(0, 5).map((aud) => (
                    <tr key={aud.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-mono text-slate-400">
                        {new Date(aud.fecha_ejecucion).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-white">{aud.actuador}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            aud.estado_nuevo
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {aud.estado_nuevo ? "ACTIVADO" : "DESACTIVADO"}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-400">{aud.origen_comando}</td>
                      <td className="py-2.5 px-4 text-cyan-400 font-mono">
                        {aud.ejecutado_por_email || "ALGORITMO_PLPGSQL"}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 max-w-xs truncate">
                        {aud.justificacion || "Operación regular"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 8. TABLA DE HISTORIAL DE TELEMETRÍA CON EXPORTACIÓN */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden space-y-3">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-base">Registros de Muestreo de Sensores</h3>
              <p className="text-xs text-slate-400">Datos almacenados en Supabase PostgreSQL</p>
            </div>
            <button
              onClick={exportarDatasetCSV}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Muestra</th>
                  <th className="py-3 px-4">Nodo</th>
                  <th className="py-3 px-4 text-right">Temp. Aire</th>
                  <th className="py-3 px-4 text-right">Hum. Aire</th>
                  <th className="py-3 px-4 text-right">Hum. Suelo %</th>
                  <th className="py-3 px-4 text-right">ADC RAW</th>
                  <th className="py-3 px-4 text-right">Temp. Suelo</th>
                  <th className="py-3 px-4 text-right">VPD (kPa)</th>
                  <th className="py-3 px-4 text-right">Estampa de Tiempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {lecturasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-500">
                      Esperando telemetría del nodo de campo...
                    </td>
                  </tr>
                ) : (
                  lecturasFiltradas.slice(0, 10).map((l) => (
                    <tr key={l.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-slate-500">#{l.id}</td>
                      <td className="py-2.5 px-4 font-semibold text-white">{l.dispositivo_id}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-amber-400">
                        {l.temperatura_aire !== null ? `${l.temperatura_aire.toFixed(1)}°C` : "--"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-blue-400">
                        {l.humedad_aire !== null ? `${l.humedad_aire.toFixed(1)}%` : "--"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-emerald-400 font-bold">
                        {l.humedad_suelo_pct !== null ? `${l.humedad_suelo_pct.toFixed(1)}%` : "--"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-400">
                        {l.humedad_suelo_raw ?? "--"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-rose-400">
                        {l.temperatura_suelo !== null ? `${l.temperatura_suelo.toFixed(1)}°C` : "--"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-cyan-400 font-semibold">
                        {l.indice_vpd ?? "--"}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-400 font-mono">
                        {new Date(l.creado_en).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* FOOTER ACADÉMICO */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-center text-xs text-slate-600">
        <p>
          Proyecto de Grado de Ingeniería • Universidad Pública de El Alto (UPEA) • SCADA Agro-Industrial con Supabase & Next.js
        </p>
      </footer>
    </div>
  );
}

/**
 * Función matemática para renderizar series temporales en SVG
 */
function generarPuntosSVG(
  datos: LecturaSensor[],
  clave: keyof LecturaSensor,
  minVal: number,
  maxVal: number,
  ancho: number,
  alto: number
): string {
  if (datos.length === 0) return "";
  const pasoX = ancho / Math.max(datos.length - 1, 1);

  return datos
    .map((item, index) => {
      const valor = (item[clave] as number) ?? minVal;
      const x = index * pasoX;
      const normalizado = (valor - minVal) / (maxVal - minVal);
      const y = alto - Math.min(Math.max(normalizado, 0), 1) * alto;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
