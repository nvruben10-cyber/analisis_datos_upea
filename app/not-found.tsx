import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-slate-950 text-slate-100 text-center">
      <h2 className="text-2xl font-bold text-emerald-400">404 - No Encontrado</h2>
      <p className="mt-2 text-sm text-slate-400">El recurso solicitado no existe.</p>
      <Link href="/login" className="mt-4 px-4 py-2 bg-emerald-600 rounded-lg text-xs font-semibold text-white">
        Volver
      </Link>
    </div>
  );
}

