'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabaseClient'

type Option = { code: string; name: string }

export type LocationValue = {
  regionCode: string
  provinceCode: string
  cityCode: string
  barangayCode: string
  purok: string
  /** "Barangay, City, Province, Region, Purok X" */
  area: string
  /** Region, (province when the region has one), city and barangay are chosen. */
  complete: boolean
}

export const EMPTY_LOCATION: LocationValue = {
  regionCode: '',
  provinceCode: '',
  cityCode: '',
  barangayCode: '',
  purok: '',
  area: '',
  complete: false,
}

// Same hierarchy as the sign-up page: Region -> Province -> City/Municipality ->
// Barangay, plus a free-text Purok. Regions without provinces (NCR) go straight
// from region to city. Renders <label> rows so it matches the surrounding form.
// To clear every field (e.g. after a successful submit) give it a new React `key`.
export function LocationFields({ onChange }: { onChange: (value: LocationValue) => void }) {
  const supabase = useMemo(() => createClient(), [])

  const [regions, setRegions] = useState<Option[]>([])
  const [provinces, setProvinces] = useState<Option[]>([])
  const [cities, setCities] = useState<Option[]>([])
  const [barangays, setBarangays] = useState<Option[]>([])

  const [region, setRegion] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [barangay, setBarangay] = useState('')
  const [purok, setPurok] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load(type: string, parent: string | null) {
    let query = supabase
      .from('ph_locations')
      .select('code,name')
      .eq('location_type', type)
      .eq('is_active', true)
      .order('name')
    query = parent ? query.eq('parent_code', parent) : query.is('parent_code', null)

    const { data, error: err } = await query
    if (err) throw new Error(err.message)
    return (data || []) as Option[]
  }

  useEffect(() => {
    load('region', null)
      .then(setRegions)
      .catch((e: Error) => setError(`Unable to load regions: ${e.message}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const regionHasProvince = provinces.length > 0
  const nameOf = (list: Option[], code: string) => list.find((o) => o.code === code)?.name

  const area = useMemo(() => {
    const cleanPurok = purok.trim().replace(/^purok\s*/i, '')
    return [
      nameOf(barangays, barangay),
      nameOf(cities, city),
      nameOf(provinces, province),
      nameOf(regions, region),
      cleanPurok ? `Purok ${cleanPurok}` : null,
    ]
      .filter(Boolean)
      .join(', ')
  }, [barangays, cities, provinces, regions, barangay, city, province, region, purok])

  useEffect(() => {
    onChange({
      regionCode: region,
      provinceCode: province,
      cityCode: city,
      barangayCode: barangay,
      purok: purok.trim(),
      area,
      complete: !!region && (!regionHasProvince || !!province) && !!city && !!barangay,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, province, city, barangay, purok, area, regionHasProvince])

  async function pickRegion(code: string) {
    setRegion(code)
    setProvince('')
    setCity('')
    setBarangay('')
    setProvinces([])
    setCities([])
    setBarangays([])
    setError('')
    if (!code) return
    setLoading(true)
    try {
      const provinceRows = await load('province', code)
      setProvinces(provinceRows)
      if (provinceRows.length === 0) setCities(await load('city_municipality', code))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load provinces.')
    } finally {
      setLoading(false)
    }
  }

  async function pickProvince(code: string) {
    setProvince(code)
    setCity('')
    setBarangay('')
    setCities([])
    setBarangays([])
    setError('')
    if (!code) return
    setLoading(true)
    try {
      setCities(await load('city_municipality', code))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load cities.')
    } finally {
      setLoading(false)
    }
  }

  async function pickCity(code: string) {
    setCity(code)
    setBarangay('')
    setBarangays([])
    setError('')
    if (!code) return
    setLoading(true)
    try {
      setBarangays(await load('barangay', code))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load barangays.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <label>
        <span>Region</span>
        <select value={region} onChange={(e) => void pickRegion(e.target.value)} required>
          <option value="" disabled>
            {regions.length === 0 ? 'Loading regions…' : 'Select region'}
          </option>
          {regions.map((o) => (
            <option key={o.code} value={o.code}>{o.name}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Province</span>
        <select
          value={province}
          onChange={(e) => void pickProvince(e.target.value)}
          disabled={!region || loading || !regionHasProvince}
          required={regionHasProvince}
        >
          <option value="" disabled>
            {region && !regionHasProvince && !loading ? 'No province — pick a city / municipality' : 'Select province'}
          </option>
          {provinces.map((o) => (
            <option key={o.code} value={o.code}>{o.name}</option>
          ))}
        </select>
      </label>

      <label>
        <span>City / Municipality</span>
        <select
          value={city}
          onChange={(e) => void pickCity(e.target.value)}
          disabled={!region || loading || (regionHasProvince && !province) || cities.length === 0}
          required
        >
          <option value="" disabled>Select city / municipality</option>
          {cities.map((o) => (
            <option key={o.code} value={o.code}>{o.name}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Barangay</span>
        <select
          value={barangay}
          onChange={(e) => setBarangay(e.target.value)}
          disabled={!city || loading || barangays.length === 0}
          required
        >
          <option value="" disabled>Select barangay</option>
          {barangays.map((o) => (
            <option key={o.code} value={o.code}>{o.name}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Purok</span>
        <input
          type="text"
          value={purok}
          onChange={(e) => setPurok(e.target.value)}
          placeholder="Enter the Purok"
          autoComplete="off"
          required
        />
      </label>

      {error ? <p role="alert" style={{ color: '#dc2626', fontSize: 13 }}>{error}</p> : null}
    </>
  )
}
