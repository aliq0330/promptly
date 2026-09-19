import type { PromptRequest } from "@/types";
import { getUserById } from "./users";
import { getTag } from "./tags";

const user = (id: string) => getUserById(id)!;

export const mockRequests: PromptRequest[] = [
  {
    id: "r1",
    author: user("u3"),
    title: "Kışın ortasında yemyeşil bir vaha",
    description: "Kar yağan bir çölün tam ortasında, palmiyeleri ve gölü olan bir vaha görseli arıyorum.",
    creativeDirection: "Sürreal ama fotogerçekçi bir denge olsun, gün batımı ışığı tercih ederim.",
    preferredTool: "Midjourney",
    tags: [getTag("manzara"), getTag("surreal")],
    status: "open",
    responseCount: 6,
    createdAt: "2026-09-14T12:00:00.000Z",
  },
  {
    id: "r2",
    author: user("u5"),
    title: "90'lar tarzı mecha pilot karakteri",
    description: "Klasik anime mecha serilerindeki gibi, dev bir robotun kokpitinde duran bir pilot karakteri lazım.",
    creativeDirection: "Cel-shaded stil, canlı renkler, kokpit ekranlarında HUD detayları olsun.",
    preferredTool: "NovelAI",
    tags: [getTag("anime"), getTag("karakter-tasarimi")],
    status: "open",
    responseCount: 9,
    createdAt: "2026-09-13T15:30:00.000Z",
  },
  {
    id: "r3",
    author: user("u7"),
    title: "Terk edilmiş siberpunk metro istasyonu",
    description: "Yıllardır kullanılmayan, grafitilerle kaplı bir metro istasyonu görseli arıyorum.",
    creativeDirection: "Neon ışıklardan geriye sadece birkaç titreşen tabela kalmış olsun, atmosferik sis olsun.",
    preferredTool: null,
    tags: [getTag("siberpunk"), getTag("neon")],
    status: "answered",
    responseCount: 14,
    createdAt: "2026-09-11T09:00:00.000Z",
  },
  {
    id: "r4",
    author: user("u4"),
    title: "Japon tarzı çay evi mimarisi",
    description: "Geleneksel Japon mimarisiyle modern minimalizmi harmanlayan bir çay evi dış cephesi.",
    creativeDirection: "Ahşap dokular, kağıt paneller, bahçeyle uyumlu bir kompozisyon istiyorum.",
    preferredTool: "Midjourney",
    tags: [getTag("mimari"), getTag("minimalist")],
    status: "open",
    responseCount: 4,
    createdAt: "2026-09-10T18:20:00.000Z",
  },
  {
    id: "r5",
    author: user("u8"),
    title: "Ses dalgalarından oluşan soyut portre",
    description: "Bir insan silüetinin ses dalgaları ve parçacıklardan oluştuğu soyut bir kompozisyon.",
    creativeDirection: "Karanlık arka plan üzerine parlak, akışkan renkler tercih ederim.",
    preferredTool: null,
    tags: [getTag("soyut"), getTag("portre")],
    status: "closed",
    responseCount: 21,
    createdAt: "2026-09-05T11:10:00.000Z",
  },
  {
    id: "r6",
    author: user("u6"),
    title: "Kutup ışıklarında yalnız bir kabin",
    description: "Kar kaplı bir ormanda, üzerinde aurora borealis olan tek bir ahşap kabin.",
    creativeDirection: "Sıcak pencere ışığıyla soğuk gece atmosferi arasında kontrast olsun.",
    preferredTool: "Midjourney",
    tags: [getTag("manzara")],
    status: "open",
    responseCount: 7,
    createdAt: "2026-09-04T20:45:00.000Z",
  },
];

export function getRequestById(id: string): PromptRequest | undefined {
  return mockRequests.find((request) => request.id === id);
}
