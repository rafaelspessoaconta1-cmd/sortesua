const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = __dirname
const DIST = path.join(ROOT, 'dist')

function copyRecursive(src, dest) {
  const stats = fs.statSync(src)
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry))
    }
  } else {
    fs.copyFileSync(src, dest)
  }
}

function copyToDist(name) {
  const src = path.join(ROOT, name)
  const dest = path.join(DIST, name)
  if (!fs.existsSync(src)) {
    console.log(`  - ${name} (ignorado)`)
    return
  }
  if (fs.statSync(src).isDirectory()) {
    copyRecursive(src, dest)
  } else {
    const parent = path.dirname(dest)
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true })
    fs.copyFileSync(src, dest)
  }
  console.log(`  ✓ ${name}`)
}

let ok = true

console.log('')
console.log('═══════════════════════════')
console.log('  BUILD DE PRODUÇÃO')
console.log('═══════════════════════════')
console.log('')

console.log('▶ Verificando sintaxe...')
;['server.js', 'database.js', 'public/app.js'].forEach(f => {
  try {
    execSync(`node -c "${path.join(ROOT, f)}"`, { stdio: 'pipe', shell: true })
    console.log(`  ✓ ${f}`)
  } catch {
    console.error(`  ✗ ${f} - ERRO de sintaxe`)
    ok = false
  }
})
console.log('')
if (!ok) { console.log('✗ Build falhou'); process.exit(1) }

console.log('▶ Limpando dist/ ...')
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true })
fs.mkdirSync(DIST)
console.log('  ✓ dist/ criada')
console.log('')

console.log('▶ Copiando arquivos...')
;['server.js', 'database.js', 'package.json', 'package-lock.json',
  'Procfile', '.nvmrc', '.env.example', 'public'].forEach(copyToDist)

if (fs.existsSync(path.join(ROOT, 'config.json'))) copyToDist('config.json')

const uploads = path.join(DIST, 'public', 'uploads')
if (!fs.existsSync(uploads)) fs.mkdirSync(uploads, { recursive: true })
console.log('  ✓ public/uploads/')
console.log('')

console.log('═══════════════════════════')
console.log('  BUILD CONCLUÍDO COM SUCESSO')
console.log('═══════════════════════════')
console.log('')
console.log(`  📁 ${DIST}`)
console.log('')
