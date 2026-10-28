/* ============================================================================
 * Ma Sói Online 3D — Split-Strategy Service Worker (V4.1 Flagship — Chốt #14)
 * 1. Bỏ qua 100% WebSocket (/socket.io/), API (/api/) và non-GET request.
 * 2. Network-First cho HTML, JS, CSS & file *_manifest.json / village_layout.json
 *    -> Không bao giờ bị kẹt code cũ sau khi đẩy bản vá nóng (Hotfix).
 * 3. Cache-First cho tài sản tĩnh nặng (.glb, .webp, .mp3, /draco/*)
 *    -> Tải 0 MB từ ván thứ 2 trở đi, vào bàn siêu tốc!
 * ============================================================================ */

const SHELL_CACHE = "masoi-shell-v4.3.2";
const ASSET_CACHE = "masoi-assets-v4.3";
const ACTIVE_CACHES = [SHELL_CACHE, ASSET_CACHE];

const IMMUTABLE_ASSET_RE = /\.(glb|gltf|bin|wasm|webp|png|jpg|jpeg|mp3|ogg|wav|woff2?)(\?.*)?$/i;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) =>
      cache.addAll([
        "/draco/draco_decoder.js",
        "/draco/draco_wasm_wrapper.js",
        "/draco/draco_decoder.wasm",
        "/icon-192.png",
      ]).catch(() => {})
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !ACTIVE_CACHES.includes(k))
            .map((oldKey) => caches.delete(oldKey))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isHeavyStaticAsset(urlObj) {
  const p = urlObj.pathname;
  if (
    p.startsWith("/models/") ||
    p.startsWith("/portraits/") ||
    p.startsWith("/avatars/") ||
    p.startsWith("/audio/") ||
    p.startsWith("/draco/")
  ) {
    // Riêng file manifest JSON trong /models/ luôn đi Network-First để cập nhật nhân vật mới ngay!
    if (p.endsWith(".json")) return false;
    return true;
  }
  return IMMUTABLE_ASSET_RE.test(p) && !p.endsWith(".json");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let urlObj;
  try {
    urlObj = new URL(req.url);
  } catch {
    return;
  }

  // Chỉ xử lý tài nguyên cùng origin và tránh xa Socket.IO / REST API / Range stream phức tạp
  if (urlObj.origin !== self.location.origin) return;
  if (urlObj.pathname.startsWith("/socket.io/") || urlObj.pathname.startsWith("/api/")) {
    return;
  }
  if (req.headers.has("range")) return;

  // NHÁNH A: CACHE-FIRST cho GLB 3D, WebP Portrait, Audio & Bộ giải mã Draco cục bộ (0 MB ván 2)
  if (isHeavyStaticAsset(urlObj)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const netRes = await fetch(req);
          if (netRes && netRes.status === 200) {
            cache.put(req, netRes.clone()).catch(() => {});
          }
          return netRes;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  // NHÁNH B: NETWORK-FIRST cho App Shell (HTML, JS, CSS, Manifest JSON) -> chống kẹt code cũ 100%
  event.respondWith(
    fetch(req)
      .then((netRes) => {
        if (netRes && netRes.status === 200) {
          const clone = netRes.clone();
          caches
            .open(SHELL_CACHE)
            .then((cache) => cache.put(req, clone))
            .catch(() => {});
        }
        return netRes;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const fallbackIndex = await caches.match("/index.html");
          if (fallbackIndex) return fallbackIndex;
        }
        throw new Error("Offline and not cached");
      })
  );
});
