import { getRuntimeLanguage } from "@/lib/i18n/translations";

/**
 * Supabase's AuthError messages come back in English — translated here into
 * the handful of cases users actually hit, so error text stays in the
 * user's chosen language (matching `<html lang>`, see `getRuntimeLanguage`)
 * like the rest of the app. Falls back to the raw (English) Supabase
 * message for anything unmapped rather than hiding it.
 */
export function translateAuthError(message: string): string {
  const known: Record<string, { tr: string; en: string }> = {
    "Invalid login credentials": { tr: "E-posta veya şifre hatalı.", en: "Incorrect email or password." },
    "Email not confirmed": { tr: "E-posta adresin henüz doğrulanmadı. Gelen kutunu kontrol et.", en: "Your email address hasn't been confirmed yet. Check your inbox." },
    "User already registered": { tr: "Bu e-posta adresiyle zaten bir hesap var.", en: "An account with this email address already exists." },
    "Password should be at least 6 characters": { tr: "Şifre en az 6 karakter olmalı.", en: "Password must be at least 6 characters long." },
    "Unable to validate email address: invalid format": { tr: "Geçerli bir e-posta adresi gir.", en: "Enter a valid email address." },
    "For security purposes, you can only request this after 60 seconds": { tr: "Güvenlik nedeniyle 60 saniyede bir istek yapabilirsin.", en: "For security reasons, you can only request this once every 60 seconds." },
    "New password should be different from the old password.": { tr: "Yeni şifre eskisinden farklı olmalı.", en: "The new password must be different from the old one." },
    "A user with this email address has already been registered": { tr: "Bu e-posta adresiyle zaten bir hesap var.", en: "An account with this email address already exists." },
    "Email rate limit exceeded": { tr: "Çok fazla e-posta isteği yapıldı, biraz sonra tekrar dene.", en: "Too many email requests — please try again shortly." },
    "User is banned": { tr: "Hesabın geçici olarak askıya alındı.", en: "Your account is temporarily suspended." },
    "Auth session missing!": { tr: "Oturum bulunamadı, lütfen tekrar giriş yap.", en: "No session found — please log in again." },
  };
  return known[message]?.[getRuntimeLanguage()] ?? message;
}
