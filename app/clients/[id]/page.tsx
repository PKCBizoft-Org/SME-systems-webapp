'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'
import Link from 'next/link'

type Client = {
  id: string
  customer_name: string
  install_date: string
  plan_name: string
  area: string
  installation_status: string
  account_status: string
  account_id: string
  mobile_number: string
  pppoe_name: string
  map_location: string
  technicians: string
}

type Billing = {
  id: string
  bill_id: string
  status: string
  bill_type: string
  bill_date: string
  due_date: string
  amount_due: number
}

type Payment = {
  id: string
  payment_id: string
  receipt_number: string
  amount_paid: number
  payment_date: string
  payment_method: string
  billing: { bill_id: string; bill_type: string } | null
}

const INSTALLATION_STATUS_OPTIONS = ['Scheduled', 'Completed', 'Cancelled', 'Terminated']
const ACCOUNT_STATUS_OPTIONS = ['Paid', 'Due', 'Overdue']

export default function ClientDetailPage() {
  const [client, setClient] = useState<Client | null>(null)
  const [billing, setBilling] = useState<Billing[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  // editable field state
  const [installationStatus, setInstallationStatus] = useState('')
  const [accountStatus, setAccountStatus] = useState('')

  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  useEffect(() => {
    const fetchAll = async () => {
      const supabase = createClient()

      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        router.push('/login')
        return
      }

      const { data: clientData, error: clientError } = await supabase
        .from('clients').select('*').eq('id', id).single()

      if (clientError) {
        setError(clientError.message)
        setLoading(false)
        return
      }
      setClient(clientData)
      setInstallationStatus(clientData.installation_status)
      setAccountStatus(clientData.account_status)

      const { data: billingData } = await supabase
        .from('billing').select('*').eq('client_id', id).order('bill_date', { ascending: false })
      setBilling(billingData || [])

      const { data: paymentData } = await supabase
        .from('payments')
        .select('*, billing(bill_id, bill_type)')
        .eq('client_id', id)
        .order('payment_date', { ascending: false })
      setPayments((paymentData as unknown as Payment[]) || [])

      setLoading(false)
    }
    fetchAll()
  }, [id, router])

  const handleSave = async () => {
    setSaving(true)
    setSaveMessage('')
    const supabase = createClient()
    const { error } = await supabase
      .from('clients')
      .update({ installation_status: installationStatus, account_status: accountStatus })
      .eq('id', id)

    if (error) {
      setSaveMessage('Save failed: ' + error.message)
    } else {
      setSaveMessage('Saved successfully.')
      setClient(prev => prev ? { ...prev, installation_status: installationStatus, account_status: accountStatus } : prev)
    }
    setSaving(false)
  }

  if (loading) return <p style={{ padding: 40 }}>Loading...</p>
  if (error) return <p style={{ padding: 40 }}>Error: {error}</p>
  if (!client) return <p style={{ padding: 40 }}>Client not found.</p>

  const rowStyle = { display: 'flex', padding: '10px 0', borderBottom: '1px solid #eee', alignItems: 'center' }
  const labelStyle = { width: 180, fontWeight: 'bold' as const }
  const tableStyle = { borderCollapse: 'collapse' as const, width: '100%', marginTop: 10, marginBottom: 30 }
  const thStyle = { textAlign: 'left' as const, padding: 8, borderBottom: '2px solid #333' }
  const tdStyle = { padding: 8, borderBottom: '1px solid #eee' }

  const hasChanges = installationStatus !== client.installation_status || accountStatus !== client.account_status

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', maxWidth: 700 }}>
      <Link href="/clients">&larr; Back to Client List</Link>
      <h1 style={{ marginTop: 20 }}>{client.customer_name}</h1>

      <div style={rowStyle}><span style={labelStyle}>Account ID</span><span>{client.account_id}</span></div>
      <div style={rowStyle}><span style={labelStyle}>Area</span><span>{client.area}</span></div>
      <div style={rowStyle}><span style={labelStyle}>Plan</span><span>{client.plan_name}</span></div>
      <div style={rowStyle}><span style={labelStyle}>Install Date</span><span>{client.install_date}</span></div>

      <div style={rowStyle}>
        <span style={labelStyle}>Installation Status</span>
        <select value={installationStatus} onChange={e => setInstallationStatus(e.target.value)} style={{ padding: 6 }}>
          {INSTALLATION_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Account Status</span>
        <select value={accountStatus} onChange={e => setAccountStatus(e.target.value)} style={{ padding: 6 }}>
          {ACCOUNT_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      <div style={rowStyle}><span style={labelStyle}>Mobile Number</span><span>{client.mobile_number}</span></div>
      <div style={rowStyle}><span style={labelStyle}>PPPoE Name</span><span>{client.pppoe_name}</span></div>
      <div style={rowStyle}><span style={labelStyle}>Map Location</span><span>{client.map_location || '—'}</span></div>
      <div style={rowStyle}><span style={labelStyle}>Technicians</span><span>{client.technicians}</span></div>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          style={{ padding: '8px 20px', cursor: hasChanges ? 'pointer' : 'default', opacity: hasChanges ? 1 : 0.5 }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {saveMessage && <span style={{ marginLeft: 12 }}>{saveMessage}</span>}
      </div>

      <h2 style={{ marginTop: 30 }}>Billing History</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Bill ID</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Bill Date</th>
            <th style={thStyle}>Due Date</th>
            <th style={thStyle}>Amount Due</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {billing.length === 0 && (
            <tr><td style={tdStyle} colSpan={6}>No billing records yet.</td></tr>
          )}
          {billing.map(b => (
            <tr key={b.id}>
              <td style={tdStyle}>{b.bill_id}</td>
              <td style={tdStyle}>{b.bill_type}</td>
              <td style={tdStyle}>{b.bill_date}</td>
              <td style={tdStyle}>{b.due_date}</td>
              <td style={tdStyle}>{b.amount_due}</td>
              <td style={tdStyle}>{b.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Payment History</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Receipt #</th>
            <th style={thStyle}>Applied to Bill</th>
            <th style={thStyle}>Bill Type</th>
            <th style={thStyle}>Amount Paid</th>
            <th style={thStyle}>Payment Date</th>
            <th style={thStyle}>Method</th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 && (
            <tr><td style={tdStyle} colSpan={6}>No payment records yet.</td></tr>
          )}
          {payments.map(p => (
            <tr key={p.id}>
              <td style={tdStyle}>{p.receipt_number}</td>
              <td style={tdStyle}>{p.billing?.bill_id || '—'}</td>
              <td style={tdStyle}>{p.billing?.bill_type || '—'}</td>
              <td style={tdStyle}>{p.amount_paid}</td>
              <td style={tdStyle}>{p.payment_date}</td>
              <td style={tdStyle}>{p.payment_method}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}