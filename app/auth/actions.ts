"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

/**
 * Inicia sesión con correo y contraseña.
 *
 * @param formData Datos enviados desde el formulario HTML
 * @returns Objeto con mensaje de error si la autenticación falla
 */
export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Por favor complete todos los campos obligatorios." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message || "Credenciales incorrectas. Verifique correo y clave." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Registra un nuevo usuario en Supabase Auth.
 *
 * @param formData Datos enviados desde el formulario HTML
 * @returns Objeto con mensaje de estado o error
 */
export async function signup(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Por favor complete todos los campos obligatorios." };
  }

  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  const supabase = await createClient();

  const { error, data } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Si Supabase requiere confirmación por correo electrónico
  if (data?.user && !data.session) {
    return {
      success: true,
      message: "Registro exitoso. Se ha enviado un enlace de confirmación a su correo electrónico.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Cierra la sesión activa del usuario y limpia cookies.
 */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

