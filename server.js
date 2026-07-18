require('dotenv').config()
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const { supabase, initDb, hashPassword } = require('./database');

const BASE_DIR = process.env.VERCEL ? process.cwd() : __dirname
const CONFIG_PATH = path.join(BASE_DIR, 'config.json')
function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { valor_premio: 500 }
  }
}
function writeConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2))
}

const loginAttempts = new Map()
const MAX_ATTEMPTS = 3
const BLOCK_MINUTES = 30

function registerAttempt(username) {
  const now = Date.now()
  const current = loginAttempts.get(username)
  if (current) {
    current.count++
  } else {
    loginAttempts.set(username, { count: 1, blockedAt: now })
  }
  const entry = loginAttempts.get(username)
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedAt = now
  }
}

function getRemainingAttempts(username) {
  const entry = loginAttempts.get(username)
  if (!entry) return MAX_ATTEMPTS
  if (entry.count >= MAX_ATTEMPTS) return 0
  return MAX_ATTEMPTS - entry.count
}

async function getValorPremio() {
  return readConfig().valor_premio
}

async function checkBreachedPassword(password) {
  const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return false
    const text = await res.text()
    return text.split('\n').some(line => line.startsWith(suffix))
  } catch {
    return false
  }
}

function validatePasswordStrength(password) {
  const errors = []
  if (password.length < 8) errors.push('mínimo 8 caracteres')
  if (!/[A-Z]/.test(password)) errors.push('pelo menos uma letra maiúscula')
  if (!/[a-z]/.test(password)) errors.push('pelo menos uma letra minúscula')
  if (!/[0-9]/.test(password)) errors.push('pelo menos um número')
  if (!/[!@#$%&*]/.test(password)) errors.push('pelo menos um caractere especial (!@#$%&*)')
  return errors
}

const app = express();
const PORT = process.env.PORT || 3000;

const SECRET = process.env.APP_SECRET || "asorteesuasecreto123_456789";

function generateToken(user, vendedorId = null) {
  const vid = vendedorId || '';
  const payload = `${user.id}:${user.username}:${user.role}:${user.nome}:${vid}`;
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64');
}

function verifyToken(token) {
  try {
    if (!token) return null;
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 6) return null;
    const [id, username, role, nome, vid, hmac] = parts;
    const payload = `${id}:${username}:${role}:${nome}:${vid}`;
    const expectedHmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    if (hmac !== expectedHmac) return null;
    return { id: parseInt(id), username, role, nome, vendedorId: vid ? parseInt(vid) : null };
  } catch (e) {
    return null;
  }
}

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
  const token = authHeader.split(' ')[1];
  const user = verifyToken(token);
  if (!user) return res.status(403).json({ error: 'Token inválido ou expirado' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado: Requer administrador' });
  }
  next();
}

function requireVendedor(req, res, next) {
  if (req.user.role !== 'vendedor') {
    return res.status(403).json({ error: 'Acesso negado: Requer vendedor' });
  }
  next();
}

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, 'pix_qrcode.png');
  }
});
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, 'public')));

let pixConfig = {
  chave: 'financeiro@asorteesua.com',
  qrCodeUrl: '/uploads/pix_qrcode.png'
};

const qrcodeFile = path.join(uploadsDir, 'pix_qrcode.png');
if (!fs.existsSync(qrcodeFile)) {
  const dummyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(qrcodeFile, dummyPng);
}

// --- AUTH ROUTES ---

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Preencha usuário e senha' });
  }

  const now = Date.now()
  const attempt = loginAttempts.get(username)

  if (attempt && attempt.count >= MAX_ATTEMPTS) {
    const elapsed = now - attempt.blockedAt
    if (elapsed < BLOCK_MINUTES * 60 * 1000) {
      const restante = Math.ceil((BLOCK_MINUTES * 60 * 1000 - elapsed) / 60000)
      return res.status(429).json({
        error: `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em ${restante} minuto(s) ou entre em contato com o Administrador.`,
        blocked: true,
        tentativasRestantes: 0
      })
    } else {
      loginAttempts.delete(username)
    }
  }

  try {
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (!user) {
      registerAttempt(username)
      return res.status(401).json({ error: 'Usuário ou senha inválidos', tentativasRestantes: getRemainingAttempts(username) });
    }
    const hashed = hashPassword(password);
    if (user.password !== hashed) {
      registerAttempt(username)
      return res.status(401).json({ error: 'Usuário ou senha inválidos', tentativasRestantes: getRemainingAttempts(username) });
    }

    loginAttempts.delete(username)

    let vendedorId = null;
    if (user.role === 'vendedor') {
      const { data: vend } = await supabase
        .from('vendedores')
        .select('id')
        .eq('usuario_id', user.id)
        .maybeSingle();
      if (vend) vendedorId = vend.id;
    }

    const token = generateToken(user, vendedorId);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        nome: user.nome,
        vendedorId
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// --- ADMIN ROUTES ---

app.get('/api/admin/dashboard', authenticate, requireAdmin, async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: vendasHoje } = await supabase
      .from('vendas')
      .select('id, valor_venda, vendedor_id, pagamentos!venda_id(metodo, status)')
      .ilike('data_venda', `${todayStr}%`)

    const { count: cartelasPremiadas } = await supabase
      .from('cartelas')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'premiada')

    let valorVendido = 0
    let valorRecebido = 0
    let valorPendente = 0
    let qtdVendas = 0
    const vendedoresSet = new Set()

    for (const v of vendasHoje || []) {
      valorVendido += v.valor_venda || 0
      qtdVendas++
      vendedoresSet.add(v.vendedor_id)
      const pg = Array.isArray(v.pagamentos) ? v.pagamentos[0] : v.pagamentos
      if (pg?.status === 'pago') {
        valorRecebido += v.valor_venda || 0
      } else {
        valorPendente += v.valor_venda || 0
      }
    }

    const vendedoresAtivos = vendedoresSet.size
    const ticketMedio = qtdVendas > 0 ? valorVendido / qtdVendas : 0
    const lucroDoDia = valorRecebido * 0.5

    res.json({
      valorVendidoHoje: valorVendido,
      valorRecebidoHoje: valorRecebido,
      valorPendente,
      cartelasVendidas: qtdVendas,
      cartelasPremiadas: cartelasPremiadas || 0,
      vendedoresAtivos,
      ticketMedio,
      lucroDoDia
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dados do dashboard' });
  }
});

app.get('/api/admin/vendedores', authenticate, requireAdmin, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('vendedores')
      .select('id, telefone, ativo, usuarios(id, username, nome)')
      .order('usuarios(nome)')

    const mapped = (rows || []).map(r => ({
      usuario_id: r.usuarios.id,
      username: r.usuarios.username,
      nome: r.usuarios.nome,
      vendedor_id: r.id,
      telefone: r.telefone,
      ativo: r.ativo
    }))

    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar vendedores' });
  }
});

app.post('/api/admin/vendedores', authenticate, requireAdmin, async (req, res) => {
  const { username, password, nome, telefone } = req.body;
  if (!username || !password || !nome) {
    return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios' });
  }
  try {
    const strengthErrors = validatePasswordStrength(password)
    if (strengthErrors.length > 0) {
      return res.status(400).json({ error: `Senha fraca: ${strengthErrors.join(', ')}` });
    }

    const breached = await checkBreachedPassword(password)
    if (breached) {
      return res.status(400).json({ error: 'Esta senha foi encontrada em uma violação de dados. Escolha uma senha diferente e mais segura.' });
    }

    const { data: userExists } = await supabase
      .from('usuarios')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (userExists) {
      return res.status(400).json({ error: 'Nome de usuário já cadastrado' });
    }

    const hashed = hashPassword(password);

    const { data: newUser, error: userErr } = await supabase
      .from('usuarios')
      .insert({ username, password: hashed, role: 'vendedor', nome })
      .select()
      .single()

    if (userErr) throw userErr

    const { error: vendErr } = await supabase
      .from('vendedores')
      .insert({ usuario_id: newUser.id, telefone: telefone || '' })

    if (vendErr) throw vendErr

    res.status(201).json({ message: 'Vendedor cadastrado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar vendedor' });
  }
});

app.post('/api/admin/vendedores/toggle', authenticate, requireAdmin, async (req, res) => {
  const { vendedor_id, ativo } = req.body;
  try {
    const { error } = await supabase
      .from('vendedores')
      .update({ ativo })
      .eq('id', vendedor_id)

    if (error) throw error
    res.json({ message: 'Status do vendedor atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar status do vendedor' });
  }
});

app.delete('/api/admin/vendedores/:vendedor_id', authenticate, requireAdmin, async (req, res) => {
  const { vendedor_id } = req.params;
  try {
    const { data: vend } = await supabase
      .from('vendedores')
      .select('usuario_id')
      .eq('id', vendedor_id)
      .maybeSingle()

    if (!vend) {
      return res.status(404).json({ error: 'Vendedor não encontrado' });
    }

    const { data: vendas } = await supabase
      .from('vendas')
      .select('id')
      .eq('vendedor_id', vendedor_id)

    const vendaIds = (vendas || []).map(v => v.id)

    if (vendaIds.length > 0) {
      await supabase.from('pagamentos').delete().in('venda_id', vendaIds)
      await supabase.from('vendas').delete().in('id', vendaIds)
    }

    await supabase.from('cartelas').update({ vendedor_id: null }).eq('vendedor_id', vendedor_id)

    await supabase.from('vendedores').delete().eq('id', vendedor_id)

    await supabase.from('usuarios').delete().eq('id', vend.usuario_id)

    res.json({ message: 'Vendedor excluído com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir vendedor' });
  }
});

app.post('/api/admin/alterar-senha', authenticate, requireAdmin, async (req, res) => {
  const { usuario_id, nova_senha } = req.body;
  if (!usuario_id || !nova_senha) {
    return res.status(400).json({ error: 'Informe o usuário e a nova senha' });
  }
  if (nova_senha.length < 4) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 4 caracteres' });
  }

  try {
    const hashed = hashPassword(nova_senha)
    const { error } = await supabase
      .from('usuarios')
      .update({ password: hashed })
      .eq('id', usuario_id)

    if (error) throw error

    loginAttempts.delete(req.body.username || '')

    res.json({ message: 'Senha alterada com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

app.get('/api/admin/valor-premio', authenticate, requireAdmin, async (req, res) => {
  try {
    const valor = await getValorPremio()
    res.json({ valor_premio: valor })
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar valor do prêmio' });
  }
});

app.put('/api/admin/valor-premio', authenticate, requireAdmin, async (req, res) => {
  const { valor_premio } = req.body;
  if (!valor_premio || isNaN(valor_premio) || valor_premio <= 0) {
    return res.status(400).json({ error: 'Informe um valor válido maior que zero' });
  }
  try {
    const cfg = readConfig()
    cfg.valor_premio = parseFloat(valor_premio)
    writeConfig(cfg)
    res.json({ message: 'Prêmio atualizado com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar valor do prêmio' });
  }
});

app.get('/api/admin/ranking', authenticate, requireAdmin, async (req, res) => {
  const { mes, ano } = req.query;
  const now = new Date();
  const targetMes = mes !== undefined ? parseInt(mes) : now.getMonth() + 1;
  const targetAno = ano !== undefined ? parseInt(ano) : now.getFullYear();

  try {
    const { data: vendas, error } = await supabase
      .from('vendas')
      .select(`id, valor_venda, data_venda, vendedor_id, vendedores(usuarios(nome))`)
      .gte('data_venda', `${targetAno}-${String(targetMes).padStart(2, '0')}-01`)
      .lt('data_venda', targetMes === 12
        ? `${targetAno + 1}-01-01`
        : `${targetAno}-${String(targetMes + 1).padStart(2, '0')}-01`)

    if (error) throw error

    const rankMap = new Map()
    for (const v of (vendas || [])) {
      const nome = v.vendedores?.usuarios?.nome || 'Desconhecido'
      if (!rankMap.has(v.vendedor_id)) {
        rankMap.set(v.vendedor_id, { vendedor_id: v.vendedor_id, nome, cartelas: 0, valor: 0 })
      }
      const entry = rankMap.get(v.vendedor_id)
      entry.cartelas++
      entry.valor += parseFloat(v.valor_venda) || 0
    }

    const ranking = Array.from(rankMap.values())
      .sort((a, b) => b.valor - a.valor)
      .map((r, i) => ({
        posicao: i + 1,
        vendedor_id: r.vendedor_id,
        nome: r.nome,
        cartelas_vendidas: r.cartelas,
        valor_vendido: r.valor,
        comissao: r.valor * 0.5
      }))

    res.json({ mes: targetMes, ano: targetAno, ranking })
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar ranking' });
  }
});

app.get('/api/admin/cartelas', authenticate, requireAdmin, async (req, res) => {
  const { status, data_sorteio, search } = req.query;
  try {
    let query = supabase
      .from('cartelas')
      .select('*, vendedores(usuarios(nome))')
      .order('numero_cartela', { ascending: true })

    if (status) query = query.eq('status', status)
    if (data_sorteio) query = query.eq('data_sorteio', data_sorteio)
    if (search) {
      query = query.or(`numero_cartela.ilike.%${search}%,milhar1.ilike.%${search}%,milhar2.ilike.%${search}%,milhar3.ilike.%${search}%,milhar4.ilike.%${search}%`)
    }

    const { data: rows, error } = await query

    const mapped = (rows || []).map(r => ({
      ...r,
      vendedor_nome: r.vendedores?.usuarios?.nome || null,
      vendedores: undefined
    }))

    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar cartelas' });
  }
});

app.post('/api/admin/cartelas', authenticate, requireAdmin, async (req, res) => {
  const { numero_cartela, data_sorteio, milhar1, milhar2, milhar3, milhar4, valor, vendedor_id } = req.body;
  if (!numero_cartela || !data_sorteio || !milhar1 || !milhar2 || !milhar3 || !milhar4 || !vendedor_id) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios, incluindo o vendedor' });
  }
  try {
    const { data: exists } = await supabase
      .from('cartelas')
      .select('id')
      .eq('numero_cartela', numero_cartela)
      .maybeSingle()

    if (exists) {
      return res.status(400).json({ error: `Cartela de número ${numero_cartela} já existe` });
    }

    const { error } = await supabase
      .from('cartelas')
      .insert({
        numero_cartela, data_sorteio, milhar1, milhar2, milhar3, milhar4,
        valor: valor || 2.00, status: 'disponivel', vendedor_id
      })

    if (error) throw error
    res.status(201).json({ message: 'Cartela cadastrada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar cartela' });
  }
});

app.post('/api/admin/cartelas/gerar-lote', authenticate, requireAdmin, async (req, res) => {
  const { data_sorteio, quantidade, prefixo, vendedor_id } = req.body;
  if (!data_sorteio || !quantidade || quantidade <= 0 || !vendedor_id) {
    return res.status(400).json({ error: 'Data do sorteio, quantidade e vendedor são obrigatórios' });
  }

  const randMilhar = () => Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const pref = prefixo || '';

  try {
    const { data: existing } = await supabase
      .from('cartelas')
      .select('numero_cartela')
      .like('numero_cartela', `${pref}%`)

    const existingNums = new Set((existing || []).map(r => r.numero_cartela));

    const tickets = []
    let index = 1

    while (tickets.length < quantidade) {
      const numStr = pref + index.toString().padStart(3, '0');
      if (!existingNums.has(numStr)) {
        tickets.push({
          numero_cartela: numStr,
          data_sorteio,
          milhar1: randMilhar(),
          milhar2: randMilhar(),
          milhar3: randMilhar(),
          milhar4: randMilhar(),
          valor: 2.00,
          status: 'disponivel',
          vendedor_id
        })
      }
      index++
      if (index > 9999) {
        return res.status(400).json({ error: 'Limite de números de cartela atingido para este prefixo.' })
      }
    }

    const { error } = await supabase.from('cartelas').insert(tickets)
    if (error) throw error

    res.json({ message: `${tickets.length} cartelas geradas com sucesso!` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao gerar cartelas em lote' });
  }
});

async function getAdminVendedorId(adminUserId) {
  const { data: vend } = await supabase.from('vendedores').select('id').eq('usuario_id', adminUserId).maybeSingle()
  if (vend) return vend.id
  const { data: newVend } = await supabase.from('vendedores').insert({ usuario_id: adminUserId, ativo: 1 }).select().single()
  return newVend?.id || null
}

app.post('/api/admin/vender-milhares', authenticate, requireAdmin, async (req, res) => {
  const { milhares, data_sorteio, cliente_nome, cliente_telefone, metodo_pagamento } = req.body;

  if (!milhares || !data_sorteio || !cliente_nome || !cliente_telefone || !metodo_pagamento) {
    return res.status(400).json({ error: 'Preencha todos os dados da venda' });
  }

  const vendedor_id = await getAdminVendedorId(req.user.id)
  if (!vendedor_id) {
    return res.status(500).json({ error: 'Erro ao identificar vendedor admin' });
  }
  if (metodo_pagamento !== 'dinheiro' && metodo_pagamento !== 'pix') {
    return res.status(400).json({ error: 'Método de pagamento inválido' });
  }
  if (!Array.isArray(milhares) || milhares.length === 0 || milhares.length % 4 !== 0) {
    return res.status(400).json({ error: 'A quantidade de milhares deve ser múltipla de 4' });
  }
  for (const m of milhares) {
    if (!/^\d{4}$/.test(m)) {
      return res.status(400).json({ error: `Milhar inválido: "${m}". Cada milhar deve ter exatamente 4 dígitos.` });
    }
  }

  const { data: bloqueados } = await supabase
    .from('milhares_bloqueados')
    .select('milhar')
    .eq('data_sorteio', data_sorteio)
    .in('milhar', milhares)

  if (bloqueados && bloqueados.length > 0) {
    const nums = bloqueados.map(b => b.milhar)
    return res.status(400).json({ error: `ESSE MILHAR JA FOI VENDIDO: ${nums.join(', ')}` });
  }

  const { data: cartelasHoje } = await supabase
    .from('cartelas')
    .select('milhar1, milhar2, milhar3, milhar4')
    .eq('data_sorteio', data_sorteio)

  const vendidosHoje = new Set()
  for (const c of cartelasHoje || []) {
    if (c.milhar1) vendidosHoje.add(c.milhar1)
    if (c.milhar2) vendidosHoje.add(c.milhar2)
    if (c.milhar3) vendidosHoje.add(c.milhar3)
    if (c.milhar4) vendidosHoje.add(c.milhar4)
  }

  const repetidos = milhares.filter(m => vendidosHoje.has(m))
  if (repetidos.length > 0) {
    return res.status(400).json({ error: `ESSE MILHAR JA FOI VENDIDO: ${repetidos.join(', ')}` });
  }

  try {
    const { data: seller } = await supabase
      .from('vendedores')
      .select('ativo')
      .eq('id', vendedor_id)
      .maybeSingle()

    if (!seller || !seller.ativo) {
      return res.status(400).json({ error: 'Vendedor selecionado está inativo.' });
    }

    let { data: cliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('telefone', cliente_telefone)
      .maybeSingle()

    let cliente_id
    if (!cliente) {
      const { data: newCli, error: cliErr } = await supabase
        .from('clientes')
        .insert({ nome: cliente_nome, telefone: cliente_telefone })
        .select()
        .single()
      if (cliErr) throw cliErr
      cliente_id = newCli.id
    } else {
      cliente_id = cliente.id
      await supabase.from('clientes').update({ nome: cliente_nome }).eq('id', cliente_id)
    }

    const nowStr = new Date().toISOString()
    const valorPorCartela = 2.00

    const { count: totalCartelas } = await supabase
      .from('cartelas')
      .select('*', { count: 'exact', head: true })

    let startNum = (totalCartelas || 0) + 1
    const cartelasCriadas = []

    for (let i = 0; i < milhares.length; i += 4) {
      const grupo = milhares.slice(i, i + 4)
      const cartelaNum = 'AUTO' + String(startNum++).padStart(5, '0')

      const { data: cartela, error: cartErr } = await supabase
        .from('cartelas')
        .insert({
          numero_cartela: cartelaNum,
          data_sorteio,
          milhar1: grupo[0], milhar2: grupo[1], milhar3: grupo[2], milhar4: grupo[3],
          valor: valorPorCartela,
          status: 'vendida',
          vendedor_id
        })
        .select()
        .single()

      if (cartErr) throw cartErr
      cartelasCriadas.push(cartela)

      const { data: venda, error: vendErr } = await supabase
        .from('vendas')
        .insert({ cartela_id: cartela.id, vendedor_id, cliente_id, data_venda: nowStr, valor_venda: valorPorCartela })
        .select()
        .single()

      if (vendErr) throw vendErr

      const pStatus = metodo_pagamento === 'pix' ? 'pix_pendente' : 'pago'
      const pDate = metodo_pagamento === 'dinheiro' ? nowStr : null

      const { error: pagErr } = await supabase
        .from('pagamentos')
        .insert({ venda_id: venda.id, metodo: metodo_pagamento, status: pStatus, data_pagamento: pDate })

      if (pagErr) throw pagErr
    }

    const { data: vendData } = await supabase
      .from('vendedores')
      .select('usuarios(nome)')
      .eq('id', vendedor_id)
      .single()

    res.status(201).json({
      message: `Venda registrada com sucesso! ${cartelasCriadas.length} cartela(s) criada(s).`,
      vendedor_nome: vendData?.usuarios?.nome || 'Vendedor',
      data_venda: nowStr,
      cliente_nome,
      cliente_telefone,
      metodo_pagamento,
      cartelas: cartelasCriadas.map(c => ({
        id: c.id, numero_cartela: c.numero_cartela,
        milhares: [c.milhar1, c.milhar2, c.milhar3, c.milhar4]
      })),
      pixConfig: metodo_pagamento === 'pix' ? pixConfig : null,
      valor_premio: await getValorPremio()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar venda' });
  }
});

app.get('/api/admin/pix-settings', authenticate, async (req, res) => {
  res.json(pixConfig);
});

app.post('/api/admin/pix-settings', authenticate, requireAdmin, upload.single('qrcode'), (req, res) => {
  const { chave } = req.body;
  if (chave) pixConfig.chave = chave;
  if (req.file) {
    pixConfig.qrCodeUrl = `/uploads/pix_qrcode.png?t=${Date.now()}`;
  }
  res.json({ message: 'Dados do Pix atualizados com sucesso', config: pixConfig });
});

app.get('/api/admin/pix-pendentes', authenticate, requireAdmin, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('pagamentos')
      .select('*, vendas!inner(*, cartelas(*), vendedores(usuarios(nome)), clientes(*))')
      .eq('status', 'pix_pendente')
      .order('vendas(data_venda)', { ascending: false })

    const mapped = (rows || []).map(p => ({
      venda_id: p.vendas.id,
      numero_cartela: p.vendas.cartelas.numero_cartela,
      data_sorteio: p.vendas.cartelas.data_sorteio,
      cliente_nome: p.vendas.clientes.nome,
      cliente_telefone: p.vendas.clientes.telefone,
      vendedor_nome: p.vendas.vendedores.usuarios.nome,
      data_venda: p.vendas.data_venda,
      valor_venda: p.vendas.valor_venda
    }))

    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar Pix pendentes' });
  }
});

app.post('/api/admin/confirmar-pix/:vendaId', authenticate, requireAdmin, async (req, res) => {
  const { vendaId } = req.params;
  try {
    const pagoDate = new Date().toISOString();
    const { error } = await supabase
      .from('pagamentos')
      .update({ status: 'pago', data_pagamento: pagoDate })
      .eq('venda_id', vendaId)

    if (error) throw error
    res.json({ message: 'Pagamento Pix confirmado com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao confirmar pagamento' });
  }
});

app.post('/api/admin/resultado', authenticate, requireAdmin, async (req, res) => {
  const { data_sorteio, milhar_sorteada } = req.body;
  if (!data_sorteio || !milhar_sorteada || milhar_sorteada.length !== 4) {
    return res.status(400).json({ error: 'Data e milhar sorteada (4 dígitos) são obrigatórios' });
  }
  try {
    const { data: resExists } = await supabase
      .from('resultados')
      .select('id')
      .eq('data_sorteio', data_sorteio)
      .maybeSingle()

    if (resExists) {
      return res.status(400).json({ error: `Resultado para a data ${data_sorteio} já cadastrado` });
    }

    const now = new Date().toISOString();

    const { error: insertErr } = await supabase
      .from('resultados')
      .insert({ data_sorteio, milhar_sorteada, data_cadastro: now })

    if (insertErr) throw insertErr

    const { data: winningTickets } = await supabase
      .from('cartelas')
      .select('id')
      .eq('data_sorteio', data_sorteio)
      .eq('status', 'vendida')
      .or(`milhar1.eq.${milhar_sorteada},milhar2.eq.${milhar_sorteada},milhar3.eq.${milhar_sorteada},milhar4.eq.${milhar_sorteada}`)

    let premiadasCount = 0
    for (const t of winningTickets || []) {
      await supabase.from('cartelas').update({ status: 'premiada' }).eq('id', t.id)
      premiadasCount++
    }

    res.json({
      message: 'Resultado lançado com sucesso!',
      premiadas: premiadasCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao lançar resultado do sorteio' });
  }
});

app.get('/api/admin/relatorios', authenticate, requireAdmin, async (req, res) => {
  try {
    const { data: vendasPagas } = await supabase
      .from('pagamentos')
      .select('*, vendas!inner(valor_venda, data_venda, vendedor_id)')
      .eq('status', 'pago')

    const porDiaMap = {}
    const porVendedorMap = {}

    for (const p of vendasPagas || []) {
      const data = p.vendas.data_venda.split('T')[0]
      porDiaMap[data] = porDiaMap[data] || { quantidade: 0, total: 0 }
      porDiaMap[data].quantidade++
      porDiaMap[data].total += p.vendas.valor_venda

      const vid = p.vendas.vendedor_id
      porVendedorMap[vid] = porVendedorMap[vid] || { vendedor_id: vid, quantidade: 0, total: 0 }
      porVendedorMap[vid].quantidade++
      porVendedorMap[vid].total += p.vendas.valor_venda
    }

    const porDia = Object.entries(porDiaMap)
      .map(([data, vals]) => ({ data, ...vals }))
      .sort((a, b) => b.data.localeCompare(a.data))

    let porVendedor = Object.values(porVendedorMap)
      .sort((a, b) => b.total - a.total)

    for (const v of porVendedor) {
      const { data: vend } = await supabase
        .from('vendedores')
        .select('usuarios(nome)')
        .eq('id', v.vendedor_id)
        .single()
      v.vendedor_nome = vend?.usuarios?.nome || 'Desconhecido'
    }

    const { data: resultados } = await supabase
      .from('resultados')
      .select('*')
      .order('data_sorteio', { ascending: false })
      .limit(30)

    res.json({ porDia, porVendedor, resultados: resultados || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar relatórios' });
  }
});

// --- VENDEDOR ROUTES ---

app.get('/api/vendedor/cartelas', authenticate, requireVendedor, async (req, res) => {
  const { search } = req.query;
  const todayStr = new Date().toISOString().split('T')[0];
  const vendedor_id = req.user.vendedorId;

  try {
    let query = supabase
      .from('cartelas')
      .select('*')
      .eq('status', 'disponivel')
      .gte('data_sorteio', todayStr)
      .eq('vendedor_id', vendedor_id)
      .order('numero_cartela', { ascending: true })

    if (search) {
      query = query.or(`numero_cartela.ilike.%${search}%,milhar1.ilike.%${search}%,milhar2.ilike.%${search}%,milhar3.ilike.%${search}%,milhar4.ilike.%${search}%`)
    }

    const { data: rows, error } = await query

    if (error) throw error
    res.json(rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar cartelas disponíveis' });
  }
});

app.post('/api/vendedor/vender', authenticate, requireVendedor, async (req, res) => {
  const { cartela_id, cliente_nome, cliente_telefone, metodo_pagamento } = req.body;
  const vendedor_id = req.user.vendedorId;

  if (!cartela_id || !cliente_nome || !cliente_telefone || !metodo_pagamento) {
    return res.status(400).json({ error: 'Preencha todos os dados da venda' });
  }
  if (metodo_pagamento !== 'dinheiro' && metodo_pagamento !== 'pix') {
    return res.status(400).json({ error: 'Método de pagamento inválido' });
  }

  try {
    const { data: seller } = await supabase
      .from('vendedores')
      .select('ativo')
      .eq('id', vendedor_id)
      .maybeSingle()

    if (!seller || !seller.ativo) {
      return res.status(403).json({ error: 'Seu cadastro de vendedor está inativo. Vendas bloqueadas.' });
    }

    const { data: cartela } = await supabase
      .from('cartelas')
      .select('*')
      .eq('id', cartela_id)
      .maybeSingle()

    if (!cartela) {
      return res.status(404).json({ error: 'Cartela não encontrada' });
    }
    if (cartela.status !== 'disponivel') {
      return res.status(400).json({ error: 'Esta cartela já não está mais disponível para venda' });
    }

    let { data: cliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('telefone', cliente_telefone)
      .maybeSingle()

    let cliente_id
    if (!cliente) {
      const { data: newCli, error: cliErr } = await supabase
        .from('clientes')
        .insert({ nome: cliente_nome, telefone: cliente_telefone })
        .select()
        .single()
      if (cliErr) throw cliErr
      cliente_id = newCli.id
    } else {
      cliente_id = cliente.id
      await supabase.from('clientes').update({ nome: cliente_nome }).eq('id', cliente_id)
    }

    const nowStr = new Date().toISOString()
    const { data: venda, error: vendErr } = await supabase
      .from('vendas')
      .insert({
        cartela_id, vendedor_id, cliente_id,
        data_venda: nowStr, valor_venda: cartela.valor
      })
      .select()
      .single()

    if (vendErr) throw vendErr
    const venda_id = venda.id

    const pStatus = metodo_pagamento === 'pix' ? 'pix_pendente' : 'pago'
    const pDate = metodo_pagamento === 'dinheiro' ? nowStr : null

    const { error: pagErr } = await supabase
      .from('pagamentos')
      .insert({
        venda_id, metodo: metodo_pagamento,
        status: pStatus, data_pagamento: pDate
      })

    if (pagErr) throw pagErr

    const { error: updErr } = await supabase
      .from('cartelas')
      .update({ status: 'vendida' })
      .eq('id', cartela_id)

    if (updErr) throw updErr

    res.status(201).json({
      message: 'Venda registrada com sucesso!',
      vendaId: venda_id,
      pixConfig: metodo_pagamento === 'pix' ? pixConfig : null,
      valor_premio: await getValorPremio()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar venda' });
  }
});

app.post('/api/vendedor/vender-milhares', authenticate, requireVendedor, async (req, res) => {
  const { milhares, data_sorteio, cliente_nome, cliente_telefone, metodo_pagamento } = req.body;
  const vendedor_id = req.user.vendedorId;

  if (!milhares || !data_sorteio || !cliente_nome || !cliente_telefone || !metodo_pagamento) {
    return res.status(400).json({ error: 'Preencha todos os dados da venda' });
  }
  if (metodo_pagamento !== 'dinheiro' && metodo_pagamento !== 'pix') {
    return res.status(400).json({ error: 'Método de pagamento inválido' });
  }
  if (!Array.isArray(milhares) || milhares.length === 0 || milhares.length % 4 !== 0) {
    return res.status(400).json({ error: 'A quantidade de milhares deve ser múltipla de 4' });
  }
  for (const m of milhares) {
    if (!/^\d{4}$/.test(m)) {
      return res.status(400).json({ error: `Milhar inválido: "${m}". Cada milhar deve ter exatamente 4 dígitos.` });
    }
  }

  const { data: bloqueados } = await supabase
    .from('milhares_bloqueados')
    .select('milhar')
    .eq('data_sorteio', data_sorteio)
    .in('milhar', milhares)

  if (bloqueados && bloqueados.length > 0) {
    const nums = bloqueados.map(b => b.milhar)
    return res.status(400).json({ error: `ESSE MILHAR JA FOI VENDIDO: ${nums.join(', ')}` });
  }

  const { data: cartelasHoje } = await supabase
    .from('cartelas')
    .select('milhar1, milhar2, milhar3, milhar4')
    .eq('data_sorteio', data_sorteio)

  const vendidosHoje = new Set()
  for (const c of cartelasHoje || []) {
    if (c.milhar1) vendidosHoje.add(c.milhar1)
    if (c.milhar2) vendidosHoje.add(c.milhar2)
    if (c.milhar3) vendidosHoje.add(c.milhar3)
    if (c.milhar4) vendidosHoje.add(c.milhar4)
  }

  const repetidos = milhares.filter(m => vendidosHoje.has(m))
  if (repetidos.length > 0) {
    return res.status(400).json({ error: `ESSE MILHAR JA FOI VENDIDO: ${repetidos.join(', ')}` });
  }

  try {
    const { data: seller } = await supabase
      .from('vendedores')
      .select('ativo')
      .eq('id', vendedor_id)
      .maybeSingle()

    if (!seller || !seller.ativo) {
      return res.status(403).json({ error: 'Seu cadastro de vendedor está inativo. Vendas bloqueadas.' });
    }

    let { data: cliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('telefone', cliente_telefone)
      .maybeSingle()

    let cliente_id
    if (!cliente) {
      const { data: newCli, error: cliErr } = await supabase
        .from('clientes')
        .insert({ nome: cliente_nome, telefone: cliente_telefone })
        .select()
        .single()
      if (cliErr) throw cliErr
      cliente_id = newCli.id
    } else {
      cliente_id = cliente.id
      await supabase.from('clientes').update({ nome: cliente_nome }).eq('id', cliente_id)
    }

    const nowStr = new Date().toISOString()
    const valorPorCartela = 2.00

    const { count: totalCartelas } = await supabase
      .from('cartelas')
      .select('*', { count: 'exact', head: true })

    let startNum = (totalCartelas || 0) + 1

    const vendasCriadas = []
    const cartelasCriadas = []

    for (let i = 0; i < milhares.length; i += 4) {
      const grupo = milhares.slice(i, i + 4)
      const cartelaNum = 'AUTO' + String(startNum++).padStart(5, '0')

      const { data: cartela, error: cartErr } = await supabase
        .from('cartelas')
        .insert({
          numero_cartela: cartelaNum,
          data_sorteio,
          milhar1: grupo[0],
          milhar2: grupo[1],
          milhar3: grupo[2],
          milhar4: grupo[3],
          valor: valorPorCartela,
          status: 'vendida',
          vendedor_id
        })
        .select()
        .single()

      if (cartErr) throw cartErr
      cartelasCriadas.push(cartela)

      const { data: venda, error: vendErr } = await supabase
        .from('vendas')
        .insert({
          cartela_id: cartela.id,
          vendedor_id,
          cliente_id,
          data_venda: nowStr,
          valor_venda: valorPorCartela
        })
        .select()
        .single()

      if (vendErr) throw vendErr

      const pStatus = metodo_pagamento === 'pix' ? 'pix_pendente' : 'pago'
      const pDate = metodo_pagamento === 'dinheiro' ? nowStr : null

      const { error: pagErr } = await supabase
        .from('pagamentos')
        .insert({
          venda_id: venda.id,
          metodo: metodo_pagamento,
          status: pStatus,
          data_pagamento: pDate
        })

      if (pagErr) throw pagErr

      vendasCriadas.push(venda)
    }

    const { data: vendData } = await supabase
      .from('vendedores')
      .select('usuarios(nome)')
      .eq('id', vendedor_id)
      .single()

    res.status(201).json({
      message: `Venda registrada com sucesso! ${cartelasCriadas.length} cartela(s) criada(s).`,
      vendedor_nome: vendData?.usuarios?.nome || 'Vendedor',
      data_venda: nowStr,
      cliente_nome,
      cliente_telefone,
      metodo_pagamento,
      cartelas: cartelasCriadas.map(c => ({
        id: c.id,
        numero_cartela: c.numero_cartela,
        milhares: [c.milhar1, c.milhar2, c.milhar3, c.milhar4]
      })),
      pixConfig: metodo_pagamento === 'pix' ? pixConfig : null,
      valor_premio: await getValorPremio()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar venda' });
  }
});

app.get('/api/vendedor/dashboard', authenticate, requireVendedor, async (req, res) => {
  const vendedor_id = req.user.vendedorId;
  const todayStr = new Date().toISOString().split('T')[0];
  const monthStr = todayStr.slice(0, 7);

  try {
    const { data: vendasHoje, error: err1 } = await supabase
      .from('vendas')
      .select('id, valor_venda, pagamentos!inner(metodo, status)')
      .eq('vendedor_id', vendedor_id)
      .ilike('data_venda', `${todayStr}%`)

    if (err1) throw err1

    const { data: vendasMes, error: err2 } = await supabase
      .from('vendas')
      .select('id, valor_venda, pagamentos!inner(metodo, status)')
      .eq('vendedor_id', vendedor_id)
      .ilike('data_venda', `${monthStr}%`)

    if (err2) throw err2

    const { count: totalCartelasVendidas, error: err3 } = await supabase
      .from('vendas')
      .select('*', { count: 'exact', head: true })
      .eq('vendedor_id', vendedor_id)

    if (err3) throw err3

    function calcStats(vendas) {
      let total = 0, pago = 0, pendente = 0, qtdTotal = 0, qtdPaga = 0
      for (const v of vendas || []) {
        const pg = v.pagamentos
        total += v.valor_venda
        qtdTotal++
        if (pg?.status === 'pago') {
          pago += v.valor_venda
          qtdPaga++
        } else {
          pendente += v.valor_venda
        }
      }
      return { total, pago, pendente, qtdTotal, qtdPaga }
    }

    const hoje = calcStats(vendasHoje)
    const mes = calcStats(vendasMes)
    const comissaoPercentual = 50
    const comissaoHoje = hoje.pago * (comissaoPercentual / 100)
    const comissaoMes = mes.pago * (comissaoPercentual / 100)

    res.json({
      hoje: {
        quantidade: hoje.qtdTotal,
        valorTotal: hoje.total,
        valorPago: hoje.pago,
        valorPendente: hoje.pendente,
        comissao: comissaoHoje
      },
      mes: {
        quantidade: mes.qtdTotal,
        valorTotal: mes.total,
        valorPago: mes.pago,
        valorPendente: mes.pendente,
        comissao: comissaoMes
      },
      totalCartelasVendidas: totalCartelasVendidas || 0,
      comissaoPercentual
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

app.get('/api/vendedor/vendas-dia', authenticate, requireVendedor, async (req, res) => {
  const vendedor_id = req.user.vendedorId;
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    const { data: rows, error } = await supabase
      .from('vendas')
      .select('*, cartelas(numero_cartela), clientes(nome)')
      .eq('vendedor_id', vendedor_id)
      .ilike('data_venda', `${todayStr}%`)
      .order('data_venda', { ascending: false })

    if (error) throw error

    const vendaIds = (rows || []).map(v => v.id)
    const { data: pagRows } = await supabase
      .from('pagamentos')
      .select('venda_id, metodo, status')
      .in('venda_id', vendaIds)

    const pagMap = {}
    for (const p of pagRows || []) {
      pagMap[p.venda_id] = p
    }

    const mapped = (rows || []).map(v => {
      const pag = pagMap[v.id] || {}
      return {
        venda_id: v.id,
        data_venda: v.data_venda,
        valor_venda: v.valor_venda,
        numero_cartela: v.cartelas?.numero_cartela,
        cliente_nome: v.clientes?.nome,
        metodo: pag.metodo || 'dinheiro',
        pagamento_status: pag.status || (pag.metodo === 'dinheiro' ? 'pago' : 'pix_pendente')
      }
    })

    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar vendas do dia' });
  }
});

app.get('/api/admin/vendas', authenticate, requireAdmin, async (req, res) => {
  const { search, vendedor_id, data_inicio, data_fim } = req.query;

  try {
    let query = supabase
      .from('vendas')
      .select('*, cartelas(*), clientes(nome, telefone), vendedores(usuarios(nome))')
      .order('data_venda', { ascending: false })
      .limit(500)

    if (vendedor_id) query = query.eq('vendedor_id', vendedor_id)
    if (data_inicio) query = query.gte('data_venda', `${data_inicio}T00:00:00`)
    if (data_fim) query = query.lte('data_venda', `${data_fim}T23:59:59`)

    const { data: rows, error } = await query
    if (error) throw error

    const vendaIds = (rows || []).map(v => v.id)
    const { data: pagRows } = await supabase
      .from('pagamentos')
      .select('venda_id, metodo, status')
      .in('venda_id', vendaIds)

    const pagMap = {}
    for (const p of pagRows || []) {
      pagMap[p.venda_id] = p
    }

    let mapped = (rows || []).map(v => {
      const pag = pagMap[v.id] || {}
      return {
        venda_id: v.id,
        data_venda: v.data_venda,
        valor_venda: v.valor_venda,
        cliente_nome: v.clientes?.nome,
        cliente_telefone: v.clientes?.telefone,
        vendedor_nome: v.vendedores?.usuarios?.nome || 'Desconhecido',
        vendedor_id: v.vendedor_id,
        metodo: pag.metodo || 'dinheiro',
        pagamento_status: pag.status || (pag.metodo === 'dinheiro' ? 'pago' : 'pix_pendente'),
        cartela: v.cartelas ? {
          id: v.cartelas.id,
          numero_cartela: v.cartelas.numero_cartela,
          data_sorteio: v.cartelas.data_sorteio,
          milhares: [v.cartelas.milhar1, v.cartelas.milhar2, v.cartelas.milhar3, v.cartelas.milhar4]
        } : null
      }
    })

    if (search) {
      const s = search.toLowerCase()
      mapped = mapped.filter(v =>
        (v.cartela?.numero_cartela || '').toLowerCase().includes(s) ||
        (v.cliente_nome || '').toLowerCase().includes(s) ||
        (v.cliente_telefone || '').includes(s) ||
        (v.vendedor_nome || '').toLowerCase().includes(s)
      )
    }

    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar vendas' });
  }
});

app.get('/api/vendedor/vendas', authenticate, requireVendedor, async (req, res) => {
  const vendedor_id = req.user.vendedorId;
  const { search, data_inicio, data_fim } = req.query;

  try {
    let query = supabase
      .from('vendas')
      .select('*, cartelas(*), clientes(nome, telefone)')
      .eq('vendedor_id', vendedor_id)
      .order('data_venda', { ascending: false })
      .limit(500)

    if (data_inicio) query = query.gte('data_venda', `${data_inicio}T00:00:00`)
    if (data_fim) query = query.lte('data_venda', `${data_fim}T23:59:59`)

    const { data: rows, error } = await query
    if (error) throw error

    const vendaIds = (rows || []).map(v => v.id)
    const { data: pagRows } = await supabase
      .from('pagamentos')
      .select('venda_id, metodo, status')
      .in('venda_id', vendaIds)

    const pagMap = {}
    for (const p of pagRows || []) {
      pagMap[p.venda_id] = p
    }

    let mapped = (rows || []).map(v => {
      const pag = pagMap[v.id] || {}
      return {
        venda_id: v.id,
        data_venda: v.data_venda,
        valor_venda: v.valor_venda,
        cliente_nome: v.clientes?.nome,
        cliente_telefone: v.clientes?.telefone,
        metodo: pag.metodo || 'dinheiro',
        pagamento_status: pag.status || (pag.metodo === 'dinheiro' ? 'pago' : 'pix_pendente'),
        cartela: v.cartelas ? {
          id: v.cartelas.id,
          numero_cartela: v.cartelas.numero_cartela,
          data_sorteio: v.cartelas.data_sorteio,
          milhares: [v.cartelas.milhar1, v.cartelas.milhar2, v.cartelas.milhar3, v.cartelas.milhar4]
        } : null
      }
    })

    if (search) {
      const s = search.toLowerCase()
      mapped = mapped.filter(v =>
        (v.cartela?.numero_cartela || '').toLowerCase().includes(s) ||
        (v.cliente_nome || '').toLowerCase().includes(s) ||
        (v.cliente_telefone || '').includes(s)
      )
    }

    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar vendas do vendedor' });
  }
});

app.get('/api/vendedor/vendas/:id/cupom', authenticate, requireVendedor, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: venda, error } = await supabase
      .from('vendas')
      .select('*, cartelas(*), clientes(*), vendedores(usuarios(nome))')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!venda) return res.status(404).json({ error: 'Venda não encontrada' })
    if (venda.vendedor_id !== req.user.vendedorId) return res.status(403).json({ error: 'Acesso negado' })

    const { data: pagRow } = await supabase
      .from('pagamentos')
      .select('metodo')
      .eq('venda_id', id)
      .maybeSingle()

    const metodo_pagamento = pagRow?.metodo || 'dinheiro'

    res.json({
      vendedor_nome: venda.vendedores?.usuarios?.nome || 'Desconhecido',
      data_venda: venda.data_venda,
      cliente_nome: venda.clientes?.nome,
      cliente_telefone: venda.clientes?.telefone,
      metodo_pagamento,
      cartelas: [{
        id: venda.cartelas.id,
        numero_cartela: venda.cartelas.numero_cartela,
        milhares: [venda.cartelas.milhar1, venda.cartelas.milhar2, venda.cartelas.milhar3, venda.cartelas.milhar4]
      }],
      valor_premio: await getValorPremio()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dados do cupom' });
  }
});

app.get('/api/admin/vendas/:id/cupom', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: venda, error } = await supabase
      .from('vendas')
      .select('*, cartelas(*), clientes(*), vendedores(usuarios(nome))')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!venda) return res.status(404).json({ error: 'Venda não encontrada' })

    const { data: pagRow } = await supabase
      .from('pagamentos')
      .select('metodo')
      .eq('venda_id', id)
      .maybeSingle()

    const metodo_pagamento = pagRow?.metodo || 'dinheiro'

    res.json({
      vendedor_nome: venda.vendedores?.usuarios?.nome || 'Desconhecido',
      data_venda: venda.data_venda,
      cliente_nome: venda.clientes?.nome,
      cliente_telefone: venda.clientes?.telefone,
      metodo_pagamento,
      cartelas: [{
        id: venda.cartelas.id,
        numero_cartela: venda.cartelas.numero_cartela,
        milhares: [venda.cartelas.milhar1, venda.cartelas.milhar2, venda.cartelas.milhar3, venda.cartelas.milhar4]
      }],
      valor_premio: await getValorPremio()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dados do cupom' });
  }
});

// Bloqueio de Milhares
app.get('/api/admin/milhares-bloqueados', authenticate, requireAdmin, async (req, res) => {
  const { data_sorteio } = req.query;
  try {
    let query = supabase.from('milhares_bloqueados').select('*').order('data_cadastro', { ascending: false })
    if (data_sorteio) query = query.eq('data_sorteio', data_sorteio)
    const { data, error } = await query
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    console.error(err);
    if (err.code === '42P01' || (err.message || '').includes('does not exist')) {
      return res.status(500).json({ error: 'TABELA_AUSENTE' });
    }
    res.status(500).json({ error: 'Erro ao buscar milhares bloqueados' });
  }
});

app.post('/api/admin/bloquear-milhar', authenticate, requireAdmin, async (req, res) => {
  const { milhar, data_sorteio } = req.body
  if (!milhar || !data_sorteio) return res.status(400).json({ error: 'Informe o milhar e a data do sorteio' })
  if (!/^\d{4}$/.test(milhar)) return res.status(400).json({ error: 'Milhar deve ter exatamente 4 dígitos' })

  try {
    const { error } = await supabase.from('milhares_bloqueados').insert({
      milhar, data_sorteio, data_cadastro: new Date().toISOString()
    })
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Este milhar já está bloqueado para esta data' })
      throw error
    }
    res.status(201).json({ message: `Milhar ${milhar} bloqueado para ${data_sorteio}` })
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao bloquear milhar' });
  }
});

app.delete('/api/admin/milhares-bloqueados/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params
  try {
    const { error } = await supabase.from('milhares_bloqueados').delete().eq('id', id)
    if (error) throw error
    res.json({ message: 'Bloqueio removido' })
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover bloqueio' });
  }
});

initDb().catch(err => {
  console.error("Erro ao inicializar o banco de dados:", err);
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse em http://localhost:${PORT}`);
  });
}

module.exports = app;
