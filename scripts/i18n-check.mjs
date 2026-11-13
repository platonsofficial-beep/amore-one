import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const en = JSON.parse(readFileSync('src/i18n/locales/en.json', 'utf8'))
const el = JSON.parse(readFileSync('src/i18n/locales/el.json', 'utf8'))
const enKeys = Object.keys(en).sort()
const elKeys = Object.keys(el).sort()
const missingInEl = enKeys.filter((key) => !(key in el))
const missingInEn = elKeys.filter((key) => !(key in en))
if (missingInEl.length || missingInEn.length) {
  console.error('Locale catalogs are out of sync.')
  if (missingInEl.length) console.error('Missing in el:', missingInEl.join('\n'))
  if (missingInEn.length) console.error('Missing in en:', missingInEn.join('\n'))
  process.exit(1)
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === 'i18n' || name === 'node_modules') return []
      return walk(path)
    }
    return /\.(js|jsx)$/.test(name) ? [path] : []
  })
}

const files = walk('src')
const used = new Set()
const call = /(?<![\w.])t\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(call)) {
    used.add(match[2].replace(/\\'/g, "'").replace(/\\"/g, '"'))
  }
}
const missingUsed = [...used].filter((key) => !(key in el)).sort()
if (missingUsed.length) {
  console.error('Greek catalog is missing keys used in code:')
  console.error(missingUsed.join('\n'))
  process.exit(1)
}

const textNode = />\s*([A-Za-z][^<{]{2,80})\s*</g
let hardcoded = 0
for (const file of files) {
  if (file.includes('.test.')) continue
  const source = readFileSync(file, 'utf8')
  hardcoded += [...source.matchAll(textNode)].length
}

const baselinePath = 'src/i18n/hardcodedBaseline.json'
const update = process.argv.includes('--update-baseline')
if (update) {
  writeFileSync(baselinePath, `${JSON.stringify({ jsxTextNodes: hardcoded }, null, 2)}\n`)
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
if (hardcoded > baseline.jsxTextNodes) {
  console.error(`New hard-coded UI text (${hardcoded} > ${baseline.jsxTextNodes}). Use t('English') and add el.json.`)
  process.exit(1)
}

const covered = used.size
const total = covered + hardcoded
const percent = total ? Math.round((covered / total) * 100) : 100
console.log(`i18n ok: ${enKeys.length} shared keys, ${covered} t() calls, ${hardcoded} remaining JSX text nodes, about ${percent}% of scanned UI text is keyed.`)
