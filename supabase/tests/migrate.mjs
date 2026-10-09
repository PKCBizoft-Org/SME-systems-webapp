// Applies migration files from the web repo to the sandbox, in order.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { msg } from './lib.mjs'

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

export async function applyMigrations(db, names) {
  for (const name of names) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, name), 'utf8')
    try {
      await db.exec(sql)
      console.log(`applied  ${name}`)
    } catch (e) {
      console.log(`FAILED   ${name}\n         ${msg(e)}`)
      throw e
    }
  }
}
