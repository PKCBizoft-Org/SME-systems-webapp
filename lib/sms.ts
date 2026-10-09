// Semaphore (https://semaphore.co) SMS helper for server-side alerts.
// Needs SEMAPHORE_API_KEY (and optionally SEMAPHORE_SENDER_NAME) in the server
// environment. Until the key is added, smsConfigured() is false and callers
// skip sending instead of failing.

export function smsConfigured() {
  return Boolean(process.env.SEMAPHORE_API_KEY)
}

// 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX and +639XXXXXXXXX -> 639XXXXXXXXX
export function normalizePhilippineMobile(value: string) {
  const raw = value.trim().replace(/[^\d+]/g, '')
  if (raw.startsWith('+63')) return `63${raw.slice(3)}`
  if (raw.startsWith('63')) return raw
  if (raw.startsWith('09')) return `63${raw.slice(1)}`
  if (raw.startsWith('9') && raw.length === 10) return `63${raw}`
  return raw
}

export async function sendSms(mobile: string, message: string) {
  const apiKey = process.env.SEMAPHORE_API_KEY
  if (!apiKey) throw new Error('SEMAPHORE_API_KEY is not set.')

  const recipient = normalizePhilippineMobile(mobile)
  if (!/^639\d{9}$/.test(recipient)) throw new Error('Not a valid Philippine mobile number.')

  const form = new URLSearchParams({ apikey: apiKey, number: recipient, message })
  if (process.env.SEMAPHORE_SENDER_NAME) form.set('sendername', process.env.SEMAPHORE_SENDER_NAME)

  const response = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    cache: 'no-store',
  })

  if (!response.ok) throw new Error(`The SMS provider rejected the request (${response.status}).`)
  return recipient
}
