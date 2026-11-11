import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Endpoint de intercambio de código de autenticación (PKCE).
 * Cuando el usuario hace clic en el enlace de confirmación enviado a su correo electrónico,
 * Supabase lo redirige a este endpoint con un parámetro `code`.
 * Aquí intercambiamos el código por una sesión persistente en cookies y lo enviamos al dashboard.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  // Determinar el origen real en producción (soporta proxies como Vercel)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Si falló la verificación del código, redirigir al login con mensaje explicativo
  return NextResponse.redirect(
    `${origin}/login?error=No+se+pudo+validar+el+enlace+de+confirmacion.+Intente+iniciar+sesion+nuevamente.`
  );
}

