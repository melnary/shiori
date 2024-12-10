importScripts("/assets/js/workbox/workbox-sw.js");

workbox.setConfig({
  modulePathPrefix: "/assets/js/workbox/"
  // Workbox runs in production mode by default
  // on sites other than localhost.
  // debug: true
});

const { Strategy: WorkboxStrategy } = workbox.strategies;

const CACHE = {
  API: "shiori-api-v1",
  BOOKMARK: "shiori-bookmarks-v1",
  HTML: "shiori-html-v1",

  JS: "shiori-javascript-v1",
  STYLE: "shiori-stylesheets-v1",
  IMAGE: "shiori-images-v1",
  FONT: "shiori-fonts-v1",
  RESOURCE: "shiori-resources-v1"
};

const STRATEGY = {
  CACHE_1ST: workbox.strategies.CacheFirst,
  NETWORK_1ST: workbox.strategies.NetworkFirst,
  SWR: workbox.strategies.StaleWhileRevalidate,
  NETWORK_ONLY: workbox.strategies.NetworkOnly,
  CACHE_ONLY: workbox.strategies.CacheOnly
}

const ONE_DAY = 60 * 60 * 24;
const ONE_WEEK = ONE_DAY * 7;

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Connect network route to specific cache
function registerCacheRoute(matcher, strategy, cacheName, maxEntries, maxAge) {
  workbox.routing.registerRoute(
    matcher,
    new strategy({
      cacheName: cacheName,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxAgeSeconds: maxAge,
          maxEntries: maxEntries,
        }),
      ],
    })
  );
}

// Connect asset route to cache with default settings:
// 15 max entries, 7 days max age, stale-while-revalidate strategy
function registerDefaultAssetCacheRoute(assetType, cacheName) {
  registerCacheRoute(
    ({request}) => request.destination === assetType,
    STRATEGY.SWR,
    cacheName,
    15,
    ONE_WEEK
  );
}

// Total bookmark list is updated frequently, we use a network-first strategy
// to ensure the list will update as soon as possible.
// The list is cached for 1 week, for longer offline access.
registerCacheRoute(
  ({url}) => ['/api/bookmarks', '/api/tags', '/api/accounts'].includes(url.pathname),
  STRATEGY.NETWORK_1ST,
  CACHE.API,
  50,
  ONE_WEEK
)

// API v1 is used for account and bookmark information, we use a network-first
// strategy to keep the information up-to-date. The API is cached for 1 week.
registerCacheRoute(
  ({url}) => url.pathname.startsWith('/api/v1/') && !url.pathname.startsWith('/api/v1/pwa'),
  STRATEGY.NETWORK_1ST,
  CACHE.API,
  100,
  ONE_WEEK
)

// Bookmark content pages are not frequently updated, we use a stale-while-revalidate
// strategy to ensure the content is always available, but also updated when possible.
registerCacheRoute(
  ({url, request}) => request.destination === 'document' && url.pathname.startsWith('/bookmark'),
  STRATEGY.SWR,
  CACHE.BOOKMARK,
  500,
  ONE_WEEK
)

// Other pages are frequently updated, we use a network-first strategy to ensure
// the latest content is always available. However, the pages are cached for 1 week
// for longer offline access.
registerCacheRoute(
  ({url, request}) => request.destination === 'document' && !url.pathname.startsWith('/bookmark'),
  STRATEGY.NETWORK_1ST,
  CACHE.HTML,
  10,
  ONE_WEEK
)

class PWAStrategy extends WorkboxStrategy {
  async _handle(request, handler) {
    let success = false;

    try {
      const response = await handler.fetch(request);
      if (!response.ok) {
        throw new Error("pwa request failed with status " + response.status);
      }

      const result = await response.json();
      if (!result.ok) {
        throw new Error("pwa request failed with status " + result.status);
      }
    
      success = true;
    } catch (error) {
      console.error(error);
    }

    const resultString = success ? "ok" : "fail";

    const requestUrl = new URL(request.url);
    const redirectUrl = new URL(requestUrl.origin);
    redirectUrl.hash = "home";
    redirectUrl.searchParams.set("share", resultString);

    const redirectResponse = Response.redirect(redirectUrl, 303);
  
    return redirectResponse;
  }
}

// PWA POST requests are intercepted by us.
workbox.routing.registerRoute(
  ({url}) => url.pathname.startsWith("/api/v1/pwa"),
  new PWAStrategy({}),
  "POST"
);

// Other asset types are cached with default settings.
registerDefaultAssetCacheRoute("script", CACHE.JS);
registerDefaultAssetCacheRoute("style", CACHE.STYLE);
registerDefaultAssetCacheRoute("image", CACHE.IMAGE);
registerDefaultAssetCacheRoute("font", CACHE.FONT);
registerDefaultAssetCacheRoute("manifest", CACHE.RESOURCE);
