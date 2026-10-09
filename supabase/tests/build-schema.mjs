// Splits the saved live-schema dump into ordered SQL files for the sandbox.
// Usage: node build-schema.mjs <dump.txt> <outDir>
import fs from 'node:fs'
import path from 'node:path'

const [dumpPath, outDir] = process.argv.slice(2)
const raw = JSON.parse(fs.readFileSync(dumpPath, 'utf8'))
const text = raw.result
const start = text.indexOf('[{"j"')
const end = text.lastIndexOf('}]') + 2
const rows = JSON.parse(text.slice(start, end))
const j = rows[0].j

fs.mkdirSync(outDir, { recursive: true })
const write = (name, list) => {
  fs.writeFileSync(path.join(outDir, name), (list || []).join('\n') + '\n')
  console.log(name.padEnd(22), (list || []).length, 'statements')
}

// Foreign keys to tables that are not part of the sandbox are skipped.
const present = new Set(
  (j.tables || []).map((ddl) => /create table public\.("?)([a-z_]+)\1/.exec(ddl)?.[2]).filter(Boolean),
)
const fks = (j.fks || []).filter((ddl) => {
  const m = /REFERENCES\s+(?:(\w+)\.)?"?([a-z_]+)"?\(/i.exec(ddl)
  if (!m) return true
  const schema = m[1]
  const table = m[2]
  if (schema === 'auth') return true
  if (schema && schema !== 'public') return false
  return present.has(table)
})
console.log('fks kept', fks.length, 'of', (j.fks || []).length)

write('01_tables.sql', j.tables)
write('02_pk_unique.sql', j.pk_unique)
write('03_checks.sql', j.checks)
write('04_fks.sql', fks)
write('05_indexes.sql', j.indexes)
write('06_functions.sql', j.functions)
write('07_triggers.sql', j.triggers)
write('08_policies.sql', j.policies)
