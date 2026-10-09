import { NextRequest, NextResponse } from 'next/server'
import { getCaller } from '@/lib/serverSecurity'

// Does a GPS point fall in the barangay the customer registered? Reverse-geocodes
// the point (OpenStreetMap / Nominatim) and compares the place names with the
// barangay on the signed-in customer's account. The mobile app uses this to
// warn when someone pins a location outside their own barangay.
//
// Nominatim asks for about one request per second and a real User-Agent.
const globalState = globalThis as typeof globalThis & { __pkcReverseLast?: number }

const norm = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(barangay|brgy|bgy|city of|city|municipality of)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export async function POST(request: NextRequest) {
  const caller = await getCaller(request)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const lat = Number(body.latitude)
  const lon = Number(body.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 4 || lat > 22 || lon < 116 || lon > 128) {
    return NextResponse.json({ error: 'That is not a location in the Philippines.' }, { status: 400 })
  }

  // The barangay registered on the customer's own account.
  const { data: profile } = await caller.admin
    .from('user_profiles')
    .select('barangay_code, city_municipality_code')
    .eq('user_id', caller.user.id)
    .maybeSingle()

  const codes = [profile?.barangay_code, profile?.city_municipality_code].filter(Boolean) as string[]
  const { data: places } = codes.length
    ? await caller.admin.from('ph_locations').select('code, name').in('code', codes)
    : { data: [] as { code: string; name: string }[] }
  const registeredBarangay = norm(places?.find((p) => p.code === profile?.barangay_code)?.name || '')
  const registeredCity = norm(places?.find((p) => p.code === profile?.city_municipality_code)?.name || '')

  if (!registeredBarangay) {
    return NextResponse.json({ ok: true, checked: false })
  }

  // Keep to roughly one request a second.
  const wait = 1100 - (Date.now() - (globalState.__pkcReverseLast ?? 0))
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  globalState.__pkcReverseLast = Date.now()

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&lat=${lat}&lon=${lon}`,
      {
        headers: { 'User-Agent': 'PKC-BIZOFT/1.0 (pkc.netlink.biz@gmail.com)', 'Accept-Language': 'en' },
        cache: 'no-store',
      },
    )
    if (!response.ok) return NextResponse.json({ ok: true, checked: false })

    const data = (await response.json()) as {
      display_name?: string
      address?: Record<string, string>
    }

    const address = data.address || {}
    const names = [
      address.village,
      address.suburb,
      address.neighbourhood,
      address.quarter,
      address.hamlet,
      address.city_district,
      data.display_name,
    ]
      .filter(Boolean)
      .map((n) => norm(String(n)))

    const inBarangay = names.some((n) => n.includes(registeredBarangay))
    const foundPlace =
      address.village || address.suburb || address.neighbourhood || address.quarter || address.hamlet || null
    const city = norm(String(address.city || address.town || address.municipality || ''))

    return NextResponse.json({
      ok: true,
      checked: true,
      matches: inBarangay,
      foundBarangay: foundPlace,
      sameCity: registeredCity ? city.includes(registeredCity) || registeredCity.includes(city) : null,
      place: data.display_name || null,
    })
  } catch {
    // Never block the customer because the map service is slow.
    return NextResponse.json({ ok: true, checked: false })
  }
}
