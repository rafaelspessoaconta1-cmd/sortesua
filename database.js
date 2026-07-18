const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('')
  console.error('═══════════════════════════════════════════════════')
  console.error('  ERRO: Supabase não configurado')
  console.error('')
  console.error('  Variáveis de ambiente necessárias:')
  console.error('    SUPABASE_URL')
  console.error('    SUPABASE_SERVICE_KEY')
  console.error('')
  console.error('  Configure no arquivo .env (local) ou no')
  console.error('  dashboard da Vercel (Environment Variables).')
  console.error('═══════════════════════════════════════════════════')
  console.error('')
}

let supabase
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
} catch (e) {
  console.error('Erro ao criar cliente Supabase:', e.message)
  process.exit(1)
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

function generateSecurePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*'
  let pwd = ''
  for (let i = 0; i < 18; i++) {
    pwd += chars[crypto.randomInt(0, chars.length)]
  }
  return pwd
}

let schemaInicializado = false

async function runSchema() {
  if (schemaInicializado) return

  try {
    const { error } = await supabase.from('usuarios').select('id').limit(1)
    if (!error) {
      schemaInicializado = true
      return
    }
  } catch {}

  console.warn('')
  console.warn('═══════════════════════════════════════════════════════')
  console.warn('  ATENÇÃO: Tabelas do banco não encontradas!')
  console.warn('')
  console.warn('  Execute o conteúdo de schema.sql no SQL Editor do')
  console.warn('  Supabase (Dashboard > SQL Editor) para criar as')
  console.warn('  tabelas antes de usar o sistema.')
  console.warn('  Ou reinicie o servidor após criar as tabelas.')
  console.warn('═══════════════════════════════════════════════════════')
  console.warn('')
}

async function getConfig(chave, defaultValue = null) {
  try {
    const { data } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', chave)
      .maybeSingle()
    if (data) {
      try { return JSON.parse(data.valor) } catch { return data.valor }
    }
  } catch {}
  return defaultValue
}

async function setConfig(chave, valor) {
  const stringVal = typeof valor === 'object' ? JSON.stringify(valor) : String(valor)
  const { error } = await supabase
    .from('configuracoes')
    .upsert({ chave, valor: stringVal }, { onConflict: 'chave' })
  if (error) throw error
}

async function getValorPremio() {
  const cfg = await getConfig('app_config', { valor_premio: 500 })
  return cfg?.valor_premio ?? 500
}

async function setValorPremio(valor) {
  const cfg = await getConfig('app_config', { valor_premio: 500 })
  cfg.valor_premio = parseFloat(valor)
  await setConfig('app_config', cfg)
}

async function initDb() {
  await runSchema()

  const { data: adminExists } = await supabase.from('usuarios').select('id').eq('username', 'admin').maybeSingle()
  if (!adminExists) {
    const adminPass = hashPassword('Rafael@4180')
    console.log('=== SENHA ADMIN padrão: Rafael@4180 ===')
    await supabase.from('usuarios').insert({
      username: 'admin',
      password: adminPass,
      role: 'admin',
      nome: 'Administrador Principal'
    })
  }

  const { data: sellerExists } = await supabase.from('usuarios').select('id').eq('username', 'vendedor1').maybeSingle()
  let defaultVendedorId = null
  if (!sellerExists) {
    const sellerPass = hashPassword('Vend@Sorte2026!Pdr')
    console.log('=== SENHA VENDEDOR padrão: Vend@Sorte2026!Pdr ===')
    const { data: newUser } = await supabase.from('usuarios').insert({
      username: 'vendedor1',
      password: sellerPass,
      role: 'vendedor',
      nome: 'Vendedor Padrão 1'
    }).select().single()

    const { data: newVend } = await supabase.from('vendedores').insert({
      usuario_id: newUser.id,
      telefone: '11999999999'
    }).select().single()
    defaultVendedorId = newVend.id
  } else {
    const { data: v } = await supabase.from('vendedores').select('id').eq('usuario_id', sellerExists.id).maybeSingle()
    if (v) defaultVendedorId = v.id
  }

  const { count } = await supabase.from('cartelas').select('*', { count: 'exact', head: true })
  if (count === 0) {
    const todayStr = new Date().toISOString().split('T')[0]
    const randMilhar = () => Math.floor(Math.random() * 10000).toString().padStart(4, '0')

    const tickets = []
    for (let i = 1; i <= 30; i++) {
      tickets.push({
        numero_cartela: i.toString().padStart(3, '0'),
        data_sorteio: todayStr,
        milhar1: randMilhar(),
        milhar2: randMilhar(),
        milhar3: randMilhar(),
        milhar4: randMilhar(),
        valor: 2.00,
        status: 'disponivel',
        vendedor_id: defaultVendedorId
      })
    }
    const { error } = await supabase.from('cartelas').insert(tickets)
    if (!error) console.log(`30 cartelas padrão inseridas para data: ${todayStr}`)
  }
}

module.exports = {
  supabase,
  initDb,
  hashPassword,
  generateSecurePassword,
  getConfig,
  setConfig,
  getValorPremio,
  setValorPremio
}
