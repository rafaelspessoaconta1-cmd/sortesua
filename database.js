const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kygrvxoqipzvbephpjyw.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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

async function initDb() {
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
  generateSecurePassword
}
