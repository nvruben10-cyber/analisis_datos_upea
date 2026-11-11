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
} from "lucide-react";

// Tipos para el modelo de datos
export interface LecturaSensor {
  id: number;
  dispositivo_id: string;
  temperatura_aire: number | null;
  humedad_aire: number | null;
  humedad_suelo_pct: number | null;
  humedad_suelo_raw: number | null;
  temperatura_suelo: number | null;
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
  actualizado_en: string;
}

interface DashboardProps {
  usuarioEmail: string;
  lecturasIniciales: LecturaSensor[];
  actuadoresIniciales: ActuadorConfig[];
}

/**
 * Componente principal del Dashboard interactivo.
 * Gestiona la telemetría en tiempo real, el control bidireccional de los relés 1 y 2,
 * visualización de gráficos y registro histórico.
 */
export default function DashboardClient({
  usuarioEmail,
  lecturasIniciales,
  actuadoresIniciales,
}: DashboardProps) {
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // Estados de datos
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
            relay_1_nombre: "Relé 1 (Bomba de Riego)",
            relay_2_nombre: "Relé 2 (Extractor de Aire)",
            modo_auto: false,
            actualizado_en: new Date().toISOString(),
          },
        ]
  );

  // Estados de interfaz y conectividad
  const [enLinea, setEnLinea] = useState<boolean>(true);
  const [dispositivoSeleccionado, setDispositivoSeleccionado] = useState<string>("todos");
  const [mensajeAccion, setMensajeAccion] = useState<{ texto: string; tipo: "exito" | "error" } | null>(null);
  const [actualizandoRelay1, setActualizandoRelay1] = useState(false);
  const [actualizandoRelay2, setActualizandoRelay2] = useState(false);

  // Lectura más reciente para mostrar en los indicadores principales (KPIs)
  const lecturasFiltradas = dispositivoSeleccionado === "todos"
    ? lecturas
    : lecturas.filter((l) => l.dispositivo_id === dispositivoSeleccionado);

  const ultimaLectura = lecturasFiltradas[0] || null;

  // Lista de dispositivos únicos detectados
  const dispositivos = Array.from(
    new Set(["esp8266_invernadero", ...lecturas.map((l) => l.dispositivo_id)])
  );

  // Actuador activo para el dispositivo seleccionado o el primero disponible
  const actuadorActivo =
    actuadores.find(
      (a) => a.dispositivo_id === (dispositivoSeleccionado === "todos" ? "esp8266_invernadero" : dispositivoSeleccionado)
    ) || actuadores[0];

  /**
   * Suscripción en Tiempo Real mediante Supabase Realtime (WebSockets)
   */
  useEffect(() => {
    // Canal de escucha para inserciones de sensores y actualizaciones de relés
    const channel = supabase
      .channel("iot_telemetria_channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensores_iot" },
        (payload) => {
          const nuevaLectura = payload.new as LecturaSensor;
          setLecturas((prev) => [nuevaLectura, ...prev.slice(0, 99)]);
          mostrarFeedback("Nueva telemetría recibida desde " + nuevaLectura.dispositivo_id, "exito");
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
      .subscribe((status) => {
        setEnLinea(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  /**
   * Muestra un mensaje temporal de retroalimentación en la pantalla
   */
  function mostrarFeedback(texto: string, tipo: "exito" | "error" = "exito") {
    setMensajeAccion({ texto, tipo });
    setTimeout(() => {
      setMensajeAccion(null);
    }, 4000);
  }

  /**
   * Conmuta el estado de Relé 1 o Relé 2 y lo persiste en Supabase.
   *
   * @param numeroRele 1 para Relé 1 (Bomba), 2 para Relé 2 (Ventilador)
   */
  async function conmutarRele(numeroRele: 1 | 2) {
    if (!actuadorActivo) return;

    const setCargando = numeroRele === 1 ? setActualizandoRelay1 : setActualizandoRelay2;
    const campo = numeroRele === 1 ? "relay_1" : "relay_2";
    const nuevoValor = numeroRele === 1 ? !actuadorActivo.relay_1 : !actuadorActivo.relay_2;

    setCargando(true);

    try {
      // 1. Actualización optimista de la interfaz
      setActuadores((prev) =>
        prev.map((a) =>
          a.dispositivo_id === actuadorActivo.dispositivo_id ? { ...a, [campo]: nuevoValor } : a
        )
      );

      // 2. Persistencia en la tabla 'actuadores_iot' de Supabase
      const { error } = await supabase
        .from("actuadores_iot")
        .upsert(
          {
            dispositivo_id: actuadorActivo.dispositivo_id,
            [campo]: nuevoValor,
            actualizado_en: new Date().toISOString(),
          },
          { onConflict: "dispositivo_id" }
        );

      if (error) {
        throw error;
      }

      mostrarFeedback(
        `${numeroRele === 1 ? actuadorActivo.relay_1_nombre : actuadorActivo.relay_2_nombre}: ${
          nuevoValor ? "ENCENDIDO" : "APAGADO"
        }`,
        "exito"
      );
    } catch (err: unknown) {
      // Revertir optimismo en caso de error
      setActuadores((prev) =>
        prev.map((a) =>
          a.dispositivo_id === actuadorActivo.dispositivo_id ? { ...a, [campo]: !nuevoValor } : a
        )
      );
      const msg = err instanceof Error ? err.message : "Error al actualizar estado del relé.";
      mostrarFeedback(`Error al conmutar Relé ${numeroRele}: ${msg}`, "error");
    } finally {
      setCargando(false);
    }
  }

  /**
   * Refresca manualmente los datos desde el servidor Supabase
   */
  async function recargarDatos() {
    startTransition(async () => {
      const { data: ultimasLecturas } = await supabase
        .from("sensores_iot")
        .select("*")
        .order("creado_en", { ascending: false })
        .limit(50);

      const { data: ultimosActuadores } = await supabase
        .from("actuadores_iot")
        .select("*");

      if (ultimasLecturas) setLecturas(ultimasLecturas);
      if (ultimosActuadores && ultimosActuadores.length > 0) setActuadores(ultimosActuadores);

      mostrarFeedback("Datos sincronizados con éxito.", "exito");
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 1. BARRA SUPERIOR DE NAVEGACIÓN */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Título y Estado en Vivo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Activity className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  Dashboard Agro-IoT
                </h1>
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
                  {enLinea ? "Realtime Conectado" : "Conectando..."}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Monitoreo de Sensores y Control de Relés vía Supabase
              </p>
            </div>
          </div>

          {/* Controles de Filtro, Usuario y Acciones */}
          <div className="flex items-center gap-3">
            {/* Selector de Dispositivo */}
            <div className="flex items-center gap-2 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
              <Radio className="h-3.5 w-3.5 text-slate-400" />
              <label htmlFor="select-nodo" className="sr-only">Seleccionar Nodo</label>
              <select
                id="select-nodo"
                value={dispositivoSeleccionado}
                onChange={(e) => setDispositivoSeleccionado(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="todos" className="bg-slate-900">Todos los nodos</option>
                {dispositivos.map((d) => (
                  <option key={d} value={d} className="bg-slate-900">
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Botón de Refresco Manual */}
            <button
              onClick={recargarDatos}
              disabled={isPending}
              title="Recargar datos"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin text-emerald-400" : ""}`} />
            </button>

            {/* Identificador de Usuario y Botón de Salir */}
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-800 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span className="truncate max-w-[150px]">{usuarioEmail}</span>
            </div>

            <form action={logout}>
              <button
                type="submit"
                title="Cerrar Sesión"
                className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/40 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Banner flotante de Notificación */}
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
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 space-y-8">

        {/* 2. SECCIÓN DESTACADA: CONTROL DE RELÉS 1 Y 2 DESDE EL FRONTEND */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Power className="h-5 w-5 text-emerald-400" />
                Centro de Control de Actuadores (Relays)
              </h2>
              <p className="text-xs text-slate-400">
                Conmuta en tiempo real los relés conectados al microcontrolador ESP8266
              </p>
            </div>
            {actuadorActivo && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Última orden: {new Date(actuadorActivo.actualizado_en).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* TARJETA RELÉ 1 (Bomba de Riego) */}
            <div
              className={`relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
                actuadorActivo?.relay_1
                  ? "border-cyan-500/50 bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-900 shadow-lg shadow-cyan-950/30"
                  : "border-slate-800 bg-slate-900/60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                      actuadorActivo?.relay_1
                        ? "border-cyan-400/40 bg-cyan-500/20 text-cyan-300 shadow-md shadow-cyan-500/20"
                        : "border-slate-700 bg-slate-800 text-slate-400"
                    }`}
                  >
                    <Waves className={`h-6 w-6 ${actuadorActivo?.relay_1 ? "animate-pulse" : ""}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">
                      {actuadorActivo?.relay_1_nombre || "Relé 1 (Bomba de Riego)"}
                    </h3>
                    <p className="text-xs text-slate-400">Salida Digital GPIO14 (D5)</p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    actuadorActivo?.relay_1
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {actuadorActivo?.relay_1 ? "ACTIVO / ON" : "INACTIVO / OFF"}
                </span>
              </div>

              <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-800/80">
                <span className="text-xs text-slate-400">Acción de control manual:</span>
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
                    ? "Enviando orden..."
                    : actuadorActivo?.relay_1
                    ? "Apagar Relé 1"
                    : "Encender Relé 1"}
                </button>
              </div>
            </div>

            {/* TARJETA RELÉ 2 (Extractor / Ventilador) */}
            <div
              className={`relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
                actuadorActivo?.relay_2
                  ? "border-emerald-500/50 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 shadow-lg shadow-emerald-950/30"
                  : "border-slate-800 bg-slate-900/60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                      actuadorActivo?.relay_2
                        ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300 shadow-md shadow-emerald-500/20"
                        : "border-slate-700 bg-slate-800 text-slate-400"
                    }`}
                  >
                    <Fan className={`h-6 w-6 ${actuadorActivo?.relay_2 ? "animate-spin" : ""}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">
                      {actuadorActivo?.relay_2_nombre || "Relé 2 (Ventilador/Extractor)"}
                    </h3>
                    <p className="text-xs text-slate-400">Salida Digital GPIO12 (D6)</p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    actuadorActivo?.relay_2
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {actuadorActivo?.relay_2 ? "ACTIVO / ON" : "INACTIVO / OFF"}
                </span>
              </div>

              <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-800/80">
                <span className="text-xs text-slate-400">Acción de control manual:</span>
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
                    ? "Enviando orden..."
                    : actuadorActivo?.relay_2
                    ? "Apagar Relé 2"
                    : "Encender Relé 2"}
                </button>
              </div>
            </div>

            {/* TARJETA INFORMATIVA / ESTADO DEL ENLACE IOT */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-slate-300 font-semibold mb-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-400" />
                  Protocolo de Comunicación
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Las órdenes de conmutación se transmiten mediante la API REST de Supabase con TLS 1.3. El ESP8266 consulta el endpoint periódicamente y reacciona de inmediato.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 text-xs flex items-center justify-between text-slate-400">
                <span>Nodo Destino:</span>
                <code className="text-emerald-400 bg-slate-950 px-2 py-0.5 rounded font-mono">
                  {actuadorActivo?.dispositivo_id || "esp8266_invernadero"}
                </code>
              </div>
            </div>
          </div>
        </section>

        {/* 3. SECCIÓN: MÉTRICAS Y TELEMETRÍA EN TIEMPO REAL (KPIS) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-400" />
                Telemetría en Vivo de Sensores
              </h2>
              <p className="text-xs text-slate-400">
                Última medición registrada por los sensores DHT22, YL-69 y DS18B20
              </p>
            </div>
            {ultimaLectura && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {new Date(ultimaLectura.creado_en).toLocaleString()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* KPI 1: TEMPERATURA DEL AIRE (DHT22) */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 relative overflow-hidden group hover:border-amber-500/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Temp. Aire (DHT22)
                </span>
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Thermometer className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">
                  {ultimaLectura?.temperatura_aire !== null && ultimaLectura?.temperatura_aire !== undefined
                    ? ultimaLectura.temperatura_aire.toFixed(1)
                    : "--"}
                </span>
                <span className="text-lg font-bold text-slate-400">°C</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">Rango ideal: 18 - 28°C</span>
                <span
                  className={`font-semibold ${
                    (ultimaLectura?.temperatura_aire || 0) > 30
                      ? "text-red-400"
                      : (ultimaLectura?.temperatura_aire || 0) < 15
                      ? "text-cyan-400"
                      : "text-emerald-400"
                  }`}
                >
                  {(ultimaLectura?.temperatura_aire || 0) > 30
                    ? "Calor alto"
                    : (ultimaLectura?.temperatura_aire || 0) < 15
                    ? "Baja temp"
                    : "Óptimo"}
                </span>
              </div>
            </div>

            {/* KPI 2: HUMEDAD DEL AIRE (DHT22) */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 relative overflow-hidden group hover:border-blue-500/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Humedad Aire (DHT22)
                </span>
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Droplets className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">
                  {ultimaLectura?.humedad_aire !== null && ultimaLectura?.humedad_aire !== undefined
                    ? ultimaLectura.humedad_aire.toFixed(1)
                    : "--"}
                </span>
                <span className="text-lg font-bold text-slate-400">% RH</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">Rango ideal: 50 - 75%</span>
                <span
                  className={`font-semibold ${
                    (ultimaLectura?.humedad_aire || 0) < 40
                      ? "text-amber-400"
                      : (ultimaLectura?.humedad_aire || 0) > 85
                      ? "text-cyan-400"
                      : "text-emerald-400"
                  }`}
                >
                  {(ultimaLectura?.humedad_aire || 0) < 40
                    ? "Aire seco"
                    : (ultimaLectura?.humedad_aire || 0) > 85
                    ? "Alta condensación"
                    : "Confortable"}
                </span>
              </div>
            </div>

            {/* KPI 3: HUMEDAD DEL SUELO (YL-69) */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Humedad Suelo (YL-69)
                </span>
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Sprout className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">
                  {ultimaLectura?.humedad_suelo_pct !== null && ultimaLectura?.humedad_suelo_pct !== undefined
                    ? ultimaLectura.humedad_suelo_pct.toFixed(1)
                    : "--"}
                </span>
                <span className="text-lg font-bold text-slate-400">%</span>
              </div>
              {/* Barra de progreso de Humedad de Suelo */}
              <div className="mt-2 w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(Math.max(ultimaLectura?.humedad_suelo_pct || 0, 0), 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>ADC Raw: {ultimaLectura?.humedad_suelo_raw ?? "--"}</span>
                <span className="font-medium text-emerald-400">
                  {(ultimaLectura?.humedad_suelo_pct || 0) < 30 ? "Requiere Riego" : "Humedad Apta"}
                </span>
              </div>
            </div>

            {/* KPI 4: TEMPERATURA DEL SUELO (DS18B20) */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 relative overflow-hidden group hover:border-rose-500/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Temp. Suelo (DS18B20)
                </span>
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Flame className="h-5 w-5" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">
                  {ultimaLectura?.temperatura_suelo !== null && ultimaLectura?.temperatura_suelo !== undefined
                    ? ultimaLectura.temperatura_suelo.toFixed(1)
                    : "--"}
                </span>
                <span className="text-lg font-bold text-slate-400">°C</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">Sonda sumergible</span>
                <span className="font-semibold text-emerald-400">Estable</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. SECCIÓN: GRÁFICO HISTÓRICO DE EVOLUCIÓN */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white">Evolución de Tendencias (Últimos Registros)</h3>
              <p className="text-xs text-slate-400">Visualización de variación térmica e hídrica</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                Temp Aire (°C)
              </span>
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                Hum Aire (%)
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Hum Suelo (%)
              </span>
            </div>
          </div>

          {/* Gráfico SVG interactivo y ligero */}
          <div className="h-56 w-full pt-4">
            {lecturasFiltradas.length > 1 ? (
              <svg className="w-full h-full overflow-visible" viewBox="0 0 800 200" preserveAspectRatio="none">
                {/* Cuadrícula de referencia */}
                <line x1="0" y1="40" x2="800" y2="40" stroke="#334155" strokeDasharray="3 3" strokeWidth="1" />
                <line x1="0" y1="100" x2="800" y2="100" stroke="#334155" strokeDasharray="3 3" strokeWidth="1" />
                <line x1="0" y1="160" x2="800" y2="160" stroke="#334155" strokeDasharray="3 3" strokeWidth="1" />

                {/* Línea Temp Aire */}
                <polyline
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={generarPuntosSVG(lecturasFiltradas.slice(0, 20).reverse(), "temperatura_aire", 0, 50, 800, 200)}
                />

                {/* Línea Humedad Aire */}
                <polyline
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={generarPuntosSVG(lecturasFiltradas.slice(0, 20).reverse(), "humedad_aire", 0, 100, 800, 200)}
                />

                {/* Línea Humedad Suelo */}
                <polyline
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={generarPuntosSVG(lecturasFiltradas.slice(0, 20).reverse(), "humedad_suelo_pct", 0, 100, 800, 200)}
                />
              </svg>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                Se requieren al menos 2 lecturas para proyectar la gráfica de tendencias.
              </div>
            )}
          </div>
        </section>

        {/* 5. SECCIÓN: TABLA DETALLADA DE HISTORIAL DE TELEMETRÍA */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden space-y-3">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-base">Registro Histórico de Mediciones</h3>
              <p className="text-xs text-slate-400">Datos guardados en la tabla pública de Supabase</p>
            </div>
            <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-mono">
              {lecturasFiltradas.length} registros cargados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Dispositivo</th>
                  <th className="py-3 px-4 text-right">Temp. Aire</th>
                  <th className="py-3 px-4 text-right">Hum. Aire</th>
                  <th className="py-3 px-4 text-right">Hum. Suelo %</th>
                  <th className="py-3 px-4 text-right">Suelo RAW</th>
                  <th className="py-3 px-4 text-right">Temp. Suelo</th>
                  <th className="py-3 px-4 text-right">Fecha y Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {lecturasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500">
                      No hay registros en la base de datos para este dispositivo.
                    </td>
                  </tr>
                ) : (
                  lecturasFiltradas.slice(0, 15).map((l) => (
                    <tr key={l.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-500">#{l.id}</td>
                      <td className="py-3 px-4 font-medium text-white">{l.dispositivo_id}</td>
                      <td className="py-3 px-4 text-right font-mono text-amber-400">
                        {l.temperatura_aire !== null ? `${l.temperatura_aire.toFixed(1)}°C` : "--"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-blue-400">
                        {l.humedad_aire !== null ? `${l.humedad_aire.toFixed(1)}%` : "--"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400 font-semibold">
                        {l.humedad_suelo_pct !== null ? `${l.humedad_suelo_pct.toFixed(1)}%` : "--"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400">
                        {l.humedad_suelo_raw ?? "--"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-rose-400">
                        {l.temperatura_suelo !== null ? `${l.temperatura_suelo.toFixed(1)}°C` : "--"}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400">
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
    </div>
  );
}

/**
 * Función auxiliar para generar las coordenadas SVG de una serie temporal.
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

