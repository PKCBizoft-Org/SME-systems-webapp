'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'
import { StaffHeader } from '../components/StaffHeader'
import { StaffMotion } from '../components/StaffMotion'
import styles from './inventory.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Category = 'cable' | 'connector' | 'network_device' | 'tool' | 'accessory' | 'other'
type Unit = 'pc' | 'm' | 'roll' | 'box' | 'set' | 'pack'
type MovementType = 'stock_in' | 'installation_use' | 'return' | 'stock_out' | 'adjustment'

type Item = {
  id: string
  tenant_id: string
  sku: string | null
  name: string
  category: Category
  unit: Unit
  quantity_on_hand: number
  reorder_level: number
  unit_cost: number | null
  location: string | null
  notes: string | null
  is_active: boolean
}

type Movement = {
  id: string
  item_id: string
  movement_type: MovementType
  quantity_change: number
  client_id: string | null
  reference: string | null
  notes: string | null
  created_by_email: string | null
  created_by_name: string | null
  job_type: JobType | null
  install_location: string | null
  created_at: string
}

type JobType = 'new_installation' | 'repair' | 'replacement' | 'upgrade' | 'other'

type Kit = {
  id: string
  name: string
  job_type: JobType
  description: string | null
  is_active: boolean
  inventory_kit_items: { id: string; item_id: string; quantity: number }[]
}

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'new_installation', label: 'New installation' },
  { value: 'repair', label: 'Repair' },
  { value: 'replacement', label: 'Replacement' },
  { value: 'upgrade', label: 'Upgrade' },
  { value: 'other', label: 'Other' },
]
const jobLabel = (v: string | null) => JOB_TYPES.find((j) => j.value === v)?.label ?? ''

type ClientRow = {
  id: string
  customer_name: string | null
  tenant_id: string | null
}

type Modal =
  | { kind: 'item'; item: Item | null }
  | { kind: 'move'; item: Item | null; type: MovementType }
  | { kind: 'kits' }
  | null

const CATEGORIES: { value: Category; label: string; icon: string }[] = [
  { value: 'cable', label: 'Cable & wire', icon: '🔌' },
  { value: 'connector', label: 'Connectors', icon: '🔗' },
  { value: 'network_device', label: 'Network devices', icon: '📡' },
  { value: 'tool', label: 'Tools', icon: '🛠️' },
  { value: 'accessory', label: 'Accessories', icon: '📎' },
  { value: 'other', label: 'Other', icon: '📦' },
]

const UNITS: { value: Unit; label: string }[] = [
  { value: 'pc', label: 'pieces' },
  { value: 'm', label: 'meters' },
  { value: 'roll', label: 'rolls' },
  { value: 'box', label: 'boxes' },
  { value: 'set', label: 'sets' },
  { value: 'pack', label: 'packs' },
]

const MOVEMENT_LABEL: Record<MovementType, { label: string; icon: string; tone: string }> = {
  stock_in: { label: 'Stock received', icon: '📥', tone: 'good' },
  installation_use: { label: 'Used on installation', icon: '🔧', tone: 'warn' },
  return: { label: 'Returned to stock', icon: '↩️', tone: 'good' },
  stock_out: { label: 'Stock removed', icon: '📤', tone: 'bad' },
  adjustment: { label: 'Count adjustment', icon: '⚖️', tone: 'warn' },
}

const ADMIN_MOVES: MovementType[] = ['stock_in', 'installation_use', 'return', 'stock_out', 'adjustment']
const TECH_MOVES: MovementType[] = ['installation_use', 'return']

const categoryInfo = (value: string) =>
  CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[CATEGORIES.length - 1]

const unitLabel = (value: string) => UNITS.find((u) => u.value === value)?.label ?? value

const num = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const fmtQty = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 })

const money = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })

function stockState(item: Item): { label: string; tone: 'good' | 'warn' | 'bad'; pct: number } {
  const qty = num(item.quantity_on_hand)
  const reorder = num(item.reorder_level)
  if (qty <= 0) return { label: 'Out of stock', tone: 'bad', pct: 0 }
  if (reorder > 0 && qty <= reorder) {
    return { label: 'Low stock', tone: 'warn', pct: Math.max(8, Math.min(100, (qty / (reorder * 2)) * 100)) }
  }
  const pct = reorder > 0 ? Math.min(100, (qty / (reorder * 2)) * 100) : 100
  return { label: 'In stock', tone: 'good', pct: Math.max(pct, 55) }
}

const toneVar = (tone: string) =>
  tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--good)'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// The tables come from supabase/migrations/20261006120000_inventory_system.sql.
// If it has not been run yet, say so plainly instead of showing a raw error.
function isMissingTable(message: string) {
  return /inventory_(items|movements)/.test(message) && /(does not exist|schema cache|not find)/i.test(message)
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InventoryPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [needsMigration, setNeedsMigration] = useState(false)
  const [notice, setNotice] = useState('')

  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [isTenantAdmin, setIsTenantAdmin] = useState(false)
  const [staffRoles, setStaffRoles] = useState<string[]>([])
  const [tenantId, setTenantId] = useState('')

  const [items, setItems] = useState<Item[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [kits, setKits] = useState<Kit[]>([])

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | Category>('all')
  const [lowOnly, setLowOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [modal, setModal] = useState<Modal>(null)

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true)
      else setLoading(true)
      setError('')

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          router.replace('/login')
          return
        }

        setEmail(session.user.email || '')

        const { data: memberships, error: membershipError } = await supabase
          .from('tenant_users')
          .select('tenant_id, role')
          .eq('user_id', session.user.id)

        if (membershipError) throw new Error(`Unable to load tenant access: ${membershipError.message}`)

        // Only admin and inventory staff may use this page (enforced by RLS too).
        const allowed = (memberships || []).filter((m) => m.role === 'admin' || m.role === 'inventory')
        const tenantIds = Array.from(
          new Set(allowed.map((m) => m.tenant_id).filter((id): id is string => Boolean(id))),
        )

        if (tenantIds.length === 0) {
          setError('Inventory is only available to admin and inventory staff accounts.')
          return
        }

        setIsAdmin(true)
        setIsTenantAdmin(allowed.some((m) => m.role === 'admin'))
        setStaffRoles(allowed.map((m) => m.role))
        setTenantId(allowed.find((m) => m.role === 'admin')?.tenant_id || tenantIds[0])

        const [itemsRes, movesRes, clientsRes, kitsRes] = await Promise.all([
          supabase.from('inventory_items').select('*').in('tenant_id', tenantIds).order('name'),
          supabase
            .from('inventory_movements')
            .select('*')
            .in('tenant_id', tenantIds)
            .order('created_at', { ascending: false })
            .limit(80),
          supabase
            .from('clients')
            .select('id, customer_name, tenant_id')
            .in('tenant_id', tenantIds)
            .order('customer_name'),
          supabase
            .from('inventory_kits')
            .select('id, name, job_type, description, is_active, inventory_kit_items(id, item_id, quantity)')
            .order('name'),
        ])

        const firstError = itemsRes.error || movesRes.error
        if (firstError) {
          if (isMissingTable(firstError.message)) {
            setNeedsMigration(true)
            return
          }
          throw new Error(firstError.message)
        }

        setNeedsMigration(false)
        setItems((itemsRes.data || []) as Item[])
        setMovements((movesRes.data || []) as Movement[])
        setClients((clientsRes.data || []) as ClientRow[])
        setKits((kitsRes.data || []) as Kit[])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong loading the inventory.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [router, supabase],
  )

  useEffect(() => {
    // Initial fetch on mount; load() only sets state after awaiting the network.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])

  const activeItems = useMemo(() => items.filter((item) => item.is_active), [items])

  const stats = useMemo(() => {
    let low = 0
    let out = 0
    let value = 0
    for (const item of activeItems) {
      const state = stockState(item)
      if (state.tone === 'bad') out += 1
      else if (state.tone === 'warn') low += 1
      value += num(item.quantity_on_hand) * num(item.unit_cost)
    }
    return { total: activeItems.length, low, out, value }
  }, [activeItems])

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      if (!showArchived && !item.is_active) return false
      if (showArchived && item.is_active) return false
      if (category !== 'all' && item.category !== category) return false
      if (lowOnly && stockState(item).tone === 'good') return false
      if (!term) return true
      return [item.name, item.sku, item.location].some((field) => String(field || '').toLowerCase().includes(term))
    })
  }, [items, search, category, lowOnly, showArchived])

  function exportCsv() {
    const header = ['SKU', 'Name', 'Category', 'Unit', 'On hand', 'Reorder level', 'Unit cost', 'Location']
    const rows = visibleItems.map((item) => [
      item.sku || '',
      item.name,
      categoryInfo(item.category).label,
      item.unit,
      item.quantity_on_hand,
      item.reorder_level,
      item.unit_cost ?? '',
      item.location || '',
    ])
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function setArchived(item: Item, archived: boolean) {
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ is_active: !archived })
      .eq('id', item.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setNotice(`${item.name} ${archived ? 'archived' : 'restored'}.`)
    load(true)
  }

  const allowedMoves = isAdmin ? ADMIN_MOVES : TECH_MOVES

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className={styles.page}>
      <StaffHeader current="inventory" roles={staffRoles} />
      <StaffMotion
        targets={[`.${styles.stat}`, `.${styles.panel}`, `.${styles.feedRow}`]}
        lift={[`.${styles.stat}`]}
      />

      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <div>
            <div className={styles.eyebrow}>
              <span className={styles.liveDot} />
              PKC BIZOFT / OPERATIONS
            </div>
            <h1 className={styles.title}>Inventory</h1>
            <p className={styles.subtitle}>
              Track installation materials — cable, connectors, devices and tools — from the moment they arrive to the
              customer site they are used on.
            </p>
          </div>

          <div className={styles.headerActions}>
            <button type="button" className={styles.btn} onClick={() => load(true)} disabled={refreshing || loading}>
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
            {!needsMigration && (
              <>
                <button type="button" className={styles.btn} onClick={exportCsv} disabled={visibleItems.length === 0}>
                  ⬇ Export CSV
                </button>
                <button type="button" className={styles.btn} onClick={() => setModal({ kind: 'kits' })}>
                  🧰 Recommended kits
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => setModal({ kind: 'move', item: null, type: isAdmin ? 'stock_in' : 'installation_use' })}
                  disabled={activeItems.length === 0}
                >
                  {isAdmin ? '± Record movement' : '🔧 Log materials used'}
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={() => setModal({ kind: 'item', item: null })}
                  >
                    + Add item
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {notice && (
          <div className={`${styles.banner} ${styles.bannerOk}`} role="status">
            ✓ {notice}
          </div>
        )}

        {error && (
          <div className={styles.banner} role="alert">
            ⚠ <span>{error}</span>
          </div>
        )}

        {needsMigration && (
          <div className={styles.banner} role="alert">
            ⚠
            <span>
              The inventory tables are not in the database yet. Run{' '}
              <code>supabase/migrations/20261006120000_inventory_system.sql</code> once in the Supabase SQL editor, then
              refresh this page.
            </span>
          </div>
        )}

        {!needsMigration && (
          <>
            <section className={styles.stats} aria-label="Inventory summary">
              <Stat label="Items tracked" value={loading ? '—' : String(stats.total)} hint="active items" delay={0} />
              <Stat
                label="Low stock"
                value={loading ? '—' : String(stats.low)}
                hint="at or below reorder level"
                tone="var(--warn)"
                delay={70}
              />
              <Stat
                label="Out of stock"
                value={loading ? '—' : String(stats.out)}
                hint="needs restocking"
                tone="var(--bad)"
                delay={140}
              />
              <Stat
                label="Stock value"
                value={loading ? '—' : money(stats.value)}
                hint="on hand × unit cost"
                tone="var(--good)"
                delay={210}
              />
            </section>

            <div className={styles.toolbar}>
              <div className={styles.search}>
                <input
                  className={styles.input}
                  type="search"
                  placeholder="Search name, SKU or location…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search inventory"
                />
              </div>
              <select
                className={styles.select}
                value={category}
                onChange={(event) => setCategory(event.target.value as 'all' | Category)}
                aria-label="Filter by category"
              >
                <option value="all">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`${styles.chip} ${lowOnly ? styles.chipOn : ''}`}
                onClick={() => setLowOnly((value) => !value)}
                aria-pressed={lowOnly}
              >
                ⚠ Low stock only
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className={`${styles.chip} ${showArchived ? styles.chipOn : ''}`}
                  onClick={() => setShowArchived((value) => !value)}
                  aria-pressed={showArchived}
                >
                  🗄 Archived
                </button>
              )}
            </div>

            <div className={styles.layout}>
              {/* ---------------- items ---------------- */}
              <section className={styles.panel} aria-label="Inventory items">
                <div className={styles.panelHead}>
                  <h2 className={styles.panelTitle}>{showArchived ? 'Archived items' : 'Stock on hand'}</h2>
                  <span className={styles.panelMeta}>
                    {visibleItems.length} {visibleItems.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                {loading ? (
                  <>
                    <div className={`${styles.skeleton} skeleton`} />
                    <div className={`${styles.skeleton} skeleton`} />
                    <div className={`${styles.skeleton} skeleton`} />
                  </>
                ) : visibleItems.length === 0 ? (
                  <div className={styles.empty}>
                    <div className={styles.emptyIcon}>📦</div>
                    <strong>{items.length === 0 ? 'No inventory yet' : 'Nothing matches those filters'}</strong>
                    {items.length === 0
                      ? isAdmin
                        ? 'Add your first item — for example, drop cable or RJ45 connectors — then receive stock.'
                        : 'An administrator has not added any items yet.'
                      : 'Try clearing the search or filters.'}
                  </div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Category</th>
                          <th>On hand</th>
                          <th>Status</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleItems.map((item) => {
                          const state = stockState(item)
                          const cat = categoryInfo(item.category)
                          return (
                            <tr key={item.id}>
                              <td>
                                <div className={styles.itemName}>{item.name}</div>
                                <div className={styles.itemSub}>
                                  {[item.sku, item.location].filter(Boolean).join(' · ') || '—'}
                                </div>
                              </td>
                              <td>
                                <span className={styles.badge}>
                                  {cat.icon} {cat.label}
                                </span>
                              </td>
                              <td>
                                <span className={styles.qty}>{fmtQty(num(item.quantity_on_hand))}</span>
                                <span className={styles.qtyUnit}>{unitLabel(item.unit)}</span>
                                <div className={styles.meter} aria-hidden="true">
                                  <div
                                    className={styles.meterFill}
                                    style={{ width: `${state.pct}%`, ['--tone' as string]: toneVar(state.tone) }}
                                  />
                                </div>
                              </td>
                              <td>
                                <span className={`${styles.badge} ${styles[state.tone]}`}>{state.label}</span>
                                {num(item.reorder_level) > 0 && (
                                  <div className={styles.itemSub}>reorder at {fmtQty(num(item.reorder_level))}</div>
                                )}
                              </td>
                              <td>
                                <div className={styles.actions}>
                                  {item.is_active ? (
                                    <>
                                      {isAdmin && (
                                        <button
                                          type="button"
                                          className={`${styles.btn} ${styles.btnSmall}`}
                                          onClick={() => setModal({ kind: 'move', item, type: 'stock_in' })}
                                        >
                                          + Receive
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnSmall}`}
                                        onClick={() => setModal({ kind: 'move', item, type: 'installation_use' })}
                                        disabled={num(item.quantity_on_hand) <= 0}
                                      >
                                        Use
                                      </button>
                                      {isAdmin && (
                                        <button
                                          type="button"
                                          className={`${styles.btn} ${styles.btnSmall}`}
                                          onClick={() => setModal({ kind: 'item', item })}
                                        >
                                          Edit
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    isAdmin && (
                                      <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnSmall}`}
                                        onClick={() => setArchived(item, false)}
                                      >
                                        Restore
                                      </button>
                                    )
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* ---------------- activity ---------------- */}
              <aside className={styles.panel} aria-label="Recent stock activity">
                <div className={styles.panelHead}>
                  <h2 className={styles.panelTitle}>Recent activity</h2>
                  <span className={styles.panelMeta}>last {movements.length}</span>
                </div>

                {loading ? (
                  <>
                    <div className={`${styles.skeleton} skeleton`} />
                    <div className={`${styles.skeleton} skeleton`} />
                  </>
                ) : movements.length === 0 ? (
                  <div className={styles.empty}>
                    <div className={styles.emptyIcon}>🧾</div>
                    <strong>No movements yet</strong>
                    Receiving, using or returning stock will appear here.
                  </div>
                ) : (
                  <div className={styles.feed}>
                    {movements.map((move) => {
                      const meta = MOVEMENT_LABEL[move.movement_type]
                      const item = itemById.get(move.item_id)
                      const client = move.client_id ? clientById.get(move.client_id) : null
                      const change = num(move.quantity_change)
                      return (
                        <div key={move.id} className={styles.feedRow}>
                          <span className={styles.feedIcon} aria-hidden="true">
                            {meta.icon}
                          </span>
                          <div>
                            <div className={styles.feedTitle}>{item?.name || 'Unknown item'}</div>
                            <div className={styles.feedSub}>
                              {meta.label}
                              {client?.customer_name ? ` · ${client.customer_name}` : ''}
                              {move.job_type ? ` · ${jobLabel(move.job_type)}` : ''}
                              {move.install_location ? ` · at ${move.install_location}` : ''}
                              {move.reference ? ` · ${move.reference}` : ''}
                              {move.created_by_name || move.created_by_email
                                ? ` · by ${move.created_by_name || move.created_by_email}`
                                : ''}
                              {move.notes ? ` — ${move.notes}` : ''}
                            </div>
                          </div>
                          <div>
                            <div
                              className={styles.feedQty}
                              style={{ color: change >= 0 ? 'var(--good)' : 'var(--warn)' }}
                            >
                              {change > 0 ? '+' : ''}
                              {fmtQty(change)}
                            </div>
                            <div className={styles.feedTime}>{timeAgo(move.created_at)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>

      {modal?.kind === 'item' && (
        <ItemModal
          item={modal.item}
          tenantId={tenantId}
          onClose={() => setModal(null)}
          onArchive={modal.item ? () => { setModal(null); setArchived(modal.item as Item, true) } : undefined}
          onSaved={(message) => {
            setModal(null)
            setNotice(message)
            load(true)
          }}
        />
      )}

      {modal?.kind === 'kits' && (
        <KitsModal
          kits={kits}
          items={activeItems}
          tenantId={tenantId}
          onClose={() => setModal(null)}
          onChanged={(message) => {
            setNotice(message)
            load(true)
          }}
        />
      )}

      {modal?.kind === 'move' && (
        <MoveModal
          item={modal.item}
          initialType={modal.type}
          allowedTypes={allowedMoves}
          items={activeItems}
          clients={clients}
          email={email}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null)
            setNotice(message)
            load(true)
          }}
        />
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  hint,
  tone,
  delay,
}: {
  label: string
  value: string
  hint: string
  tone?: string
  delay: number
}) {
  return (
    <div className={styles.stat} style={{ ['--d' as string]: `${delay}ms`, ['--tone' as string]: tone }}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statHint}>{hint}</div>
    </div>
  )
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.modalHead}>
          <div>
            <h2 className={styles.modalTitle}>{title}</h2>
            {subtitle && <p className={styles.modalSub}>{subtitle}</p>}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ItemModal({
  item,
  tenantId,
  onClose,
  onSaved,
  onArchive,
}: {
  item: Item | null
  tenantId: string
  onClose: () => void
  onSaved: (message: string) => void
  onArchive?: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [name, setName] = useState(item?.name || '')
  const [sku, setSku] = useState(item?.sku || '')
  const [category, setCategory] = useState<Category>(item?.category || 'cable')
  const [unit, setUnit] = useState<Unit>(item?.unit || 'pc')
  const [reorder, setReorder] = useState(item ? String(item.reorder_level) : '0')
  const [cost, setCost] = useState(item?.unit_cost != null ? String(item.unit_cost) : '')
  const [location, setLocation] = useState(item?.location || '')
  const [notes, setNotes] = useState(item?.notes || '')
  const [initial, setInitial] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setFormError('')

    if (!name.trim()) return setFormError('Give the item a name.')
    const reorderNum = Number(reorder || 0)
    if (!Number.isFinite(reorderNum) || reorderNum < 0) return setFormError('Reorder level must be 0 or more.')
    const costNum = cost.trim() === '' ? null : Number(cost)
    if (costNum !== null && (!Number.isFinite(costNum) || costNum < 0)) return setFormError('Unit cost must be 0 or more.')
    const initialNum = initial.trim() === '' ? 0 : Number(initial)
    if (!Number.isFinite(initialNum) || initialNum < 0) return setFormError('Opening stock must be 0 or more.')

    const fields = {
      name: name.trim(),
      sku: sku.trim() || null,
      category,
      unit,
      reorder_level: reorderNum,
      unit_cost: costNum,
      location: location.trim() || null,
      notes: notes.trim() || null,
    }

    setBusy(true)
    try {
      if (item) {
        const { error } = await supabase.from('inventory_items').update(fields).eq('id', item.id)
        if (error) throw error
        onSaved(`${fields.name} updated.`)
        return
      }

      const { data, error } = await supabase
        .from('inventory_items')
        .insert({ ...fields, tenant_id: tenantId })
        .select('id')
        .single()
      if (error) throw error

      // Opening stock goes through the ledger like every other change.
      if (initialNum > 0) {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const { error: moveError } = await supabase.from('inventory_movements').insert({
          item_id: data.id,
          movement_type: 'stock_in',
          quantity_change: initialNum,
          reference: 'Opening stock',
          created_by_email: session?.user.email || null,
        })
        if (moveError) throw moveError
      }
      onSaved(`${fields.name} added.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Could not save.'
      setFormError(
        /duplicate key|inventory_items_tenant_sku_key/i.test(message) ? 'Another item already uses that SKU.' : message,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      title={item ? 'Edit item' : 'Add inventory item'}
      subtitle={item ? 'Stock quantity changes through movements, not here.' : 'Create the item, then receive stock into it.'}
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={save}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="inv-name">Name</label>
          <input id="inv-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cat6 drop cable" autoFocus />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="inv-category">Category</label>
            <select id="inv-category" className={`${styles.select} ${styles.input}`} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="inv-unit">Counted in</label>
            <select id="inv-unit" className={`${styles.select} ${styles.input}`} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="inv-sku">SKU (optional)</label>
            <input id="inv-sku" className={styles.input} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="CAT6-DROP" />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="inv-location">Location</label>
            <input id="inv-location" className={styles.input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Main warehouse" />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="inv-reorder">Reorder level</label>
            <input id="inv-reorder" className={styles.input} type="number" min="0" step="any" inputMode="decimal" value={reorder} onChange={(e) => setReorder(e.target.value)} />
            <span className={styles.hint}>Alert when stock falls to this.</span>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="inv-cost">Unit cost (₱)</label>
            <input id="inv-cost" className={styles.input} type="number" min="0" step="any" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        {!item && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="inv-initial">Opening stock (optional)</label>
            <input id="inv-initial" className={styles.input} type="number" min="0" step="any" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0" />
            <span className={styles.hint}>Recorded as a “Stock received” movement.</span>
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="inv-notes">Notes</label>
          <textarea id="inv-notes" className={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {formError && <div className={styles.formError} role="alert">{formError}</div>}

        <div className={styles.formFooter}>
          {onArchive && (
            <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={onArchive} disabled={busy}>
              Archive
            </button>
          )}
          <button type="button" className={styles.btn} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
            {busy ? 'Saving…' : item ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function KitsModal({
  kits,
  items,
  tenantId,
  onClose,
  onChanged,
}: {
  kits: Kit[]
  items: Item[]
  tenantId: string
  onClose: () => void
  onChanged: (message: string) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const itemName = (id: string) => items.find((i) => i.id === id)?.name || 'Archived item'
  const [name, setName] = useState('')
  const [jobType, setJobType] = useState<JobType>('new_installation')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<{ itemId: string; qty: string }[]>([{ itemId: items[0]?.id || '', qty: '1' }])
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setFormError('')
    if (!name.trim()) return setFormError('Give the kit a name.')
    const valid = lines.filter((l) => l.itemId)
    if (valid.length === 0) return setFormError('Add at least one material.')
    if (new Set(valid.map((l) => l.itemId)).size !== valid.length) return setFormError('Each material can only appear once.')
    if (valid.some((l) => !(Number(l.qty) > 0))) return setFormError('Every quantity must be greater than zero.')

    setBusy(true)
    const { data: kit, error } = await supabase
      .from('inventory_kits')
      .insert({ tenant_id: tenantId, name: name.trim(), job_type: jobType, description: description.trim() || null })
      .select('id')
      .single()
    if (error || !kit) {
      setBusy(false)
      return setFormError(error?.message || 'Could not create the kit.')
    }
    const { error: lineError } = await supabase
      .from('inventory_kit_items')
      .insert(valid.map((l) => ({ kit_id: kit.id, tenant_id: tenantId, item_id: l.itemId, quantity: Number(l.qty) })))
    if (lineError) {
      // Do not leave a half-built kit behind.
      await supabase.from('inventory_kits').delete().eq('id', kit.id)
      setBusy(false)
      return setFormError(lineError.message)
    }
    setBusy(false)
    setName('')
    setDescription('')
    setLines([{ itemId: items[0]?.id || '', qty: '1' }])
    onChanged(`Kit "${name.trim()}" saved. Technicians will see it for ${jobLabel(jobType).toLowerCase()} jobs.`)
  }

  async function remove(kit: Kit) {
    if (!window.confirm(`Delete the kit "${kit.name}"?`)) return
    const { error } = await supabase.from('inventory_kits').delete().eq('id', kit.id)
    if (error) return setFormError(error.message)
    onChanged(`Kit "${kit.name}" deleted.`)
  }

  return (
    <ModalShell
      title="Recommended kits"
      subtitle="Ready-made material sets. Technicians pick one in the mobile app, then add, swap or remove items."
      onClose={onClose}
    >
      <div className={styles.form}>
        {kits.length === 0 ? (
          <div className={styles.feedSub}>No kits yet. Create the first one below.</div>
        ) : (
          kits.map((kit) => (
            <div key={kit.id} className={styles.feedRow}>
              <span className={styles.feedIcon} aria-hidden="true">🧰</span>
              <div>
                <div className={styles.feedTitle}>{kit.name} · {jobLabel(kit.job_type)}</div>
                <div className={styles.feedSub}>
                  {kit.inventory_kit_items.map((k) => `${fmtQty(num(k.quantity))}× ${itemName(k.item_id)}`).join(', ') || 'No items'}
                </div>
              </div>
              <button type="button" className={styles.btn} onClick={() => remove(kit)}>Delete</button>
            </div>
          ))
        )}
      </div>

      <form className={styles.form} onSubmit={create}>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="kit-name">New kit name</label>
            <input id="kit-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard home fiber install" />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="kit-job">Job type</label>
            <select id="kit-job" className={`${styles.select} ${styles.input}`} value={jobType} onChange={(e) => setJobType(e.target.value as JobType)}>
              {JOB_TYPES.map((j) => (
                <option key={j.value} value={j.value}>{j.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="kit-desc">Description (optional)</label>
          <input id="kit-desc" className={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {lines.map((line, index) => (
          <div className={styles.row} key={index}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`kit-item-${index}`}>Material</label>
              <select
                id={`kit-item-${index}`}
                className={`${styles.select} ${styles.input}`}
                value={line.itemId}
                onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, itemId: e.target.value } : l)))}
              >
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`kit-qty-${index}`}>Quantity</label>
              <input
                id={`kit-qty-${index}`}
                className={styles.input}
                type="number"
                min="0"
                step="any"
                value={line.qty}
                onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, qty: e.target.value } : l)))}
              />
            </div>
          </div>
        ))}

        <div>
          <button type="button" className={styles.btn} onClick={() => setLines([...lines, { itemId: items[0]?.id || '', qty: '1' }])}>
            + Add material
          </button>
          {lines.length > 1 && (
            <button type="button" className={styles.btn} onClick={() => setLines(lines.slice(0, -1))}>
              Remove last
            </button>
          )}
        </div>

        {formError && <div className={styles.formError} role="alert">{formError}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={styles.btn} onClick={onClose} disabled={busy}>Close</button>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy || items.length === 0}>
            {busy ? 'Saving…' : 'Create kit'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function MoveModal({
  item,
  initialType,
  allowedTypes,
  items,
  clients,
  email,
  onClose,
  onSaved,
}: {
  item: Item | null
  initialType: MovementType
  allowedTypes: MovementType[]
  items: Item[]
  clients: ClientRow[]
  email: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [itemId, setItemId] = useState(item?.id || items[0]?.id || '')
  const [type, setType] = useState<MovementType>(allowedTypes.includes(initialType) ? initialType : allowedTypes[0])
  const [quantity, setQuantity] = useState('')
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [clientId, setClientId] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const selected = items.find((i) => i.id === itemId) || null
  const needsClient = type === 'installation_use'
  const optionalClient = type === 'return'

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setFormError('')

    if (!selected) return setFormError('Choose an item.')
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) return setFormError('Enter a quantity greater than zero.')
    if (needsClient && !clientId) return setFormError('Select the client installation these materials were used on.')

    const removes = type === 'installation_use' || type === 'stock_out' || (type === 'adjustment' && direction === 'remove')
    const change = removes ? -qty : qty

    if (removes && qty > num(selected.quantity_on_hand)) {
      return setFormError(`Only ${fmtQty(num(selected.quantity_on_hand))} ${unitLabel(selected.unit)} on hand.`)
    }

    setBusy(true)
    const { error } = await supabase.from('inventory_movements').insert({
      item_id: selected.id,
      movement_type: type,
      quantity_change: change,
      client_id: clientId || null,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
      created_by_email: email || null,
    })
    setBusy(false)

    if (error) {
      setFormError(error.message)
      return
    }

    const client = clients.find((c) => c.id === clientId)
    onSaved(
      `${MOVEMENT_LABEL[type].label}: ${fmtQty(qty)} ${unitLabel(selected.unit)} of ${selected.name}${
        client?.customer_name ? ` for ${client.customer_name}` : ''
      }.`,
    )
  }

  return (
    <ModalShell
      title="Record stock movement"
      subtitle="Every change is saved to the ledger with who made it and when."
      onClose={onClose}
    >
      <form className={styles.form} onSubmit={save}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="mv-type">What happened</label>
          <select id="mv-type" className={`${styles.select} ${styles.input}`} value={type} onChange={(e) => setType(e.target.value as MovementType)}>
            {allowedTypes.map((t) => (
              <option key={t} value={t}>{MOVEMENT_LABEL[t].icon} {MOVEMENT_LABEL[t].label}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="mv-item">Item</label>
          <select id="mv-item" className={`${styles.select} ${styles.input}`} value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} — {fmtQty(num(i.quantity_on_hand))} {unitLabel(i.unit)}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="mv-qty">Quantity{selected ? ` (${unitLabel(selected.unit)})` : ''}</label>
            <input id="mv-qty" className={styles.input} type="number" min="0" step="any" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" autoFocus />
          </div>
          {type === 'adjustment' ? (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="mv-dir">Direction</label>
              <select id="mv-dir" className={`${styles.select} ${styles.input}`} value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'remove')}>
                <option value="add">Add to count</option>
                <option value="remove">Remove from count</option>
              </select>
            </div>
          ) : (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="mv-ref">Reference (optional)</label>
              <input id="mv-ref" className={styles.input} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={type === 'stock_in' ? 'Supplier / PO #' : 'Ticket / job #'} />
            </div>
          )}
        </div>

        {(needsClient || optionalClient) && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="mv-client">
              Client installation{optionalClient ? ' (optional)' : ''}
            </label>
            <select id="mv-client" className={`${styles.select} ${styles.input}`} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">{needsClient ? 'Select a client…' : 'Not linked to a client'}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.customer_name || c.id}</option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="mv-notes">Notes</label>
          <textarea id="mv-notes" className={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={type === 'adjustment' ? 'Why is the count being corrected?' : ''} />
        </div>

        {formError && <div className={styles.formError} role="alert">{formError}</div>}

        <div className={styles.formFooter}>
          <button type="button" className={styles.btn} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
            {busy ? 'Saving…' : 'Save movement'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
