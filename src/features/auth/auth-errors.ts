/**
 * Supabase's AuthError messages come back in English — translated here into
 * the handful of cases users actually hit, so error text stays in Turkish
 * like the rest of the app. Falls back to the raw message for anything
 * unmapped rather than hiding it.
 */
export function translateAuthError(message: string): string {
  const known: Record<string, string> = {
    "Invalid login credentials": "E-posta veya şifre hatalı.",
    "Email not confirmed": "E-posta adresin henüz doğrulanmadı. Gelen kutunu kontrol et.",
    "User already registered": "Bu e-posta adresiyle zaten bir hesap var.",
    "Password should be at least 6 characters": "Şifre en az 6 karakter olmalı.",
    "Unable to validate email address: invalid format": "Geçerli bir e-posta adresi gir.",
    "For security purposes, you can only request this after 60 seconds": "Güvenlik nedeniyle 60 saniyede bir istek yapabilirsin.",
    "New password should be different from the old password.": "Yeni şifre eskisinden farklı olmalı.",
    "Auth session missing!": "Oturum bulunamadı, lütfen tekrar giriş yap.",
  };
  return known[message] ?? message;
}
