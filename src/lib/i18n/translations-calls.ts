/**
 * 1-1 sesli/görüntülü arama (docs/history/449-*) — TR/EN metinleri. Teknik hata adları (NotAllowedError…) kullanıcıya ASLA gösterilmez;
 * `lib/webrtc/call-rules.ts` onları aşağıdaki anlaşılır cümlelere çevirir.
 */
export const callsTranslations = {
  // Başlık düğmeleri
  "calls.startVoice": { tr: "Sesli arama", en: "Voice call" },
  "calls.startVideo": { tr: "Görüntülü arama", en: "Video call" },
  "calls.startVoiceAria": { tr: "{{name}} kişisini sesli ara", en: "Start a voice call with {{name}}" },
  "calls.startVideoAria": { tr: "{{name}} kişisini görüntülü ara", en: "Start a video call with {{name}}" },
  "calls.unavailable": { tr: "Bu sohbette arama yapılamıyor", en: "Calls aren't available in this chat" },
  "calls.inCall": { tr: "Zaten bir görüşmedesin", en: "You're already in a call" },

  // Gelen arama
  "calls.incoming.title": { tr: "Gelen arama", en: "Incoming call" },
  "calls.incoming.aria": { tr: "{{name}} seni arıyor", en: "{{name}} is calling you" },
  "calls.incoming.voice": { tr: "Sesli arama", en: "Voice call" },
  "calls.incoming.video": { tr: "Görüntülü arama", en: "Video call" },
  "calls.incoming.accept": { tr: "Kabul et", en: "Accept" },
  "calls.incoming.reject": { tr: "Reddet", en: "Decline" },

  // Görüşme ekranı
  "calls.screen.aria": { tr: "Görüşme ekranı", en: "Call screen" },
  "calls.status.calling": { tr: "Aranıyor…", en: "Calling…" },
  "calls.status.ringing": { tr: "Çalıyor…", en: "Ringing…" },
  "calls.status.connecting": { tr: "Bağlanıyor…", en: "Connecting…" },
  "calls.status.unstable": { tr: "Bağlantı zayıf, yeniden bağlanılıyor…", en: "Weak connection, reconnecting…" },
  "calls.status.ended": { tr: "Görüşme sona erdi", en: "Call ended" },
  "calls.status.rejected": { tr: "Arama reddedildi", en: "Call declined" },
  "calls.status.missed": { tr: "Cevap vermedi", en: "No answer" },
  "calls.status.failed": { tr: "Görüşme bağlantısı kurulamadı. Lütfen tekrar deneyin.", en: "The call couldn't connect. Please try again." },
  "calls.status.failedSignaling": { tr: "Arama sunucusuna ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.", en: "Couldn't reach the call service. Check your connection and try again." },
  "calls.remoteMuted": { tr: "{{name}} mikrofonunu kapattı", en: "{{name}} muted their microphone" },
  "calls.remoteCameraOff": { tr: "{{name}} kamerasını kapattı", en: "{{name}} turned their camera off" },
  "calls.you": { tr: "Sen", en: "You" },
  "calls.localPreview": { tr: "Kendi görüntün", en: "Your camera preview" },
  "calls.cameraOff": { tr: "Kamera kapalı", en: "Camera off" },
  "calls.tapToPlay": { tr: "Sesi başlatmak için dokun", en: "Tap to start the sound" },

  // Denetimler
  "calls.mute": { tr: "Mikrofonu kapat", en: "Mute microphone" },
  "calls.unmute": { tr: "Mikrofonu aç", en: "Unmute microphone" },
  "calls.cameraOffAction": { tr: "Kamerayı kapat", en: "Turn camera off" },
  "calls.cameraOnAction": { tr: "Kamerayı aç", en: "Turn camera on" },
  "calls.end": { tr: "Görüşmeyi bitir", en: "End call" },
  "calls.cancel": { tr: "Aramayı iptal et", en: "Cancel call" },
  "calls.close": { tr: "Kapat", en: "Close" },
  "calls.retry": { tr: "Tekrar ara", en: "Call again" },

  // İzin / cihaz hataları (getUserMedia)
  "calls.error.permissionAudio": { tr: "Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verip tekrar deneyin.", en: "Microphone access wasn't allowed. Allow it in your browser settings and try again." },
  "calls.error.permissionVideo": { tr: "Mikrofon veya kamera izni verilmedi. Tarayıcı ayarlarından izin verip tekrar deneyin.", en: "Microphone or camera access wasn't allowed. Allow it in your browser settings and try again." },
  "calls.error.notFound": { tr: "Mikrofon veya kamera bulunamadı. Bir cihazın bağlı olduğundan emin olup tekrar dene.", en: "No microphone or camera was found. Make sure a device is connected and try again." },
  "calls.error.inUse": { tr: "Mikrofon veya kamera başka bir uygulama tarafından kullanılıyor. Onu kapatıp tekrar dene.", en: "Your microphone or camera is being used by another app. Close it and try again." },
  "calls.error.unsupportedAudio": { tr: "Bu tarayıcı sesli görüşmeyi desteklemiyor.", en: "This browser doesn't support voice calls." },
  "calls.error.unsupportedVideo": { tr: "Bu tarayıcı görüntülü görüşmeyi desteklemiyor.", en: "This browser doesn't support video calls." },
  "calls.error.media": { tr: "Mikrofon veya kamera açılamadı. Lütfen tekrar deneyin.", en: "Couldn't open your microphone or camera. Please try again." },

  // Arama başlatma hataları (sunucu kodları)
  "calls.error.busy": { tr: "Bu kişi şu anda başka bir görüşmede.", en: "This person is on another call right now." },
  "calls.error.blocked": { tr: "Bu kişiyle görüşme yapılamıyor.", en: "You can't call this person." },
  "calls.error.notAllowed": { tr: "Bu sohbette arama yapılamıyor. Önce mesaj isteğinin kabul edilmesi gerekir.", en: "Calls aren't available in this chat yet. The message request needs to be accepted first." },
  "calls.error.notDirect": { tr: "Arama yalnızca birebir sohbetlerde yapılabilir.", en: "Calls are only available in one-to-one chats." },
  "calls.error.rateLimit": { tr: "Çok sık arama denedin. Biraz bekleyip tekrar dene.", en: "You've tried to call too often. Wait a moment and try again." },
  "calls.error.start": { tr: "Arama başlatılamadı. Lütfen tekrar deneyin.", en: "The call couldn't be started. Please try again." },
  "calls.error.gone": { tr: "Bu arama artık mevcut değil.", en: "This call is no longer available." },

  // Cevapsız arama bildirimi (SQL: 20261212100000_calls.sql — cümle aktör adından sonra gelir)
  "notifMsg.missedVoiceCall": { tr: "seni sesli aradı, cevapsız kaldı.", en: "tried to voice call you and you missed it." },
  "notifMsg.missedVideoCall": { tr: "seni görüntülü aradı, cevapsız kaldı.", en: "tried to video call you and you missed it." },
} as const;
