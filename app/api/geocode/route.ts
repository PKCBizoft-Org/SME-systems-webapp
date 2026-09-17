import { NextRequest, NextResponse } from "next/server";

type GeocodeResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId: number | null;
  locationType: string | null;
};

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  place_id?: number;
  type?: string;
};

type CacheEntry = {
  expiresAt: number;
  value: GeocodeResult;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Keep a small in-memory cache so the same service area
// does not repeatedly hit the public Nominatim service.
const globalCache = globalThis as typeof globalThis & {
  __pkcGeocodeCache?: Map<string, CacheEntry>;
  __pkcGeocodeQueue?: Promise<void>;
  __pkcLastGeocodeAt?: number;
};

const cache =
  globalCache.__pkcGeocodeCache ??
  (globalCache.__pkcGeocodeCache = new Map<string, CacheEntry>());

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Nominatim's public service should not be hammered with
 * multiple simultaneous requests.
 *
 * This keeps requests at roughly one per second.
 */
async function queueNominatim<T>(
  job: () => Promise<T>,
): Promise<T> {
  const previous =
    globalCache.__pkcGeocodeQueue ?? Promise.resolve();

  let release!: () => void;

  globalCache.__pkcGeocodeQueue = new Promise<void>(
    (resolve) => {
      release = resolve;
    },
  );

  await previous;

  try {
    const now = Date.now();
    const last =
      globalCache.__pkcLastGeocodeAt ?? 0;

    const remaining =
      1100 - (now - last);

    if (remaining > 0) {
      await wait(remaining);
    }

    globalCache.__pkcLastGeocodeAt =
      Date.now();

    return await job();
  } finally {
    release();
  }
}

/**
 * Normalize common Philippine abbreviations used
 * in the customer's Service Area field.
 *
 * Examples:
 *   DdO -> Davao de Oro
 *   DDO -> Davao de Oro
 *   Ddo -> Davao de Oro
 */
function expandPhilippineLocation(query: string): string {
  return query
    .replace(
      /\bDdO\b/gi,
      "Davao de Oro",
    )
    .replace(
      /\bD\.?D\.?O\.?\b/gi,
      "Davao de Oro",
    )
    .replace(
      /\bDavao del Oro\b/gi,
      "Davao de Oro",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

/**
 * Avoid adding Philippines twice.
 */
function withPhilippines(query: string): string {
  if (/,\s*philippines\s*$/i.test(query)) {
    return query;
  }

  return `${query}, Philippines`;
}

/**
 * Perform one Nominatim search.
 */
async function searchNominatim(
  query: string,
): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: withPhilippines(query),
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    countrycodes: "ph",
    "accept-language": "en",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",

        /*
         * Identify the application to Nominatim.
         */
        "User-Agent":
          "PKC-BIZOFT-Customer-Operations/1.0 (OpenStreetMap geocoding)",
      },

      /*
       * We already maintain our own cache above.
       */
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Nominatim returned HTTP ${response.status}.`,
    );
  }

  const results =
    (await response.json()) as NominatimResult[];

  if (
    !Array.isArray(results) ||
    results.length === 0
  ) {
    return null;
  }

  const result = results.find(
    (item) => {
      if (!item.lat || !item.lon) {
        return false;
      }

      const latitude = Number(item.lat);
      const longitude = Number(item.lon);

      return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
      );
    },
  );

  if (!result?.lat || !result?.lon) {
    return null;
  }

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    formattedAddress:
      result.display_name || query,
    placeId:
      result.place_id ?? null,
    locationType:
      result.type || null,
  };
}

export async function GET(
  request: NextRequest,
) {
  const query =
    request.nextUrl.searchParams
      .get("q")
      ?.trim();

  if (!query) {
    return NextResponse.json(
      {
        error:
          "Please provide a location to search for.",
      },
      { status: 400 },
    );
  }

  /*
   * Normalize the query for caching.
   */
  const normalizedQuery =
    query
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const cached =
    cache.get(normalizedQuery);

  if (
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return NextResponse.json(
      cached.value,
    );
  }

  /*
   * Create progressively better search queries.
   *
   * For example:
   *
   * Tagnanan, Mabini, DdO
   *
   * becomes:
   *
   * 1. Tagnanan, Mabini, DdO
   * 2. Tagnanan, Mabini, Davao de Oro
   * 3. Tagnanan, Mabini
   * 4. Tagnanan, Davao de Oro
   */
  const expanded =
    expandPhilippineLocation(query);

  const queries: string[] = [];

  const addQuery = (value: string) => {
    const clean =
      value
        .replace(/\s+/g, " ")
        .replace(/,\s*,/g, ",")
        .trim()
        .replace(/^,\s*|\s*,$/g, "");

    if (
      clean &&
      !queries.some(
        (existing) =>
          existing.toLowerCase() ===
          clean.toLowerCase(),
      )
    ) {
      queries.push(clean);
    }
  };

  /*
   * First try the original database value.
   */
  addQuery(query);

  /*
   * Then try the expanded Davao de Oro version.
   */
  if (
    expanded.toLowerCase() !==
    query.toLowerCase()
  ) {
    addQuery(expanded);
  }

  /*
   * Split the location into components.
   *
   * Example:
   * Tagnanan, Mabini, Davao de Oro
   */
  const parts = expanded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    /*
     * Barangay + municipality
     */
    addQuery(
      `${parts[0]}, ${parts[1]}`,
    );

    /*
     * Barangay + province
     */
    addQuery(
      `${parts[0]}, ${parts[2]}`,
    );
  }

  /*
   * Execute the searches through the rate-limited queue.
   */
  try {
    const result =
      await queueNominatim(
        async () => {
          for (
            const searchQuery of queries
          ) {
            try {
              const result =
                await searchNominatim(
                  searchQuery,
                );

              if (result) {
                return result;
              }
            } catch (error) {
              console.error(
                `Nominatim search failed for "${searchQuery}":`,
                error,
              );

              /*
               * If one query fails, continue to the
               * next fallback query.
               */
            }
          }

          return null;
        },
      );

    if (!result) {
      return NextResponse.json(
        {
          error:
            `No matching location was found for "${query}". ` +
            `Try adding a barangay, municipality, city, or province.`,
        },
        { status: 404 },
      );
    }

    /*
     * Cache successful results for 24 hours.
     */
    cache.set(
      normalizedQuery,
      {
        expiresAt:
          Date.now() +
          CACHE_TTL_MS,
        value: result,
      },
    );

    return NextResponse.json(
      result,
    );
  } catch (error) {
    console.error(
      "OpenStreetMap geocoding error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to contact OpenStreetMap. Please try again.",
      },
      { status: 502 },
    );
  }
}
//MAP clients[id] HAHAHHAHAA important for geocoding service area