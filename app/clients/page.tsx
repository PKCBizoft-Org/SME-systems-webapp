'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'

// Official PKC BIZOFT logo used on the login page.
const PKC_LOGO = "data:image/webp;base64,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"

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

const DEFAULT_FILTERS: Filters = {
  name: '',
  area: '',
  plan: '',
  installation: '',
  account: '',
  from: '',
  to: '',
}

function formatDate(date: string | null) {
  if (!date) return '—'

  const parsed = new Date(`${date}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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
    value === 'overdue'
  ) {
    return 'status statusBad'
  }

  return 'status'
}

export default function ClientsPage() {
  const router = useRouter()

  const [clients, setClients] = useState<Client[]>([])
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [showFilters, setShowFilters] = useState(true)

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
        // LOAD CLIENTS
        // ------------------------------------------------------------

        const {
          data,
          error: clientsError,
        } = await supabase
          .from('clients')
          .select(
            `
              id,
              tenant_id,
              customer_name,
              install_date,
              plan_name,
              area,
              installation_status,
              account_status,
              account_id,
              mobile_number,
              pppoe_name,
              map_location,
              technicians
            `,
          )
          .order('install_date', {
            ascending: false,
            nullsFirst: false,
          })

        if (clientsError) {
          throw clientsError
        }

        setClients((data as Client[]) || [])
      } catch (err) {
        console.error('Clients fetch error:', err)

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load clients.',
        )
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
    return Array.from(
      new Set(
        clients
          .map((client) => client.area)
          .filter(Boolean)
          .map((value) => String(value)),
      ),
    ).sort()
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
  // FILTER CLIENTS
  // ------------------------------------------------------------

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const customerName = String(
        client.customer_name || '',
      )

      const area = String(client.area || '')
      const plan = String(client.plan_name || '')
      const installation = String(
        client.installation_status || '',
      )
      const account = String(
        client.account_status || '',
      )

      const installDate = String(
        client.install_date || '',
      )

      // Customer-name search
      if (
        filters.name &&
        !customerName
          .toLowerCase()
          .includes(filters.name.toLowerCase())
      ) {
        return false
      }

      // Area filter
      if (
        filters.area &&
        area !== filters.area
      ) {
        return false
      }

      // Plan filter
      if (
        filters.plan &&
        plan !== filters.plan
      ) {
        return false
      }

      // Installation status
      if (
        filters.installation &&
        installation !== filters.installation
      ) {
        return false
      }

      // Account status
      if (
        filters.account &&
        account !== filters.account
      ) {
        return false
      }

      // Install date FROM
      if (
        filters.from &&
        installDate < filters.from
      ) {
        return false
      }

      // Install date TO
      if (
        filters.to &&
        installDate > filters.to
      ) {
        return false
      }

      return true
    })
  }, [clients, filters])

  const updateFilter = (
    key: keyof Filters,
    value: string,
  ) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS)
  }

  const activeFilterCount = Object.values(filters).filter(
    Boolean,
  ).length

  // ------------------------------------------------------------
  // LOADING
  // ------------------------------------------------------------

  if (loading) {
    return (
      <main className="clientsPage">
        <div className="loadingScreen">
          <div className="loadingOrb" />
          <div>
            <div className="loadingTitle">
              Loading Client Directory
            </div>
            <div className="loadingText">
              Establishing secure Supabase session...
            </div>
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

      <header className="topBar">
        <Link
          href="/"
          className="brand"
          aria-label="PKC BIZOFT home"
        >
          <img className="brandLogo" src={PKC_LOGO} alt="PKC BIZOFT" />

          <div className="brandText">
            <span>PKC</span>{' '}
            <strong>BIZOFT</strong>
          </div>
        </Link>

        <div className="topActions">
          <Link
            href="/"
            className="homeLink"
          >
            Home
          </Link>

          <div className="sessionPill">
            <span className="sessionDot" />
            <span>SECURE SESSION</span>
          </div>
        </div>
      </header>

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
              Manage customer records, installation details,
              plans, and account status.
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
              <div className="statLabel">
                CLIENTS
              </div>

              <div className="statValue">
                {filteredClients.length}
              </div>
            </div>
          </div>

          <div className="statCard">
            <div className="statIcon">📡</div>

            <div>
              <div className="statLabel">
                PLANS
              </div>

              <div className="statValue">
                {plans.length}
              </div>
            </div>
          </div>

          <div className="statCard">
            <div className="statIcon">📍</div>

            <div>
              <div className="statLabel">
                AREAS
              </div>

              <div className="statValue">
                {areas.length}
              </div>
            </div>
          </div>

          <div className="statCard">
            <div className="statIcon">✓</div>

            <div>
              <div className="statLabel">
                FILTERED
              </div>

              <div className="statValue">
                {activeFilterCount}
              </div>
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
                  placeholder="Search customer..."
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
                      {plan}
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
          <div className="errorBox">
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
                Showing{' '}
                <strong>
                  {filteredClients.length}
                </strong>{' '}
                of{' '}
                <strong>
                  {clients.length}
                </strong>{' '}
                clients
              </div>
            </div>

            <div className="connectionStatus">
              <span className="connectionDot" />
              Supabase connected
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
                    <th>Customer</th>
                    <th>Area</th>
                    <th>Plan</th>
                    <th>Install date</th>
                    <th>Installation</th>
                    <th>Account</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {filteredClients.map(
                    (client) => (
                      <tr key={client.id}>
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
                            {client.plan_name ||
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
      Inter,
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

  .homeLink {
    color: #9bb0c0;
    text-decoration: none;
    font-size: 14px;
  }

  .homeLink:hover {
    color: white;
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
      repeat(4, minmax(0, 1fr));
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
    color: #62798a;
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
    color: #657c8d;
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
    color: #4f6474;
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
    color: #61798a;
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
    color: #526a7b;
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
    color: #536a79;
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
    color: #607787;
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
    color: #425968;
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
    color: #607887;
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

  @media (max-width: 700px) {
    .topBar {
      padding: 0 18px;
      height: 70px;
    }

    .homeLink {
      display: none;
    }

    .sessionPill {
      padding: 7px 9px;
      font-size: 8px;
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

    .footer {
      flex-direction: column;
      padding-bottom: 20px;
    }
  }
`