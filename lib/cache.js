const { createCache } = require("cache-manager");
const { Keyv } = require("keyv");
const { KeyvCacheableMemory } = require("cacheable");
const { KeyvSqlite } = require("@keyv/sqlite");
const path = require("path");

// Cache configuration
const NO_CACHE = 0;
const COLLECTION_KEY_PREFIX = "collection";
const MOVIE_KEY_PREFIX = "movie";
const SEARCH_KEY_PREFIX = "search";
const OTHER_KEY_PREFIX = "other";
const OTHER_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const COLLECTION_TTL = 2.4 * 24 * 60 * 60 * 1000; // 2.4 days - with 1.5 days refresh threshold it will be cached for 0.9 of the day (buffering cron runs every 1 full day, so catalogs will be refreshed every day)
const COLLECTION_REFRESH_THRESHOLD = 1.5 * 24 * 60 * 60 * 1000; // 1.5 days windows in which some catalog call (e. g. buffering cron) executes refresh
const SEARCH_TTL = 2 * 24 * 60 * 60 * 1000; // 2 days
const MOVIE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days - some big number to treat possible issues with lru cache

let lruCache = null;
const lruCacheSize = 500; //max number of keys in lru cache
let ttlCache = null;
let sqliteCache = null;

// Initialize caches
function initCache() {
  console.log("cache has been initialized");

  // Ensure the ../sqlite directory exists
  require("fs").mkdirSync(path.join(__dirname, "../sqlite"), { recursive: true });

  // SQLite cache for other data
  const sqliteStore = new KeyvSqlite("sqlite://" + path.join(__dirname, "../sqlite/cache.sqlite"), { table: "keyv_cache" });

  sqliteCache = createCache({
    stores: [new Keyv({ store: sqliteStore, ttl: COLLECTION_TTL })],
  });

  // LRU cache for movies (keep in memory)
  const lruStore = new KeyvCacheableMemory({
    ttl: MOVIE_TTL,
    lruSize: lruCacheSize,
    checkInterval: MOVIE_TTL / 2, //MOVIE_TTL + 1 day
  });
  lruCache = createCache({
    stores: [new Keyv({ store: lruStore })],
    ttl: MOVIE_TTL,
  });

  // TTL-only cache for other data
  const ttlStore = new KeyvCacheableMemory({
    ttl: COLLECTION_TTL,
    checkInterval: 4 * 60 * 60 * 1000, //every 4 hours
  });
  ttlCache = createCache({
    stores: [new Keyv({ store: ttlStore })],
    ttl: COLLECTION_TTL,
  });

  return { lruCache, ttlCache };
}

// Initialize caches immediately
initCache();

// collection-specific cache wrapper with refresh threshold
async function cacheWrapCollectionDetails(id, method, options = {}) {
  let { ttl, refreshThreshold, cache } = options;
  if (cache === "sqlite") {
    cache = sqliteCache;
  }

  return cacheWrap(`${COLLECTION_KEY_PREFIX}:${id}`, method, {
    ttl: ttl || COLLECTION_TTL,
    refreshThreshold: refreshThreshold || COLLECTION_REFRESH_THRESHOLD,
    cache: cache || ttlCache,
    isCollection: true,
  });
}

// Movie-specific cache wrapper with LRU
async function cacheWrapMovieDetails(id, method, options = {}) {
  const { ttl, cache } = options;
  return cacheWrap(`${MOVIE_KEY_PREFIX}:${id}`, method, {
    ttl: ttl || MOVIE_TTL,
    cache: cache || lruCache,
  });
}

// Movie-specific cache wrapper with LRU
async function cacheWrapOthers(id, method, options = {}) {
  const { ttl, cache } = options;
  return cacheWrap(`${OTHER_KEY_PREFIX}:${id}`, method, {
    ttl: ttl || OTHER_TTL,
    cache: cache || ttlCache,
  });
}

// Search-specific cache wrapper
async function cacheWrapSearch(query, method, options = {}) {
  const { ttl, cache } = options;
  return cacheWrap(`${SEARCH_KEY_PREFIX}:${query}`, method, {
    ttl: ttl || SEARCH_TTL,
    cache: cache || ttlCache,
  });
}

// Generic cache wrapper
async function cacheWrap(key, method, options = {}) {
  if (NO_CACHE) {
    return method();
  }

  // Get the appropriate cache instance from options
  const cache = options.cache;
  if (!cache) {
    console.error("No cache instance provided for key:", key);
    return method();
  }

  try {
    //beamup can't handle all the catalogs in-memory, so we need to cache some of them through sqlite
    //and as they can be later on accessed through Stremio search or other overlapping catalogs, we need to try sqlite first and if not found, try in-memory
    if (options.isCollection && (await sqliteCache.get(key))) {
      //if we have collection cached through sqlite, call it through wrap, which handles also refreshing
      return await sqliteCache.wrap(key, method, options.ttl, options.refreshThreshold);
    } else {
      // otherwise use cache set in options, which can be in-memory, lru or sqlite
      return await cache.wrap(key, method, options.ttl, options.refreshThreshold);
    }
  } catch (error) {
    if (!error.message.includes("404")) {
      console.error(`Cache error for key: ${key}`, error);
    }
    // On error, execute method directly
    return method();
  }
}

module.exports = {
  cacheWrapCollectionDetails,
  cacheWrapSearch,
  cacheWrapMovieDetails,
  cacheWrapOthers,
};
