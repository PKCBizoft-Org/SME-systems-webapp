import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const API = 'https://psgc.cloud/api/v2'

const MAX_RETRIES = 8
const BASE_RETRY_DELAY = 5000

// Delay between PSGC requests.
// This is intentionally conservative to avoid 429 errors.
const REQUEST_DELAY = 1000

if (!SUPABASE_URL) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL in .env.local'
  )
  process.exit(1)
}

if (!SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_SERVICE_ROLE_KEY in .env.local'
  )
  process.exit(1)
}

const supabase = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

/* =========================================================
   HELPERS
   ========================================================= */

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  )
}

function normalizeItems(payload) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.data)) {
    return payload.data
  }

  if (Array.isArray(payload?.results)) {
    return payload.results
  }

  if (Array.isArray(payload?.items)) {
    return payload.items
  }

  throw new Error(
    `Unexpected PSGC API response format:\n${JSON.stringify(
      payload,
      null,
      2
    ).slice(0, 3000)}`
  )
}

/* =========================================================
   PSGC REQUEST
   ========================================================= */

async function getJson(path, attempt = 1) {
  const url = `${API}${path}`

  console.log(`GET ${path}`)

  let response

  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'SME-systems-webapp-location-importer/1.0',
      },
    })
  } catch (error) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(
        `Network error requesting ${path}: ${
          error?.message || error
        }`
      )
    }

    const delay = Math.min(
      120000,
      BASE_RETRY_DELAY *
        Math.pow(2, attempt - 1)
    )

    console.log(
      `Network error. Waiting ${Math.ceil(
        delay / 1000
      )} seconds before retry...`
    )

    await sleep(delay)

    return getJson(
      path,
      attempt + 1
    )
  }

  const text = await response.text()

  /* -------------------------------------------------------
     RATE LIMIT
     ------------------------------------------------------- */

  if (response.status === 429) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(
        `PSGC API returned 429 too many times for ${path}.`
      )
    }

    const retryAfterHeader =
      response.headers.get(
        'retry-after'
      )

    const retryAfterSeconds =
      Number(retryAfterHeader)

    const delay =
      Number.isFinite(
        retryAfterSeconds
      ) &&
      retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : Math.min(
            120000,
            BASE_RETRY_DELAY *
              Math.pow(2, attempt - 1)
          )

    console.log('')
    console.log(
      `PSGC rate limit reached.`
    )
    console.log(
      `Waiting ${Math.ceil(
        delay / 1000
      )} seconds...`
    )
    console.log(
      `Retry ${attempt}/${MAX_RETRIES}`
    )

    await sleep(delay)

    return getJson(
      path,
      attempt + 1
    )
  }

  /* -------------------------------------------------------
     OTHER ERRORS
     ------------------------------------------------------- */

  if (!response.ok) {
    throw new Error(
      `PSGC API ${response.status} for ${path}\n${text}`
    )
  }

  /* -------------------------------------------------------
     JSON
     ------------------------------------------------------- */

  let payload

  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(
      `PSGC API returned invalid JSON for ${path}\n${text.slice(
        0,
        1000
      )}`
    )
  }

  // Give the API a little breathing room.
  await sleep(REQUEST_DELAY)

  return payload
}

/* =========================================================
   SUPABASE IMPORT
   ========================================================= */

async function upsertRows(
  rows,
  label
) {
  if (!rows.length) {
    console.log(
      `${label}: nothing to import.`
    )
    return
  }

  const batchSize = 500

  console.log(
    `\nImporting ${rows.length} ${label}...`
  )

  for (
    let i = 0;
    i < rows.length;
    i += batchSize
  ) {
    const batch =
      rows.slice(
        i,
        i + batchSize
      )

    const { error } =
      await supabase
        .from('ph_locations')
        .upsert(
          batch,
          {
            onConflict:
              'code',
          }
        )

    if (error) {
      throw new Error(
        `Supabase error importing ${label}:\n${error.message}`
      )
    }

    const imported =
      Math.min(
        i + batch.length,
        rows.length
      )

    process.stdout.write(
      `\r${label}: ${imported}/${rows.length}`
    )
  }

  process.stdout.write('\n')

  console.log(
    `✓ ${label} imported successfully.`
  )
}

/* =========================================================
   ROW CREATION
   ========================================================= */

function locationRow(
  item,
  locationType,
  parentCode
) {
  return {
    code: String(
      item.code
    ),
    name: String(
      item.name
    ),
    location_type:
      locationType,
    parent_code:
      parentCode
        ? String(
            parentCode
          )
        : null,
    is_active: true,
  }
}

/* =========================================================
   MAIN
   ========================================================= */

async function main() {
  console.log('')
  console.log(
    '=============================================='
  )
  console.log(
    ' Philippine PSGC Location Importer'
  )
  console.log(
    '=============================================='
  )
  console.log('')

  console.log(
    'Strategy:'
  )

  console.log(
    'Region → Province → City/Municipality → Barangay'
  )

  console.log('')
  console.log(
    `Request delay: ${REQUEST_DELAY}ms`
  )
  console.log(
    `Maximum retries: ${MAX_RETRIES}`
  )
  console.log('')

  /* =======================================================
     REGIONS
     ======================================================= */

  console.log(
    'Loading Philippine regions...'
  )

  const regionsPayload =
    await getJson(
      '/regions'
    )

  const regions =
    normalizeItems(
      regionsPayload
    )

  console.log(
    `✓ Found ${regions.length} regions.`
  )

  const regionRows =
    regions.map(
      (region) =>
        locationRow(
          region,
          'region',
          null
        )
    )

  await upsertRows(
    regionRows,
    'regions'
  )

  /* =======================================================
     PROVINCES
     ======================================================= */

  const provinceRows = []

  console.log('')
  console.log(
    'Loading provinces by region...'
  )

  for (
    let regionIndex = 0;
    regionIndex <
    regions.length;
    regionIndex++
  ) {
    const region =
      regions[
        regionIndex
      ]

    console.log('')
    console.log(
      `[Region ${regionIndex + 1}/${regions.length}] ${region.name}`
    )

    const payload =
      await getJson(
        `/regions/${encodeURIComponent(
          region.code
        )}/provinces`
      )

    const provinces =
      normalizeItems(
        payload
      )

    console.log(
      `Found ${provinces.length} provinces.`
    )

    for (const province of provinces) {
      provinceRows.push(
        locationRow(
          province,
          'province',
          region.code
        )
      )
    }
  }

  console.log('')
  console.log(
    `✓ Total provinces: ${provinceRows.length}`
  )

  await upsertRows(
    provinceRows,
    'provinces'
  )

  /* =======================================================
     CITIES / MUNICIPALITIES
     ======================================================= */

  const cityRows = []

  console.log('')
  console.log(
    'Loading cities/municipalities by province...'
  )

  for (
    let provinceIndex = 0;
    provinceIndex <
    provinceRows.length;
    provinceIndex++
  ) {
    const province =
      provinceRows[
        provinceIndex
      ]

    console.log('')
    console.log(
      `[Province ${provinceIndex + 1}/${provinceRows.length}] ${province.name}`
    )

    const payload =
      await getJson(
        `/provinces/${encodeURIComponent(
          province.code
        )}/cities-municipalities`
      )

    const cities =
      normalizeItems(
        payload
      )

    console.log(
      `Found ${cities.length} cities/municipalities.`
    )

    for (const city of cities) {
      cityRows.push(
        locationRow(
          city,
          'city_municipality',
          province.code
        )
      )
    }
  }

  console.log('')
  console.log(
    `✓ Total cities/municipalities: ${cityRows.length}`
  )

  await upsertRows(
    cityRows,
    'cities/municipalities'
  )

  /* =======================================================
     BARANGAYS
     ======================================================= */

  const barangayRows = []

  console.log('')
  console.log(
    'Loading barangays by city/municipality...'
  )

  console.log(
    'This is intentionally throttled to prevent API 429 errors.'
  )

  for (
    let cityIndex = 0;
    cityIndex <
    cityRows.length;
    cityIndex++
  ) {
    const city =
      cityRows[
        cityIndex
      ]

    console.log('')
    console.log(
      `[Barangays ${cityIndex + 1}/${cityRows.length}] ${city.name}`
    )

    const payload =
      await getJson(
        `/cities-municipalities/${encodeURIComponent(
          city.code
        )}/barangays`
      )

    const barangays =
      normalizeItems(
        payload
      )

    console.log(
      `Found ${barangays.length} barangays.`
    )

    for (const barangay of barangays) {
      barangayRows.push(
        locationRow(
          barangay,
          'barangay',
          city.code
        )
      )
    }

    /*
     * Extra delay every 25 city/municipality requests.
     *
     * This gives the API a longer break during the
     * large barangay import.
     */
    if (
      (cityIndex + 1) %
        25 ===
      0
    ) {
      console.log('')
      console.log(
        'Taking a 10-second API cooldown...'
      )

      await sleep(
        10000
      )
    }
  }

  console.log('')
  console.log(
    `✓ Total barangays: ${barangayRows.length}`
  )

  await upsertRows(
    barangayRows,
    'barangays'
  )

  /* =======================================================
     FINAL SUMMARY
     ======================================================= */

  console.log('')
  console.log(
    '=============================================='
  )
  console.log(
    ' IMPORT COMPLETE'
  )
  console.log(
    '=============================================='
  )

  console.log('')

  console.log(
    `Regions:               ${regionRows.length}`
  )

  console.log(
    `Provinces:             ${provinceRows.length}`
  )

  console.log(
    `Cities/Municipalities: ${cityRows.length}`
  )

  console.log(
    `Barangays:             ${barangayRows.length}`
  )

  console.log('')

  console.log(
    'Database table:'
  )

  console.log(
    'public.ph_locations'
  )

  console.log('')

  console.log(
    'Signup hierarchy:'
  )

  console.log(
    'Region → Province → City/Municipality → Barangay'
  )

  console.log('')
}

/* =========================================================
   START
   ========================================================= */

main().catch(
  (error) => {
    console.error('')
    console.error(
      '=============================================='
    )
    console.error(
      ' IMPORT FAILED'
    )
    console.error(
      '=============================================='
    )
    console.error('')
    console.error(
      error?.message ||
        error
    )
    console.error('')

    process.exit(1)
  }
)