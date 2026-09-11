'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'

type Client = {
  id: string
  customer_name: string
  install_date: string
  plan_name: string
  area: string
  installation_status: string
  account_status: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  // filter state
  const [nameFilter, setNameFilter] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [installStatusFilter, setInstallStatusFilter] = useState('')
  const [accountStatusFilter, setAccountStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    const fetchClients = async () => {
      const supabase = createClient()

      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase.from('clients').select('*')
      if (error) {
        setError(error.message)
      } else {
        setClients(data || [])
      }
      setLoading(false)
    }
    fetchClients()
  }, [router])

  if (loading) return <p style={{ padding: 40 }}>Loading...</p>
  if (error) return <p style={{ padding: 40 }}>Error: {error}</p>

  const filteredClients = clients.filter(c => {
    if (nameFilter && !c.customer_name.toLowerCase().includes(nameFilter.toLowerCase())) return false
    if (areaFilter && !c.area.toLowerCase().includes(areaFilter.toLowerCase())) return false
    if (planFilter && !c.plan_name.toLowerCase().includes(planFilter.toLowerCase())) return false
    if (installStatusFilter && c.installation_status !== installStatusFilter) return false
    if (accountStatusFilter && c.account_status !== accountStatusFilter) return false
    if (dateFrom && c.install_date < dateFrom) return false
    if (dateTo && c.install_date > dateTo) return false
    return true
  })

  const uniqueInstallStatuses = Array.from(new Set(clients.map(c => c.installation_status))).filter(Boolean)
  const uniqueAccountStatuses = Array.from(new Set(clients.map(c => c.account_status))).filter(Boolean)

  const inputStyle = { padding: 6, marginRight: 8, marginBottom: 8 }

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>Client List</h1>

      <div style={{ marginTop: 20, marginBottom: 10 }}>
        <input
          placeholder="Search name..."
          value={nameFilter}
          onChange={e => setNameFilter(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Search area..."
          value={areaFilter}
          onChange={e => setAreaFilter(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Search plan..."
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value)}
          style={inputStyle}
        />
        <select value={installStatusFilter} onChange={e => setInstallStatusFilter(e.target.value)} style={inputStyle}>
          <option value="">All Installation Status</option>
          {uniqueInstallStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={accountStatusFilter} onChange={e => setAccountStatusFilter(e.target.value)} style={inputStyle}>
          <option value="">All Account Status</option>
          {uniqueAccountStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label style={{ marginRight: 4 }}>From:</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
        <label style={{ marginRight: 4 }}>To:</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
      </div>

      <p style={{ color: '#666', marginBottom: 10 }}>
        Showing {filteredClients.length} of {clients.length} clients
      </p>

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
            <th style={{ padding: 8 }}>Customer Name</th>
            <th style={{ padding: 8 }}>Area</th>
            <th style={{ padding: 8 }}>Plan</th>
            <th style={{ padding: 8 }}>Install Date</th>
            <th style={{ padding: 8 }}>Installation Status</th>
            <th style={{ padding: 8 }}>Account Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredClients.map(c => (
            <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{c.customer_name}</td>
              <td style={{ padding: 8 }}>{c.area}</td>
              <td style={{ padding: 8 }}>{c.plan_name}</td>
              <td style={{ padding: 8 }}>{c.install_date}</td>
              <td style={{ padding: 8 }}>{c.installation_status}</td>
              <td style={{ padding: 8 }}>{c.account_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}