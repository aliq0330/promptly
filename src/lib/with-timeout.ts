/** `withTimeout` süresi dolunca fırlatılır (ağ isteği hiç cevap vermedi). */
export class TimeoutError extends Error {
  constructor(message = "timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Asılı kalabilecek bir yüklemeyi (mobilde kopan/yavaşlayan bağlantı: `fetch`in kendi zaman aşımı yoktur) süreyle sınırlar: süre dolunca
 * `TimeoutError` ile reddeder, ekran sonsuza dek "yükleniyor" kalmaz. Geç dönen asıl sonuç sessizce yok sayılır; zamanlayıcı her durumda temizlenir.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
