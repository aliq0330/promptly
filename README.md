# Promptly

AI görsel üretim promptlarını paylaşan, keşfeden ve remixleyen yaratıcı
topluluk platformu — "Lavender Studio" tasarım dili.

Proje amacı, tasarım sistemi, mimari kararlar ve geliştirme sırası için
[`CLAUDE.md`](./CLAUDE.md) dosyasına bakın; bu proje o dosyadaki plana göre
modül modül geliştiriliyor.

## Teknolojiler

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- Tailwind CSS v4
- Supabase (Auth, Postgres, Storage, Realtime) — **henüz bağlanmadı**
- lucide-react ikon seti, Inter yazı tipi

## Kurulum

```bash
npm install
npm run dev
```

Uygulama [http://localhost:3000](http://localhost:3000) adresinde açılır.

## Ortam değişkenleri

Supabase entegrasyonu henüz eklenmedi. İleride gerekecek değişkenler
[`.env.example`](./.env.example) dosyasında listelenmiştir; bir Supabase
projesi bağlandığında `.env.local` olarak kopyalanıp doldurulacaktır.

## Komutlar

```bash
npm run dev      # geliştirme sunucusu
npm run build    # production derlemesi
npm run start    # production sunucusu
npm run lint     # ESLint
```

## Proje durumu

Şu anda yalnızca proje iskeleti, tasarım sistemi ve navigasyon shell'i
mevcuttur; sayfaların çoğu placeholder içerik gösterir. Güncel durum ve
tamamlanan/bekleyen modüller için `CLAUDE.md` içindeki "Şu Anki Durum"
bölümüne bakın.
