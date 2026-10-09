import { supabase } from "./client";
import { createPromptResult, fetchResultById } from "./prompt-results";

/** `result-media` bucket'ının dosya boyutu sınırı (migration 20260919410000) — formda dosya seçilirken aynı sınır önceden kontrol edilir. */
export const OUTPUT_MAX_BYTES = 50 * 1024 * 1024;

/** Bucket'ın `allowed_mime_types` listesinin video/ses kısmı — seçici ve doğrulama aynı listeyi kullanır. */
export const OUTPUT_MIME_TYPES = {
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm"],
} as const;

export type OutputKind = keyof typeof OUTPUT_MIME_TYPES;

/**
 * Bir video/ses promptunun "çıktı" dosyasını yayınlanmış bir promptun altına
 * bağlar. Yeni bir medya sistemi YOK: dosya, "Kullanıcı sonuçları"nın
 * (`prompt_results`) yazarın kendi sonucu olarak yüklenir — detay sayfasının
 * `PromptPlayableOutput`'u tam olarak bunu oynatır. Ayrıca sonucun
 * küçük resmi (video karesi / ses için kapak) `prompt_media`'ya promptun
 * kart kapağı olarak yazılır; kapak yazılamazsa çıktı yine de kayıtlıdır.
 *
 * Yayınlanmış bir prompt gerektirir (sonuç RLS'i taslağa izin vermez);
 * hata fırlatırsa prompt zaten yayında kalır, çağıran bunu kullanıcıya
 * ayrıca bildirmelidir.
 */
export async function attachPromptOutput(input: {
  promptId: string;
  creatorId: string;
  file: File;
  title: string;
  kind: OutputKind;
}): Promise<void> {
  const resultId = await createPromptResult(
    {
      source: { type: "prompt", promptId: input.promptId, hasModification: false, modificationSummary: "", modifiedPromptText: "" },
      file: input.file,
      textContent: "",
      tool: "",
    },
    input.creatorId,
  );

  try {
    const result = await fetchResultById(resultId);
    if (!result?.thumbnailUrl) return;
    // Ses kapağı 480×480 üretilir; video karesinin gerçek oranı bilinmez, kart zaten oranı kıstırıp kırpar.
    const width = input.kind === "audio" ? 480 : 1280;
    const height = input.kind === "audio" ? 480 : 720;
    await supabase.from("prompt_media").delete().eq("prompt_id", input.promptId);
    const { error } = await supabase
      .from("prompt_media")
      .insert({ prompt_id: input.promptId, url: result.thumbnailUrl, width, height, alt: input.title, position: 0 });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("attachPromptOutput cover", err);
  }
}
