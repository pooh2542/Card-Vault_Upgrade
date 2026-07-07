// CardVault Pro — Service Worker
// อัปเดตเลขเวอร์ชันนี้ทุกครั้งที่แก้ index.html เพื่อบังคับให้ผู้ใช้ได้ไฟล์ใหม่
const CACHE_VERSION = 'v1';
const CACHE_NAME = `cardvault-${CACHE_VERSION}`;

// เฉพาะไฟล์ same-origin เท่านั้นที่ precache ตอนติดตั้ง (ต้องโหลดสำเร็จทุกไฟล์ ไม่งั้น install จะ fail)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // ไม่ skipWaiting อัตโนมัติ — รอให้ผู้ใช้กดยืนยันจากแบนเนอร์ "มีอัปเดตใหม่" ในหน้าเว็บก่อน
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ผู้ใช้กดปุ่ม "อัปเดตตอนนี้" ในหน้าเว็บ -> สั่งให้ SW ใหม่ทำงานทันที
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // หน้าเว็บหลัก (navigation): ลองโหลดสดจากเน็ตก่อน ถ้าไม่ได้ค่อย fallback เป็นแคช
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // ไฟล์อื่นๆ ทั้งหมด (CSS/JS/รูป/ไลบรารีจาก CDN เช่น Tailwind, Chart.js, xlsx):
  // ใช้แคชก่อนถ้ามี (โหลดไว) แล้วแอบไปเช็คของใหม่จากเน็ตมาอัปเดตแคชไว้ใช้ครั้งหน้า (stale-while-revalidate)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    const networkFetch = fetch(req).then((res) => {
      // รองรับทั้ง response ปกติ (200) และ opaque response (คำขอข้ามโดเมนแบบ no-cors จาก CDN)
      if (res && (res.status === 200 || res.type === 'opaque')) {
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => null);

    return cached || (await networkFetch) || new Response('ออฟไลน์อยู่ และยังไม่มีไฟล์นี้ในแคช', { status: 503, statusText: 'Offline' });
  })());
});
