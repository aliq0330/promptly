/**
 * Spaces renk paletleri (docs/history/213-*): HEX kodu doğrulama/normalleştirme ve bir görselin piksellerinden palet çıkarma
 * (median-cut). Saf; `color-palette.test.ts`. Görselden piksel okumak tarayıcı işidir (`extractPaletteFromBlob`), çıkarma burada.
 */

/** "#abc", "abc", "#AABBCC", "aabbcc" → "#aabbcc"; geçersiz → null. Kaydedilen biçim (DB kısıtı) küçük harf `#rrggbb`. */
export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(value)) return `#${value.split("").map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/.test(value)) return `#${value}`;
  return null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = normalizeHex(hex) ?? "#000000";
  return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** İki renk arasındaki algısal-yaklaşık uzaklık (ağırlıklı RGB; yakın tonları elemek için yeterli). */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const rMean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}

type Pixel = [number, number, number];

/**
 * RGBA piksel dizisinden (canvas `getImageData().data`) en baskın `count` rengi çıkarır: median-cut ile kutulara böler, her kutunun
 * ortalamasını alır, nüfusa göre sıralar ve birbirine çok yakın tonları eler. Saydam pikseller sayılmaz. Deterministiktir.
 */
export function extractPalette(data: ArrayLike<number>, count = 6): string[] {
  const pixels: Pixel[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return [];
  const target = Math.max(1, Math.min(count * 3, 32));
  let boxes: Pixel[][] = [pixels];
  while (boxes.length < target) {
    // En geniş kanal aralığına sahip, bölünebilir kutuyu böl.
    let best = -1;
    let bestRange = 0;
    let bestChannel = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let channel = 0; channel < 3; channel += 1) {
        let min = 255;
        let max = 0;
        for (const p of box) {
          if (p[channel] < min) min = p[channel];
          if (p[channel] > max) max = p[channel];
        }
        if (max - min > bestRange) {
          bestRange = max - min;
          best = index;
          bestChannel = channel;
        }
      }
    });
    if (best < 0 || bestRange === 0) break;
    const box = [...boxes[best]].sort((a, b) => a[bestChannel] - b[bestChannel]);
    // Ortanca noktaya en yakın DEĞER SINIRINDAN böl: aynı ton iki kutuya bölünüp başka bir tonla karışmasın.
    const half = Math.floor(box.length / 2);
    let mid = half;
    for (let offset = 0; offset < box.length; offset += 1) {
      const up = half + offset;
      const down = half - offset;
      if (up > 0 && up < box.length && box[up - 1][bestChannel] !== box[up][bestChannel]) {
        mid = up;
        break;
      }
      if (down > 0 && down < box.length && box[down - 1][bestChannel] !== box[down][bestChannel]) {
        mid = down;
        break;
      }
    }
    boxes = [...boxes.slice(0, best), box.slice(0, mid), box.slice(mid), ...boxes.slice(best + 1)];
  }
  const swatches = boxes
    .filter((box) => box.length > 0)
    .map((box) => {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const p of box) {
        r += p[0];
        g += p[1];
        b += p[2];
      }
      return { hex: rgbToHex(r / box.length, g / box.length, b / box.length), population: box.length };
    })
    .sort((a, b) => b.population - a.population || a.hex.localeCompare(b.hex));
  const result: string[] = [];
  for (const swatch of swatches) {
    if (result.every((hex) => colorDistance(hex, swatch.hex) > 60)) result.push(swatch.hex);
    if (result.length >= count) break;
  }
  return result;
}

/**
 * Tarayıcıda: görsel dosyasından/blob'undan (signed URL'den indirilmiş) palet. Görsel küçültülerek okunur (en çok 96px) — hız ve
 * bellek için yeterli. Başarısızlık → `null` (çağıran kullanıcıya "çıkarılamadı" der; sahte palet üretilmez).
 */
export async function extractPaletteFromBlob(blob: Blob, count = 6): Promise<string[] | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const scale = 96 / Math.max(bitmap.width, bitmap.height, 1);
      const w = Math.max(1, Math.round(bitmap.width * Math.min(1, scale)));
      const h = Math.max(1, Math.round(bitmap.height * Math.min(1, scale)));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const colors = extractPalette(ctx.getImageData(0, 0, w, h).data, count);
      return colors.length > 0 ? colors : null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
