"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { login, signup } from "@/app/auth/actions";
import { Lock, Mail, Cpu, AlertCircle, CheckCircle2, Loader2, Power } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const [esRegistro, setEsRegistro] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // Capturar errores provenientes de redirecciones (ej: confirmación de email)
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setMensajeError(errorParam);
    }
  }, [searchParams]);

  /**
   * Manejador de envío del formulario de autenticación
   */
  async function manejarEnvio(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCargando(true);
    setMensajeError(null);
    setMensajeExito(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      if (esRegistro) {
        const res = await signup(formData);
        if (res?.error) {
          setMensajeError(res.error);
        } else if (res?.success) {
          setMensajeExito(res.message);
          form.reset();
        }
      } else {
        const res = await login(formData);
        if (res?.error) {
          setMensajeError(res.error);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) {
        setMensajeError(err.message || "Ocurrió un error inesperado al procesar la solicitud.");
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/30">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
        {/* Cabecera con Icono y Marca */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-4 shadow-inner">
            <Cpu className="h-9 w-9" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Plataforma IoT Supabase
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Control de Sensores de Campo y Actuadores de Relé
          </p>
        </div>

        {/* Selector de Pestaña: Iniciar Sesión / Registro */}
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-950/60 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setEsRegistro(false);
              setMensajeError(null);
              setMensajeExito(null);
            }}
            className={`rounded-lg py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
              !esRegistro
                ? "bg-emerald-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setEsRegistro(true);
              setMensajeError(null);
              setMensajeExito(null);
            }}
            className={`rounded-lg py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
              esRegistro
                ? "bg-emerald-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Registrarse
          </button>
        </div>

        {/* Notificaciones de Error o Éxito */}
        {mensajeError && (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-sm text-red-300">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400 mt-0.5" />
            <span>{mensajeError}</span>
          </div>
        )}

        {mensajeExito && (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-3 text-sm text-emerald-300">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-400 mt-0.5" />
            <span>{mensajeExito}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={manejarEnvio} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                name="email"
                type="email"
                required
                placeholder="operador@invernadero.com"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                name="password"
                type="password"
                required
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50 transition-all duration-200"
          >
            {cargando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Procesando...</span>
              </>
            ) : esRegistro ? (
              <span>Crear Cuenta de Operador</span>
            ) : (
              <>
                <Power className="h-4 w-4" />
                <span>Acceder al Dashboard</span>
              </>
            )}
          </button>
        </form>

        {/* Pie informativo */}
        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500">
            Conexión protegida por <span className="text-slate-400 font-medium">Supabase Auth & RLS</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Cargando...</div>}>
      <LoginForm />
    </Suspense>
  );
}
