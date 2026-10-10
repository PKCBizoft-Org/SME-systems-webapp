// How many times a customer or technician may reset a forgotten password in one
// calendar month (Philippine time). The count lives in the account's
// app_metadata, which only the server can write.
export const RESETS_PER_MONTH = 3

type Meta = Record<string, unknown> | undefined | null

export function currentResetMonth() {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7)
}

export function resetsUsed(meta: Meta) {
  return meta?.reset_month === currentResetMonth() ? Number(meta.reset_count) || 0 : 0
}

export function limitMessage() {
  return `You have used all ${RESETS_PER_MONTH} password resets for this month. Please try again next month or ask your administrator for help.`
}
