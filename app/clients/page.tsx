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

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>Client List</h1>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 20 }}>
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
          {clients.map(c => (
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