// Tiny test kit shared by the sandbox suites.
import { msg } from './lib.mjs'

let pass = 0
let fail = 0
const failures = []

// Never dump a stack trace of minified code into the console.
for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, (e) => {
    console.log(`FATAL: ${msg(e)}`)
    process.exit(2)
  })
}

export async function t(name, fn) {
  try {
    await fn()
    pass++
    console.log(`  ok    ${name}`)
  } catch (e) {
    fail++
    failures.push(name)
    console.log(`  FAIL  ${name}\n        ${msg(e)}`)
  }
}

/** Passes only when `fn` throws an error matching `re`. */
export async function rejects(fn, re) {
  try {
    await fn()
  } catch (e) {
    if (!re.test(String(e?.message ?? e))) throw new Error(`wrong error: ${msg(e)}`)
    return
  }
  throw new Error('expected an error, but it succeeded')
}

export function eq(actual, expected, label = 'value') {
  if (String(actual) !== String(expected)) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}

export function ok(cond, label) {
  if (!cond) throw new Error(label)
}

export function section(title) {
  console.log(`\n${title}`)
}

export function summary() {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) console.log('failed:', failures.join(' | '))
  return fail
}
