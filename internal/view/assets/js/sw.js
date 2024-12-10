importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

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
function registerRoute(matcher, strategy, cacheName, maxEntries, maxAge) {
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
function registerDefaultAssetRoute(assetType, cacheName) {
  registerRoute(
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
registerRoute(
  ({url}) => ['/api/bookmarks', '/api/tags', '/api/accounts'].includes(url.pathname),
  STRATEGY.NETWORK_1ST,
  CACHE.API,
  50,
  ONE_WEEK
)

// API v1 is used for account and bookmark information, we use a network-first
// strategy to keep the information up-to-date. The API is cached for 1 week.
registerRoute(
  ({url}) => url.pathname.startsWith('/api/v1/'),
  STRATEGY.NETWORK_1ST,
  CACHE.API,
  100,
  ONE_WEEK
)

// Bookmark content pages are not frequently updated, we use a stale-while-revalidate
// strategy to ensure the content is always available, but also updated when possible.
registerRoute(
  ({url, request}) => request.destination === 'document' && url.pathname.startsWith('/bookmark'),
  STRATEGY.SWR,
  CACHE.BOOKMARK,
  500,
  ONE_WEEK
)

// Other pages are frequently updated, we use a network-first strategy to ensure
// the latest content is always available. However, the pages are cached for 1 week
// for longer offline access.
registerRoute(
  ({url, request}) => request.destination === 'document' && !url.pathname.startsWith('/bookmark'),
  STRATEGY.NETWORK_1ST,
  CACHE.HTML,
  10,
  ONE_WEEK
)

// Other asset types are cached with default settings.
registerDefaultAssetRoute("script", CACHE.JS);
registerDefaultAssetRoute("style", CACHE.STYLE);
registerDefaultAssetRoute("image", CACHE.IMAGE);
registerDefaultAssetRoute("font", CACHE.FONT);
registerDefaultAssetRoute("manifest", CACHE.RESOURCE);
