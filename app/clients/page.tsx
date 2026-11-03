'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { StaffHeader } from '../components/StaffHeader'
import { StaffMotion } from '../components/StaffMotion'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'
import { formatDate } from '@/lib/format'
import { planLabel, usePlanCatalog } from '@/lib/plans'


type Client = {
  id: string
  tenant_id: string | null
  customer_name: string | null
  install_date: string | null
  plan_name: string | null
  area: string | null
  installation_status: string | null
  account_status: string | null
  account_id: string | null
  mobile_number: string | null
  pppoe_name: string | null
  map_location: string | null
  technicians: string | null
}

type Filters = {
  name: string
  area: string
  plan: string
  installation: string
  account: string
  from: string
  to: string
}

type SortKey =
  | 'customer_name'
  | 'area'
  | 'plan_name'
  | 'install_date'
  | 'installation_status'
  | 'account_status'

type SortDirection = 'asc' | 'desc'

const PAGE_SIZE = 25

const DEFAULT_FILTERS: Filters = {
  name: '',
  area: '',
  plan: '',
  installation: '',
  account: '',
  from: '',
  to: '',
}

function normalizeArea(value: string | null) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function statusClass(status: string | null) {
  const value = String(status || '').toLowerCase()

  if (
    value === 'completed' ||
    value === 'paid' ||
    value === 'active'
  ) {
    return 'status statusGood'
  }

  if (
    value === 'due' ||
    value === 'scheduled'
  ) {
    return 'status statusWarn'
  }

  if (
    value === 'cancelled' ||
    value === 'terminated' ||
    value === 'inactive' ||
    value === 'overdue'
  ) {
    return 'status statusBad'
  }

  return 'status'
}

// Counts a number up to its value. Skipped for reduced-motion users, and the
// animation runs from the previously shown value so filters feel smooth.
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0)
  const shownRef = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shownRef.current = value
      const frame = requestAnimationFrame(() => setShown(value))
      return () => cancelAnimationFrame(frame)
    }

    const from = shownRef.current
    const start = performance.now()
    const duration = 700
    let frame = 0

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = Math.round(from + (value - from) * eased)
      shownRef.current = next
      setShown(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <>{shown.toLocaleString()}</>
}

export default function ClientsPage() {
  usePlanCatalog();
  const router = useRouter()

  const [clients, setClients] = useState<Client[]>([])
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [staffRoles, setStaffRoles] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(true)

  const [sortKey, setSortKey] = useState<SortKey>('install_date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkMessage, setBulkMessage] = useState('')

  const supabase = useMemo(() => createClient(), [])

  const fetchClients = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')

      try {
        // ------------------------------------------------------------
        // SUPABASE SESSION PROTECTION
        // ------------------------------------------------------------

        const {
          data: sessionData,
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        const session = sessionData.session

        if (!session) {
          router.replace('/login')
          return
        }

        setUserEmail(session.user.email || '')

        // ------------------------------------------------------------
        // LOAD THE CURRENT USER'S TENANT MEMBERSHIPS FIRST
        // ------------------------------------------------------------
        // This keeps the browser query aligned with the tenant RLS
        // policy and makes it clear which tenant IDs the current user
        // is actually allowed to access.
        const {
          data: memberships,
          error: membershipError,
        } = await supabase
          .from('tenant_users')
          .select('tenant_id, role')
          .eq('user_id', session.user.id)

        if (membershipError) {
          throw new Error(
            `Unable to load tenant access: ${membershipError.message || 'Unknown error'}`,
          )
        }

        const tenantIds = Array.from(
          new Set(
            (memberships || [])
              .map((membership) => membership.tenant_id)
              .filter((tenantId): tenantId is string => Boolean(tenantId)),
          ),
        )

        setStaffRoles((memberships || []).map((membership) => membership.role))

        if (tenantIds.length === 0) {
          // Not staff: a customer account. They use the app, not this page.
          window.location.replace('/welcome')
          return
        }

        // ------------------------------------------------------------
        // LOAD CLIENTS FOR THE USER'S TENANTS
        // ------------------------------------------------------------

        const {
          data,
          error: clientsError,
        } = await supabase
          .from('clients')
          .select('*')
          .in('tenant_id', tenantIds)

        if (clientsError) {
          const details = {
            message: clientsError.message,
            details: clientsError.details,
            hint: clientsError.hint,
            code: clientsError.code,
            status: (clientsError as { status?: number }).status,
          }

          console.error('Clients fetch error:', details)
          throw new Error(
            [
              `Supabase error${clientsError.code ? ` (${clientsError.code})` : ''}: ${clientsError.message || 'Unknown error'}`,
              clientsError.details ? `Details: ${clientsError.details}` : '',
              clientsError.hint ? `Hint: ${clientsError.hint}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          )
        }

        setClients((data as Client[]) || [])
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : (() => {
                  try {
                    return JSON.stringify(err)
                  } catch {
                    return 'Unable to load clients.'
                  }
                })()

        console.error('Clients fetch error:', errorMessage, err)
        setError(errorMessage || 'Unable to load clients.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [router, supabase],
  )

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  // ------------------------------------------------------------
  // UNIQUE FILTER OPTIONS
  // ------------------------------------------------------------

  const areas = useMemo(() => {
    const uniqueAreas = new Map<string, string>()

    for (const client of clients) {
      const displayArea = String(client.area || '')
        .trim()
        .replace(/\s+/g, ' ')

      const key = normalizeArea(displayArea)
      if (key && !uniqueAreas.has(key)) {
        uniqueAreas.set(key, displayArea)
      }
    }

    return Array.from(uniqueAreas.values()).sort((a, b) =>
      a.localeCompare(b),
    )
  }, [clients])

  const areaCustomerCounts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const client of clients) {
      const key = normalizeArea(client.area)
      if (!key) continue
      counts.set(key, (counts.get(key) || 0) + 1)
    }

    return counts
  }, [clients])

  const plans = useMemo(() => {
    return Array.from(
      new Set(
        clients
          .map((client) => client.plan_name)
          .filter(Boolean)
          .map((value) => String(value)),
      ),
    ).sort()
  }, [clients])

  const installationStatuses = useMemo(() => {
    return Array.from(
      new Set(
        clients
          .map((client) => client.installation_status)
          .filter(Boolean)
          .map((value) => String(value)),
      ),
    ).sort()
  }, [clients])

  const accountStatuses = useMemo(() => {
    return Array.from(
      new Set(
        clients
          .map((client) => client.account_status)
          .filter(Boolean)
          .map((value) => String(value)),
      ),
    ).sort()
  }, [clients])

  // ------------------------------------------------------------
  // FILTER, SORT, & WHATEVER
  // ------------------------------------------------------------

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const searchableText = [
        client.customer_name,
        client.account_id,
        client.mobile_number,
        client.pppoe_name,
        client.area,
        client.technicians,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const area = normalizeArea(client.area)
      const plan = String(client.plan_name || '')
      const installation = String(client.installation_status || '')
      const account = String(client.account_status || '')
      const installDate = String(client.install_date || '')

      if (
        filters.name &&
        !searchableText.includes(filters.name.toLowerCase().trim())
      ) {
        return false
      }

      if (filters.area && area !== normalizeArea(filters.area)) return false
      if (filters.plan && plan !== filters.plan) return false
      if (filters.installation && installation !== filters.installation) return false
      if (filters.account && account !== filters.account) return false
      if (filters.from && (!installDate || installDate < filters.from)) return false
      if (filters.to && (!installDate || installDate > filters.to)) return false

      return true
    })
  }, [clients, filters])

  const sortedClients = useMemo(() => {
    const result = [...filteredClients]

    result.sort((a, b) => {
      const getValue = (client: Client) => {
        if (sortKey === 'install_date') return client.install_date || ''
        return String(client[sortKey] || '').toLowerCase().trim()
      }

      const aValue = getValue(a)
      const bValue = getValue(b)

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [filteredClients, sortKey, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedClients.length / PAGE_SIZE))

  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return sortedClients.slice(start, start + PAGE_SIZE)
  }, [sortedClients, currentPage])

  const pageStart = sortedClients.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(currentPage * PAGE_SIZE, sortedClients.length)

  const activeClients = filteredClients.filter(
    (client) => String(client.account_status || '').toLowerCase() === 'active',
  ).length

  const overdueClients = filteredClients.filter(
    (client) => String(client.account_status || '').toLowerCase() === 'overdue',
  ).length

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setCurrentPage(1)
  }

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setCurrentPage(1)
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection(key === 'install_date' ? 'desc' : 'asc')
    }
    setCurrentPage(1)
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '↕'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  const allVisibleSelected =
    paginatedClients.length > 0 &&
    paginatedClients.every((client) => selectedIds.includes(client.id))

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !paginatedClients.some((client) => client.id === id)),
      )
      return
    }

    setSelectedIds((current) => [
      ...current,
      ...paginatedClients
        .map((client) => client.id)
        .filter((id) => !current.includes(id)),
    ])
  }

  const toggleClientSelection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    )
  }

  const exportClients = () => {
    const rows = selectedIds.length > 0
      ? clients.filter((client) => selectedIds.includes(client.id))
      : sortedClients

    if (rows.length === 0) return

    const headers = [
      'Customer',
      'Account ID',
      'Area',
      'Plan',
      'Install Date',
      'Installation Status',
      'Account Status',
      'Mobile Number',
      'PPPoE Name',
      'Technician',
    ]

    const csvCell = (value: string | null) =>
      `"${String(value || '').replaceAll('"', '""')}"`

    const csv = [
      headers.join(','),
      ...rows.map((client) => [
        client.customer_name,
        client.account_id,
        client.area,
        client.plan_name,
        client.install_date,
        client.installation_status,
        client.account_status,
        client.mobile_number,
        client.pppoe_name,
        client.technicians,
      ].map(csvCell).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pkc-clients-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  useEffect(() => {
    const visibleIds = new Set(clients.map((client) => client.id))
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)))
  }, [clients])

  useEffect(() => {
    if (!bulkMessage) return
    const timer = window.setTimeout(() => setBulkMessage(''), 5000)
    return () => window.clearTimeout(timer)
  }, [bulkMessage])

  // ------------------------------------------------------------
  // LOADING
  // ------------------------------------------------------------

  if (loading) {
    return (
      <main className="clientsPage">
        <div className="content" role="status" aria-label="Loading client directory" aria-busy="true">
          <div className="loadingBanner">
            <div className="loadingOrb" />
            <div>
              <div className="loadingTitle">Loading Client Directory</div>
              <div className="loadingText">Establishing secure Supabase session...</div>
            </div>
          </div>

          <div className="statsGrid">
            {[0, 1, 2, 3].map((item) => (
              <div className="statCard" key={item}>
                <span className="sk skBox" />
                <div style={{ flex: 1 }}>
                  <span className="sk skLine" style={{ width: '45%', height: 8 }} />
                  <span className="sk skLine" style={{ width: '30%', height: 22 }} />
                  <span className="sk skLine" style={{ width: '60%', height: 8 }} />
                </div>
              </div>
            ))}
          </div>

          <div className="skTable">
            {Array.from({ length: 8 }, (_, row) => (
              <div className="skTableRow" key={row} style={{ animationDelay: `${row * 60}ms` }}>
                <span className="sk skBar" style={{ width: 18, height: 18 }} />
                <span className="sk skBar" style={{ width: '70%' }} />
                <span className="sk skBar" style={{ width: '55%' }} />
                <span className="sk skBar" style={{ width: '60%' }} />
                <span className="sk skBar" style={{ width: '50%' }} />
                <span className="sk skBar" style={{ width: 64, height: 22, borderRadius: 999 }} />
              </div>
            ))}
          </div>
        </div>

        <style jsx>{styles}</style>
      </main>
    )
  }

  // ------------------------------------------------------------
  // PAGE
  // ------------------------------------------------------------

  return (
    <main className="clientsPage">
      {/* ============================================================
          TOP BAR
      ============================================================ */}

      <StaffHeader current="clients" roles={staffRoles} />
      <StaffMotion targets={['.filterPanel', '.tablePanel']} />

      {/* ============================================================
          CONTENT
      ============================================================ */}

      <section className="content">
        <div className="pageHeader">
          <div>
            <div className="eyebrow">
              <span className="liveDot" />
              PKC BIZOFT / OPERATIONS
            </div>

            <h1>Client Directory</h1>

            <p className="subtitle">
              Customer records, plans and account status.
            </p>
          </div>

          <div className="headerActions">
            <button
              type="button"
              className="refreshButton"
              onClick={() => fetchClients(true)}
              disabled={refreshing}
            >
              <span
                className={refreshing ? 'spin' : ''}
              >
                ↻
              </span>

              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* ==========================================================
            STAT CARDS
        ========================================================== */}

        <div className="statsGrid">
          <div className="statCard">
            <div className="statIcon">👥</div>
            <div>
              <div className="statLabel">CLIENTS</div>
              <div className="statValue"><CountUp value={filteredClients.length} /></div>
              <div className="statHint">{clients.length} total records</div>
            </div>
          </div>

          <div className="statCard">
            <div className="statIcon">✓</div>
            <div>
              <div className="statLabel">ACTIVE</div>
              <div className="statValue"><CountUp value={activeClients} /></div>
              <div className="statHint">Currently active</div>
            </div>
          </div>

          <div className="statCard">
            <div className="statIcon">!</div>
            <div>
              <div className="statLabel">OVERDUE</div>
              <div className="statValue"><CountUp value={overdueClients} /></div>
              <div className="statHint">Needs attention</div>
            </div>
          </div>
        </div>

        {/* ==========================================================
            FILTER BAR
        ========================================================== */}

        <section className="filterPanel">
          <div className="filterHeader">
            <div>
              <div className="filterTitle">
                🔎 Client Filters
              </div>

              <div className="filterSubtext">
                Search and narrow customer records
              </div>
            </div>

            <div className="filterHeaderActions">
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  className="clearButton"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              )}

              <button
                type="button"
                className="collapseButton"
                onClick={() =>
                  setShowFilters((value) => !value)
                }
              >
                {showFilters ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="filtersGrid">
              {/* CUSTOMER NAME */}

              <label className="field fieldWide">
                <span className="fieldLabel">
                  🔎 Customer name
                </span>

                <input
                  type="text"
                  value={filters.name}
                  onChange={(event) =>
                    updateFilter(
                      'name',
                      event.target.value,
                    )
                  }
                  placeholder="Search name, account ID, mobile, PPPoE, area..."
                />
              </label>

              {/* AREA */}

              <label className="field">
                <span className="fieldLabel">
                  📍 Area
                </span>

                <select
                  value={filters.area}
                  onChange={(event) =>
                    updateFilter(
                      'area',
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    All areas
                  </option>

                  {areas.map((area) => (
                    <option
                      key={area}
                      value={area}
                    >
                      {area}
                      {areaCustomerCounts.get(normalizeArea(area))
                        ? ` (${areaCustomerCounts.get(normalizeArea(area))})`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>

              {/* PLAN */}

              <label className="field">
                <span className="fieldLabel">
                  📡 Plan
                </span>

                <select
                  value={filters.plan}
                  onChange={(event) =>
                    updateFilter(
                      'plan',
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    All plans
                  </option>

                  {plans.map((plan) => (
                    <option
                      key={plan}
                      value={plan}
                    >
                      {planLabel(plan)}
                    </option>
                  ))}
                </select>
              </label>

              {/* INSTALLATION */}

              <label className="field">
                <span className="fieldLabel">
                  🟢 Installation status
                </span>

                <select
                  value={filters.installation}
                  onChange={(event) =>
                    updateFilter(
                      'installation',
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    All statuses
                  </option>

                  {installationStatuses.map(
                    (status) => (
                      <option
                        key={status}
                        value={status}
                      >
                        {status}
                      </option>
                    ),
                  )}
                </select>
              </label>

              {/* ACCOUNT */}

              <label className="field">
                <span className="fieldLabel">
                  💰 Account status
                </span>

                <select
                  value={filters.account}
                  onChange={(event) =>
                    updateFilter(
                      'account',
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    All statuses
                  </option>

                  {accountStatuses.map(
                    (status) => (
                      <option
                        key={status}
                        value={status}
                      >
                        {status}
                      </option>
                    ),
                  )}
                </select>
              </label>

              {/* DATE FROM */}

              <label className="field">
                <span className="fieldLabel">
                  📅 Install date from
                </span>

                <input
                  type="date"
                  value={filters.from}
                  onChange={(event) =>
                    updateFilter(
                      'from',
                      event.target.value,
                    )
                  }
                />
              </label>

              {/* DATE TO */}

              <label className="field">
                <span className="fieldLabel">
                  📅 Install date to
                </span>

                <input
                  type="date"
                  value={filters.to}
                  onChange={(event) =>
                    updateFilter(
                      'to',
                      event.target.value,
                    )
                  }
                />
              </label>
            </div>
          )}
        </section>

        {/* ==========================================================
            ERROR
        ========================================================== */}

        {error && (
          <div className="errorBox" role="alert">
            <div className="errorIcon">!</div>

            <div>
              <strong>
                Unable to load clients
              </strong>

              <p>{error}</p>
            </div>

            <button
              type="button"
              onClick={() => fetchClients()}
            >
              Retry
            </button>
          </div>
        )}

        {(selectedIds.length > 0 || bulkMessage) && (
          <section className="bulkPanel">
            <div>
              <strong>{selectedIds.length} selected</strong>
              <span>Select clients from the table to export them. Account status updates automatically from installation and billing.</span>
            </div>
            <div className="bulkActions">
              <button
                type="button"
                className="bulkExportButton"
                onClick={exportClients}
              >
                Export selected
              </button>
              <button
                type="button"
                className="bulkClearButton"
                onClick={() => setSelectedIds([])}
              >
                Clear
              </button>
            </div>
            {bulkMessage && <div className="bulkMessage">{bulkMessage}</div>}
          </section>
        )}

        {/* ==========================================================
            TABLE
        ========================================================== */}

        <section className="tablePanel">
          <div className="tableHeader">
            <div>
              <div className="tableTitle">
                Customer Records
              </div>

              <div className="tableSubtitle">
                Showing <strong>{pageStart}–{pageEnd}</strong> of <strong>{sortedClients.length}</strong> matching clients
                {selectedIds.length > 0 && <> · <strong>{selectedIds.length}</strong> selected</>}
              </div>
            </div>

            <div className="tableHeaderActions">
              <button type="button" className="exportButton" onClick={exportClients}>
                Export CSV{selectedIds.length > 0 ? ' selected' : ''}
              </button>
              <div className="connectionStatus">
                <span className="connectionDot" />
                Supabase connected
              </div>
            </div>
          </div>

          {filteredClients.length === 0 ? (
            <div className="emptyState">
              <div className="emptyIcon">
                ◌
              </div>

              <h3>
                No clients found
              </h3>

              <p>
                No customer records match the
                current filters.
              </p>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="emptyButton"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th className="checkColumn">
                      <input type="checkbox" aria-label="Select visible clients" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                    </th>
                    <th><button className="sortButton" onClick={() => toggleSort('customer_name')}>Customer {sortIndicator('customer_name')}</button></th>
                    <th><button className="sortButton" onClick={() => toggleSort('area')}>Area {sortIndicator('area')}</button></th>
                    <th><button className="sortButton" onClick={() => toggleSort('plan_name')}>Plan {sortIndicator('plan_name')}</button></th>
                    <th><button className="sortButton" onClick={() => toggleSort('install_date')}>Install date {sortIndicator('install_date')}</button></th>
                    <th><button className="sortButton" onClick={() => toggleSort('installation_status')}>Installation {sortIndicator('installation_status')}</button></th>
                    <th><button className="sortButton" onClick={() => toggleSort('account_status')}>Account {sortIndicator('account_status')}</button></th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {paginatedClients.map(
                    (client) => (
                      <tr key={client.id} className={selectedIds.includes(client.id) ? 'rowSelected' : ''}>
                        <td className="checkColumn">
                          <input
                            type="checkbox"
                            aria-label={`Select ${client.customer_name || 'client'}`}
                            checked={selectedIds.includes(client.id)}
                            onChange={() => toggleClientSelection(client.id)}
                          />
                        </td>
                        {/* CUSTOMER */}

                        <td>
                          <div className="customerName">
                            {client.customer_name ||
                              'Unnamed client'}
                          </div>

                          <div className="customerMeta">
                            {client.account_id ||
                              client.id.slice(
                                0,
                                8,
                              )}
                          </div>
                        </td>

                        {/* AREA */}

                        <td>
                          <span className="normalText">
                            {client.area || '—'}
                          </span>
                        </td>

                        {/* PLAN */}

                        <td>
                          <span className="planBadge">
                            {planLabel(client.plan_name) ||
                              '—'}
                          </span>
                        </td>

                        {/* DATE */}

                        <td>
                          <span className="normalText">
                            {formatDate(
                              client.install_date,
                            )}
                          </span>
                        </td>

                        {/* INSTALLATION */}

                        <td>
                          <span
                            className={statusClass(
                              client.installation_status,
                            )}
                          >
                            <span className="statusDot" />

                            {client.installation_status ||
                              'Not set'}
                          </span>
                        </td>

                        {/* ACCOUNT */}

                        <td>
                          <span
                            className={statusClass(
                              client.account_status,
                            )}
                          >
                            <span className="statusDot" />

                            {client.account_status ||
                              'Not set'}
                          </span>
                        </td>

                        {/* VIEW */}

                        <td className="actionCell">
                          <Link
                            href={`/clients/${client.id}`}
                            className="viewButton"
                          >
                            <span>👁️</span>
                            View
                          </Link>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}

          {sortedClients.length > 0 && (
            <div className="paginationBar">
              <span className="paginationText">Page {currentPage} of {totalPages}</span>
              <div className="paginationButtons">
                <button type="button" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>First</button>
                <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>Previous</button>
                <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>Next</button>
                <button type="button" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>Last</button>
              </div>
            </div>
          )}
        </section>

        {/* ==========================================================
            FOOTER
        ========================================================== */}

        <footer className="footer">
          <div>
            <span className="footerOnline">
              <span className="footerDot" />
              Supabase session connected
            </span>

            <span className="footerDivider">
              /
            </span>

            <span>
              {userEmail || 'Authenticated user'}
            </span>
          </div>

          <div>
            PKC BIZOFT Client Operations
          </div>
        </footer>
      </section>

      <style jsx>{styles}</style>
    </main>
  )
}

const styles = `
  .clientsPage {
    min-height: 100vh;
    background: #05090d;
    color: #eef7ff;
    font-family:
      var(--font-geist-sans),
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
    min-height: 100vh;
  }

  .clientsPage::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.16;
    background-image:
      linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: linear-gradient(to bottom, black, transparent 70%);
  }

  .topBar {
    height: 76px;
    padding: 0 34px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    background: rgba(5, 9, 13, 0.94);
    backdrop-filter: blur(14px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 20;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 13px;
    color: #fff;
    text-decoration: none;
  }

  .brandLogo {
    width: 38px;
    height: 38px;
    object-fit: contain;
    display: block;
    flex: 0 0 auto;
  }

  .brandText {
    font-size: 19px;
    font-weight: 400;
    letter-spacing: -0.03em;
  }

  .brandText strong {
    color: #1599ff;
    font-weight: 800;
  }

  .topActions {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .topNav {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: 11px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
  }

  .topNavLink {
    padding: 8px 16px;
    border-radius: 8px;
    color: #9bb0c0;
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    transition: 0.2s ease;
  }

  .topNavLink:hover {
    color: white;
    background: rgba(255,255,255,0.04);
  }

  .topNavLink.active {
    color: #eef7ff;
    background: rgba(21,153,255,0.14);
    box-shadow: inset 0 0 0 1px rgba(21,153,255,0.3);
  }

  .sessionPill {
    border: 1px solid rgba(48, 224, 139, 0.2);
    background: rgba(48, 224, 139, 0.06);
    color: #76eeb0;
    padding: 8px 12px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .sessionDot,
  .connectionDot,
  .footerDot,
  .liveDot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #38e08b;
    box-shadow: 0 0 12px rgba(56,224,139,0.8);
  }

  .content {
    width: min(1440px, calc(100% - 48px));
    margin: 0 auto;
    padding: 44px 0 36px;
    position: relative;
    z-index: 1;
  }

  .pageHeader {
    display: flex;
    justify-content: space-between;
    gap: 30px;
    align-items: flex-end;
    margin-bottom: 32px;
  }

  .eyebrow {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #1599ff;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.16em;
    margin-bottom: 12px;
  }

  h1 {
    margin: 0;
    font-size: clamp(38px, 5vw, 64px);
    line-height: 0.98;
    letter-spacing: -0.055em;
    font-weight: 750;
  }

  .subtitle {
    margin: 15px 0 0;
    color: #8ca1b1;
    font-size: 15px;
    max-width: 650px;
  }

  .headerActions {
    flex-shrink: 0;
  }

  button {
    font: inherit;
  }

  .refreshButton {
    height: 44px;
    padding: 0 17px;
    border-radius: 11px;
    border: 1px solid rgba(21,153,255,0.3);
    background: rgba(21,153,255,0.09);
    color: #8bcaff;
    cursor: pointer;
    font-size: 13px;
    font-weight: 750;
    display: flex;
    align-items: center;
    gap: 9px;
    transition: 0.2s ease;
  }

  .refreshButton:hover:not(:disabled) {
    background: rgba(21,153,255,0.15);
    border-color: rgba(21,153,255,0.55);
  }

  .refreshButton:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .spin {
    display: inline-block;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .statsGrid {
    display: grid;
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
    gap: 13px;
    margin-bottom: 15px;
  }

  .statCard {
    border: 1px solid rgba(255,255,255,0.075);
    background: #0a1015;
    border-radius: 12px;
    padding: 19px;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .statIcon {
    width: 43px;
    height: 43px;
    border-radius: 12px;
    background: rgba(21,153,255,0.09);
    border: 1px solid rgba(21,153,255,0.13);
    display: grid;
    place-items: center;
    font-size: 18px;
  }

  .statLabel {
    font-size: 9px;
    letter-spacing: 0.14em;
    font-weight: 900;
    color: #6f8493;
  }

  .statValue {
    margin-top: 4px;
    font-size: 25px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .filterPanel,
  .tablePanel {
    border: 1px solid rgba(255,255,255,0.075);
    background:
      linear-gradient(
        145deg,
        rgba(255,255,255,0.045),
        rgba(255,255,255,0.015)
      );
    border-radius: 12px;
    overflow: hidden;
  }

  .filterPanel {
    margin-bottom: 15px;
  }

  .filterHeader {
    padding: 18px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .filterTitle {
    font-size: 14px;
    font-weight: 800;
  }

  .filterSubtext {
    margin-top: 4px;
    font-size: 11px;
    color: #6e8494;
  }

  .filterHeaderActions {
    display: flex;
    gap: 8px;
  }

  .clearButton,
  .collapseButton {
    border: 1px solid rgba(255,255,255,0.09);
    background: rgba(255,255,255,0.035);
    color: #8ca1b1;
    padding: 8px 11px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 11px;
  }

  .clearButton:hover,
  .collapseButton:hover {
    color: white;
    border-color: rgba(255,255,255,0.18);
  }

  .filtersGrid {
    padding: 19px;
    display: grid;
    grid-template-columns:
      repeat(4, minmax(0, 1fr));
    gap: 13px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .fieldWide {
    grid-column: span 2;
  }

  .fieldLabel {
    color: #8096a6;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.05em;
  }

  input,
  select {
    width: 100%;
    height: 42px;
    box-sizing: border-box;
    border: 1px solid rgba(255,255,255,0.09);
    background: rgba(0,0,0,0.22);
    color: #eaf5ff;
    border-radius: 9px;
    padding: 0 12px;
    outline: none;
    font-size: 12px;
  }

  input::placeholder {
    color: #6b7d8a;
  }

  input:focus,
  select:focus {
    border-color: rgba(21,153,255,0.6);
    box-shadow:
      0 0 0 3px rgba(21,153,255,0.08);
  }

  select option {
    background: #071117;
    color: white;
  }

  .statHint {
    margin-top: 4px;
    color: #718593;
    font-size: 9px;
  }

  .tableHeaderActions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .exportButton,
  .bulkExportButton,
  .bulkApplyButton,
  .bulkClearButton {
    border: 1px solid rgba(21,153,255,0.2);
    background: rgba(21,153,255,0.07);
    color: #8bcaff;
    padding: 8px 11px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 750;
  }

  .exportButton:hover,
  .bulkExportButton:hover,
  .bulkApplyButton:hover:not(:disabled),
  .bulkClearButton:hover {
    background: rgba(21,153,255,0.13);
    border-color: rgba(21,153,255,0.4);
  }

  .bulkPanel {
    position: relative;
    margin-bottom: 15px;
    padding: 14px 16px;
    border: 1px solid rgba(21,153,255,0.18);
    background: rgba(21,153,255,0.045);
    border-radius: 11px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    flex-wrap: wrap;
  }

  .bulkPanel strong {
    display: block;
    font-size: 12px;
  }

  .bulkPanel span {
    display: block;
    margin-top: 3px;
    color: #708593;
    font-size: 10px;
  }

  .bulkActions {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .bulkActions select {
    width: auto;
    min-width: 170px;
  }

  .bulkApplyButton:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .bulkMessage {
    flex-basis: 100%;
    color: #78c5ff;
    font-size: 10px;
  }

  .checkColumn {
    width: 42px;
    text-align: center !important;
    padding-left: 12px !important;
    padding-right: 8px !important;
  }

  .checkColumn input {
    width: 15px;
    height: 15px;
    margin: 0;
    accent-color: #1599ff;
  }

  .sortButton {
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    cursor: pointer;
  }

  .sortButton:hover {
    color: #9fd4ff;
  }

  .rowSelected {
    background: rgba(21,153,255,0.06);
  }

  .paginationBar {
    padding: 14px 18px;
    border-top: 1px solid rgba(255,255,255,0.06);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .paginationText {
    color: #708593;
    font-size: 10px;
  }

  .paginationButtons {
    display: flex;
    gap: 6px;
  }

  .paginationButtons button {
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.035);
    color: #8ca1b1;
    padding: 7px 9px;
    border-radius: 7px;
    cursor: pointer;
    font-size: 10px;
  }

  .paginationButtons button:hover:not(:disabled) {
    color: white;
    border-color: rgba(21,153,255,0.35);
  }

  .paginationButtons button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .errorBox {
    margin-bottom: 15px;
    padding: 16px;
    border: 1px solid rgba(255,75,94,0.25);
    background: rgba(255,75,94,0.06);
    border-radius: 11px;
    display: flex;
    align-items: center;
    gap: 13px;
  }

  .errorIcon {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(255,75,94,0.12);
    color: #ff7888;
    font-weight: 900;
  }

  .errorBox strong {
    font-size: 13px;
  }

  .errorBox p {
    margin: 3px 0 0;
    color: #a37a81;
    font-size: 11px;
  }

  .errorBox button {
    margin-left: auto;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: white;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
  }

  .tableHeader {
    min-height: 72px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .tableTitle {
    font-size: 14px;
    font-weight: 850;
  }

  .tableSubtitle {
    margin-top: 4px;
    color: #6e8493;
    font-size: 11px;
  }

  .tableSubtitle strong {
    color: #a7bac8;
  }

  .connectionStatus {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #6f899a;
    font-size: 10px;
    white-space: nowrap;
  }

  .tableWrap {
    width: 100%;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 950px;
  }

  th {
    text-align: left;
    padding: 13px 20px;
    color: #718593;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    white-space: nowrap;
  }

  td {
    padding: 17px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.045);
    vertical-align: middle;
  }

  tbody tr {
    transition: background 0.15s ease;
  }

  tbody tr:hover {
    background: rgba(21,153,255,0.035);
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  .customerName {
    font-size: 13px;
    font-weight: 750;
    color: #f0f7fc;
  }

  .customerMeta {
    margin-top: 5px;
    color: #728591;
    font-size: 9px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .normalText {
    color: #a0b1bd;
    font-size: 12px;
  }

  .planBadge {
    display: inline-flex;
    padding: 6px 8px;
    border-radius: 7px;
    background: rgba(21,153,255,0.07);
    border: 1px solid rgba(21,153,255,0.11);
    color: #79bff0;
    font-size: 10px;
    font-weight: 800;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 9px;
    border-radius: 999px;
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.06);
    color: #8398a7;
    font-size: 10px;
    font-weight: 750;
    white-space: nowrap;
  }

  .statusGood {
    color: #6ee9a8;
    background: rgba(56,224,139,0.06);
    border-color: rgba(56,224,139,0.13);
  }

  .statusWarn {
    color: #f0c86d;
    background: rgba(240,200,109,0.06);
    border-color: rgba(240,200,109,0.13);
  }

  .statusBad {
    color: #ff7888;
    background: rgba(255,75,94,0.06);
    border-color: rgba(255,75,94,0.13);
  }

  .statusDot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  .actionCell {
    text-align: right;
  }

  .viewButton {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    text-decoration: none;
    color: #78c5ff;
    border: 1px solid rgba(21,153,255,0.15);
    background: rgba(21,153,255,0.05);
    padding: 8px 11px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 800;
    transition: 0.18s ease;
  }

  .viewButton:hover {
    color: white;
    background: rgba(21,153,255,0.12);
    border-color: rgba(21,153,255,0.35);
    transform: translateY(-1px);
  }

  .emptyState {
    padding: 70px 20px;
    text-align: center;
  }

  .emptyIcon {
    width: 54px;
    height: 54px;
    margin: 0 auto 14px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #547083;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.025);
    font-size: 25px;
  }

  .emptyState h3 {
    margin: 0;
    font-size: 17px;
  }

  .emptyState p {
    margin: 7px 0 18px;
    color: #667c8c;
    font-size: 12px;
  }

  .emptyButton {
    border: 1px solid rgba(21,153,255,0.2);
    background: rgba(21,153,255,0.07);
    color: #7fc8ff;
    border-radius: 8px;
    padding: 9px 13px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 750;
  }

  .footer {
    margin-top: 17px;
    padding: 15px 2px 0;
    display: flex;
    justify-content: space-between;
    gap: 20px;
    color: #73848f;
    font-size: 10px;
  }

  .footerOnline {
    color: #5f9880;
  }

  .footerDot {
    display: inline-block;
    margin-right: 7px;
    width: 5px;
    height: 5px;
  }

  .footerDivider {
    margin: 0 8px;
    color: #263b47;
  }

  .loadingScreen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 17px;
  }

  .loadingOrb {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 2px solid rgba(21,153,255,0.15);
    border-top-color: #1599ff;
    animation: spin 0.8s linear infinite;
  }

  .loadingTitle {
    font-weight: 800;
    font-size: 14px;
  }

  .loadingText {
    margin-top: 5px;
    color: #708693;
    font-size: 11px;
  }

  @media (max-width: 1050px) {
    .statsGrid {
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
    }

    .filtersGrid {
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
    }

    .fieldWide {
      grid-column: span 2;
    }
  }

  @media (max-width: 900px) {
    .topBar {
      padding: 0 18px;
      height: 70px;
    }

    .topNav {
      display: none;
    }

    .sessionPill {
      padding: 7px 9px;
      font-size: 9px;
    }

    .content {
      width: min(
        100% - 28px,
        1440px
      );
      padding-top: 35px;
    }

    .pageHeader {
      align-items: flex-start;
      flex-direction: column;
    }

    h1 {
      font-size: 42px;
    }

    .headerActions,
    .refreshButton {
      width: 100%;
    }

    .refreshButton {
      justify-content: center;
    }

    .statsGrid {
      grid-template-columns: 1fr 1fr;
    }

    .statCard {
      padding: 14px;
    }

    .statIcon {
      width: 36px;
      height: 36px;
      font-size: 15px;
    }

    .filtersGrid {
      grid-template-columns: 1fr;
    }

    .fieldWide {
      grid-column: span 1;
    }

    .filterHeader {
      align-items: flex-start;
    }

    .filterHeaderActions {
      flex-direction: column;
    }

    .tableHeader {
      align-items: flex-start;
      flex-direction: column;
      padding: 17px 18px;
    }

    .tableHeaderActions {
      width: 100%;
      flex-direction: column;
      align-items: stretch;
    }

    .exportButton {
      width: 100%;
    }

    .paginationBar {
      align-items: flex-start;
      flex-direction: column;
    }

    .paginationButtons {
      width: 100%;
    }

    .paginationButtons button {
      flex: 1;
    }

    .bulkActions {
      width: 100%;
    }

    .bulkActions select,
    .bulkActions button {
      flex: 1;
    }

    .footer {
      flex-direction: column;
      padding-bottom: 20px;
    }
  }


  /* ---- loading skeleton ---- */
  .loadingBanner {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 6px 0 20px;
    padding: 4px 2px;
  }

  .sk {
    position: relative;
    display: block;
    overflow: hidden;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
  }

  .sk::after {
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, rgba(21,153,255,0.16), transparent);
    animation: skSweep 1.6s ease-in-out infinite;
  }

  .skBox { width: 43px; height: 43px; border-radius: 12px; flex: none; }
  .skLine { height: 11px; margin: 7px 0; }
  .skBar { height: 12px; }

  .skTable {
    border: 1px solid rgba(255,255,255,0.075);
    background: #0a1015;
    border-radius: 12px;
    overflow: hidden;
  }

  .skTableRow {
    display: grid;
    grid-template-columns: 40px 1.6fr 1fr 1fr 1fr 90px;
    gap: 18px;
    align-items: center;
    padding: 18px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.045);
    animation: rowIn 0.5s ease both;
  }

  .skTableRow:last-child { border-bottom: 0; }

  @keyframes skSweep {
    to { transform: translateX(100%); }
  }

  /* ---- entrance + hover choreography for the loaded list ---- */
  .statCard {
    animation: rowIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  }

  .statCard:nth-child(1) { animation-delay: 0.04s; }
  .statCard:nth-child(2) { animation-delay: 0.1s; }
  .statCard:nth-child(3) { animation-delay: 0.16s; }
  .statCard:nth-child(4) { animation-delay: 0.22s; }

  .statCard:hover {
    transform: translateY(-4px);
    border-color: rgba(21,153,255,0.4);
    box-shadow: 0 16px 40px rgba(0,0,0,0.3), 0 0 30px rgba(21,153,255,0.08);
  }

  .statIcon {
    transition: transform 0.3s ease, background 0.3s ease;
  }

  .statCard:hover .statIcon {
    transform: scale(1.1) rotate(-4deg);
    background: rgba(21,153,255,0.16);
  }

  tbody tr {
    animation: rowIn 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  tbody tr:nth-child(1) { animation-delay: 0.02s; }
  tbody tr:nth-child(2) { animation-delay: 0.05s; }
  tbody tr:nth-child(3) { animation-delay: 0.08s; }
  tbody tr:nth-child(4) { animation-delay: 0.11s; }
  tbody tr:nth-child(5) { animation-delay: 0.14s; }
  tbody tr:nth-child(6) { animation-delay: 0.17s; }
  tbody tr:nth-child(7) { animation-delay: 0.2s; }
  tbody tr:nth-child(8) { animation-delay: 0.23s; }
  tbody tr:nth-child(n + 9) { animation-delay: 0.26s; }

  @keyframes rowIn {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  /* ---- readability + tablet/phone layouts ---- */
  th { font-size: 10px; }
  .customerMeta { font-size: 11px; }
  .normalText { font-size: 13px; }
  .planBadge { font-size: 11px; }

  @media (max-width: 1100px) {
    table { min-width: 820px; }
  }

  /* Phones and small tablets: each client becomes a card instead of a clipped table row. */
  @media (max-width: 1024px) {
    table { min-width: 0; }
    thead { display: none; }
    tbody, tbody tr, tbody td { display: block; }

    tbody tr {
      position: relative;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 14px;
      margin: 0 12px 12px;
      padding: 16px;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px;
      background: rgba(255,255,255,0.02);
    }

    tbody tr:hover { background: rgba(21,153,255,0.05); }

    tbody td {
      padding: 0;
      border-bottom: 0 !important;
      min-width: 0;
    }

    tbody td.checkColumn {
      position: absolute;
      top: 14px;
      right: 14px;
      width: auto;
    }

    tbody td:nth-child(2) { grid-column: 1 / -1; padding-right: 34px; }
    tbody td:nth-child(3) { grid-column: 1 / -1; }

    tbody td:nth-child(n + 3):nth-child(-n + 7)::before {
      display: block;
      margin-bottom: 5px;
      color: #718593;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    tbody td:nth-child(3)::before { content: 'Area'; }
    tbody td:nth-child(4)::before { content: 'Plan'; }
    tbody td:nth-child(5)::before { content: 'Install date'; }
    tbody td:nth-child(6)::before { content: 'Installation'; }
    tbody td:nth-child(7)::before { content: 'Account'; }

    tbody td.actionCell {
      grid-column: 1 / -1;
      text-align: stretch;
    }

    tbody td.actionCell :global(a),
    tbody td.actionCell .viewButton {
      display: flex;
      width: 100%;
      justify-content: center;
      padding-top: 11px;
      padding-bottom: 11px;
    }
  }
`