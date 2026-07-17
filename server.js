const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const {
  dbInit,
  initDb,
  dbRun,
  dbGet,
  dbAll,
  hashPassword
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Token Secret
const SECRET = "asorteesuasecreto123_456789";

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

// Middleware to authenticate
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
  
  const token = authHeader.split(' ')[1];
  const user = verifyToken(token);
  if (!user) return res.status(403).json({ error: 'Token inválido ou expirado' });
  
  req.user = user;
  next();
}

// Middleware to check if Admin
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado: Requer administrador' });
  }
  next();
}

// Middleware to check if Vendedor
function requireVendedor(req, res, next) {
  if (req.user.role !== 'vendedor') {
    return res.status(403).json({ error: 'Acesso negado: Requer vendedor' });
  }
  next();
}

app.use(cors());
app.use(express.json());

// Create uploads folder if not exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Set up file storage for QR Code
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, 'pix_qrcode.png');
  }
});
const upload = multer({ storage: storage });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store Pix details in a simple JSON or SQLite setting
let pixConfig = {
  chave: 'financeiro@asorteesua.com',
  qrCodeUrl: '/uploads/pix_qrcode.png'
};

// Check if a default QR Code exists. If not, write an empty file or dummy image
const qrcodeFile = path.join(uploadsDir, 'pix_qrcode.png');
if (!fs.existsSync(qrcodeFile)) {
  // We can write a 1x1 transparent PNG or simple empty placeholder
  // A simple 1x1 pixel base64 PNG
  const dummyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(qrcodeFile, dummyPng);
}

// --- AUTH ROUTES ---

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Preencha usuário e senha' });
  }
  try {
    const user = await dbGet("SELECT * FROM usuarios WHERE username = ?", [username]);
    if (!user) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    const hashed = hashPassword(password);
    if (user.password !== hashed) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    let vendedorId = null;
    if (user.role === 'vendedor') {
      const vend = await dbGet("SELECT id FROM vendedores WHERE usuario_id = ?", [user.id]);
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

// GET /api/admin/dashboard
app.get('/api/admin/dashboard', authenticate, requireAdmin, async (req, res) => {
  try {
    const total = await dbGet("SELECT COUNT(*) as count FROM cartelas");
    const vendidas = await dbGet("SELECT COUNT(*) as count FROM cartelas WHERE status = 'vendida'");
    const disponiveis = await dbGet("SELECT COUNT(*) as count FROM cartelas WHERE status = 'disponivel'");
    const premiadas = await dbGet("SELECT COUNT(*) as count FROM cartelas WHERE status = 'premiada'");
    
    // Total R$ sold: only counted where payment status is 'pago' (Cash or Pix confirmed)
    const faturamento = await dbGet(`
      SELECT SUM(v.valor_venda) as total 
      FROM vendas v 
      JOIN pagamentos p ON v.id = p.venda_id 
      WHERE p.status = 'pago'
    `);

    // Pending Pix
    const pixPendentes = await dbGet(`
      SELECT COUNT(*) as count, SUM(v.valor_venda) as total
      FROM vendas v
      JOIN pagamentos p ON v.id = p.venda_id
      WHERE p.status = 'pix_pendente'
    `);

    res.json({
      totalCartelas: total.count,
      cartelasVendidas: vendidas.count + premiadas.count, // A premiada também é vendida
      cartelasDisponiveis: disponiveis.count,
      cartelasPremiadas: premiadas.count,
      faturamento: faturamento.total || 0,
      pixPendentesCount: pixPendentes.count || 0,
      pixPendentesTotal: pixPendentes.total || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dados do dashboard' });
  }
});

// GET /api/admin/vendedores
app.get('/api/admin/vendedores', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT u.id as usuario_id, u.username, u.nome, v.id as vendedor_id, v.telefone, v.ativo
      FROM usuarios u
      JOIN vendedores v ON u.id = v.usuario_id
      WHERE u.role = 'vendedor'
      ORDER BY u.nome ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar vendedores' });
  }
});

// POST /api/admin/vendedores
app.post('/api/admin/vendedores', authenticate, requireAdmin, async (req, res) => {
  const { username, password, nome, telefone } = req.body;
  if (!username || !password || !nome) {
    return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios' });
  }
  try {
    const userExists = await dbGet("SELECT id FROM usuarios WHERE username = ?", [username]);
    if (userExists) {
      return res.status(400).json({ error: 'Nome de usuário já cadastrado' });
    }

    const hashed = hashPassword(password);
    
    // Begin transaction manual
    await dbRun("BEGIN TRANSACTION");
    try {
      const userRes = await dbRun(
        "INSERT INTO usuarios (username, password, role, nome) VALUES (?, ?, 'vendedor', ?)",
        [username, hashed, nome]
      );
      const usuarioId = userRes.lastID;
      await dbRun(
        "INSERT INTO vendedores (usuario_id, telefone) VALUES (?, ?)",
        [usuarioId, telefone || '']
      );
      await dbRun("COMMIT");
      res.status(201).json({ message: 'Vendedor cadastrado com sucesso' });
    } catch (txErr) {
      await dbRun("ROLLBACK");
      throw txErr;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar vendedor' });
  }
});

// POST /api/admin/vendedores/toggle
app.post('/api/admin/vendedores/toggle', authenticate, requireAdmin, async (req, res) => {
  const { vendedor_id, ativo } = req.body;
  try {
    await dbRun("UPDATE vendedores SET ativo = ? WHERE id = ?", [ativo, vendedor_id]);
    res.json({ message: 'Status do vendedor atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar status do vendedor' });
  }
});

// GET /api/admin/cartelas
app.get('/api/admin/cartelas', authenticate, requireAdmin, async (req, res) => {
  const { status, data_sorteio, search } = req.query;
  let sql = `
    SELECT c.*, uv.nome as vendedor_nome 
    FROM cartelas c
    LEFT JOIN vendedores v ON c.vendedor_id = v.id
    LEFT JOIN usuarios uv ON v.usuario_id = uv.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += " AND c.status = ?";
    params.push(status);
  }
  if (data_sorteio) {
    sql += " AND c.data_sorteio = ?";
    params.push(data_sorteio);
  }
  if (search) {
    sql += " AND (c.numero_cartela LIKE ? OR c.milhar1 LIKE ? OR c.milhar2 LIKE ? OR c.milhar3 LIKE ? OR c.milhar4 LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  sql += " ORDER BY c.numero_cartela ASC";

  try {
    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar cartelas' });
  }
});

// POST /api/admin/cartelas (Single Creation)
app.post('/api/admin/cartelas', authenticate, requireAdmin, async (req, res) => {
  const { numero_cartela, data_sorteio, milhar1, milhar2, milhar3, milhar4, valor, vendedor_id } = req.body;
  if (!numero_cartela || !data_sorteio || !milhar1 || !milhar2 || !milhar3 || !milhar4 || !vendedor_id) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios, incluindo o vendedor' });
  }
  try {
    const exists = await dbGet("SELECT id FROM cartelas WHERE numero_cartela = ?", [numero_cartela]);
    if (exists) {
      return res.status(400).json({ error: `Cartela de número ${numero_cartela} já existe` });
    }
    await dbRun(
      `INSERT INTO cartelas (numero_cartela, data_sorteio, milhar1, milhar2, milhar3, milhar4, valor, status, vendedor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'disponivel', ?)`,
      [numero_cartela, data_sorteio, milhar1, milhar2, milhar3, milhar4, valor || 2.00, vendedor_id]
    );
    res.status(201).json({ message: 'Cartela cadastrada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar cartela' });
  }
});

// POST /api/admin/cartelas/gerar-lote (Bulk Generate)
app.post('/api/admin/cartelas/gerar-lote', authenticate, requireAdmin, async (req, res) => {
  const { data_sorteio, quantidade, prefixo, vendedor_id } = req.body;
  if (!data_sorteio || !quantidade || quantidade <= 0 || !vendedor_id) {
    return res.status(400).json({ error: 'Data do sorteio, quantidade e vendedor são obrigatórios' });
  }
  
  const randMilhar = () => Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const pref = prefixo || '';

  try {
    // We will find the next number to avoid collisions
    const existing = await dbAll("SELECT numero_cartela FROM cartelas WHERE numero_cartela LIKE ?", [`${pref}%`]);
    const existingNums = new Set(existing.map(r => r.numero_cartela));

    await dbRun("BEGIN TRANSACTION");
    let generated = 0;
    let index = 1;

    try {
      while (generated < quantidade) {
        const numStr = pref + index.toString().padStart(3, '0');
        if (!existingNums.has(numStr)) {
          await dbRun(
            `INSERT INTO cartelas (numero_cartela, data_sorteio, milhar1, milhar2, milhar3, milhar4, valor, status, vendedor_id)
             VALUES (?, ?, ?, ?, ?, ?, 2.00, 'disponivel', ?)`,
            [numStr, data_sorteio, randMilhar(), randMilhar(), randMilhar(), randMilhar(), vendedor_id]
          );
          generated++;
        }
        index++;
        if (index > 9999) {
          throw new Error('Limite de números de cartela atingido para este prefixo.');
        }
      }
      await dbRun("COMMIT");
      res.json({ message: `${generated} cartelas geradas com sucesso!` });
    } catch (txErr) {
      await dbRun("ROLLBACK");
      throw txErr;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro ao gerar cartelas em lote' });
  }
});

// GET /api/admin/pix-settings
app.get('/api/admin/pix-settings', authenticate, async (req, res) => {
  res.json(pixConfig);
});

// POST /api/admin/pix-settings (Update key and QR code image)
app.post('/api/admin/pix-settings', authenticate, requireAdmin, upload.single('qrcode'), (req, res) => {
  const { chave } = req.body;
  if (chave) pixConfig.chave = chave;
  if (req.file) {
    // Cache bust query parameter just in case
    pixConfig.qrCodeUrl = `/uploads/pix_qrcode.png?t=${Date.now()}`;
  }
  res.json({ message: 'Dados do Pix atualizados com sucesso', config: pixConfig });
});

// GET /api/admin/pix-pendentes
app.get('/api/admin/pix-pendentes', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT v.id as venda_id, c.numero_cartela, c.data_sorteio, cli.nome as cliente_nome, cli.telefone as cliente_telefone,
             uv.nome as vendedor_nome, v.data_venda, v.valor_venda
      FROM vendas v
      JOIN cartelas c ON v.cartela_id = c.id
      JOIN clientes cli ON v.cliente_id = cli.id
      JOIN vendedores ven ON v.vendedor_id = ven.id
      JOIN usuarios uv ON ven.usuario_id = uv.id
      JOIN pagamentos p ON v.id = p.venda_id
      WHERE p.status = 'pix_pendente'
      ORDER BY v.data_venda DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar Pix pendentes' });
  }
});

// POST /api/admin/confirmar-pix/:vendaId
app.post('/api/admin/confirmar-pix/:vendaId', authenticate, requireAdmin, async (req, res) => {
  const { vendaId } = req.params;
  try {
    const pagoDate = new Date().toISOString();
    await dbRun("BEGIN TRANSACTION");
    try {
      await dbRun(
        "UPDATE pagamentos SET status = 'pago', data_pagamento = ? WHERE venda_id = ?",
        [pagoDate, vendaId]
      );
      // Wait, is the ticket status marked as 'vendida' already? Yes, when sold it is marked as 'vendida'.
      // If it is confirmed, it stays 'vendida' (but payment is updated).
      await dbRun("COMMIT");
      res.json({ message: 'Pagamento Pix confirmado com sucesso!' });
    } catch (txErr) {
      await dbRun("ROLLBACK");
      throw txErr;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao confirmar pagamento' });
  }
});

// POST /api/admin/resultado (Cadastra resultado e confere prêmios)
app.post('/api/admin/resultado', authenticate, requireAdmin, async (req, res) => {
  const { data_sorteio, milhar_sorteada } = req.body;
  if (!data_sorteio || !milhar_sorteada || milhar_sorteada.length !== 4) {
    return res.status(400).json({ error: 'Data e milhar sorteada (4 dígitos) são obrigatórios' });
  }
  try {
    const resExists = await dbGet("SELECT id FROM resultados WHERE data_sorteio = ?", [data_sorteio]);
    if (resExists) {
      return res.status(400).json({ error: `Resultado para a data ${data_sorteio} já cadastrado` });
    }

    const now = new Date().toISOString();
    await dbRun("BEGIN TRANSACTION");
    try {
      // Cadastra o resultado
      await dbRun(
        "INSERT INTO resultados (data_sorteio, milhar_sorteada, data_cadastro) VALUES (?, ?, ?)",
        [data_sorteio, milhar_sorteada, now]
      );

      // Busca cartelas vendidas daquela data que contêm a milhar sorteada em um dos 4 campos
      // O status da cartela precisa ser 'vendida' (não disponível ou cancelada)
      const winningTickets = await dbAll(`
        SELECT id FROM cartelas 
        WHERE data_sorteio = ? 
          AND status = 'vendida'
          AND (milhar1 = ? OR milhar2 = ? OR milhar3 = ? OR milhar4 = ?)
      `, [data_sorteio, milhar_sorteada, milhar_sorteada, milhar_sorteada, milhar_sorteada]);

      let premiadasCount = 0;
      for (const t of winningTickets) {
        await dbRun("UPDATE cartelas SET status = 'premiada' WHERE id = ?", [t.id]);
        premiadasCount++;
      }

      await dbRun("COMMIT");
      res.json({ 
        message: 'Resultado lançado com sucesso!',
        premiadas: premiadasCount
      });
    } catch (txErr) {
      await dbRun("ROLLBACK");
      throw txErr;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao lançar resultado do sorteio' });
  }
});

// GET /api/admin/relatorios
app.get('/api/admin/relatorios', authenticate, requireAdmin, async (req, res) => {
  try {
    // Relatório por dia
    const porDia = await dbAll(`
      SELECT DATE(v.data_venda) as data, COUNT(v.id) as quantidade, SUM(v.valor_venda) as total
      FROM vendas v
      JOIN pagamentos p ON v.id = p.venda_id
      WHERE p.status = 'pago'
      GROUP BY DATE(v.data_venda)
      ORDER BY data DESC
    `);

    // Relatório por vendedor
    const porVendedor = await dbAll(`
      SELECT uv.nome as vendedor_nome, COUNT(v.id) as quantidade, SUM(v.valor_venda) as total
      FROM vendas v
      JOIN vendedores ven ON v.vendedor_id = ven.id
      JOIN usuarios uv ON ven.usuario_id = uv.id
      JOIN pagamentos p ON v.id = p.venda_id
      WHERE p.status = 'pago'
      GROUP BY v.vendedor_id
      ORDER BY total DESC
    `);

    // Resultados cadastrados
    const resultados = await dbAll(`
      SELECT * FROM resultados ORDER BY data_sorteio DESC LIMIT 30
    `);

    res.json({ porDia, porVendedor, resultados });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar relatórios' });
  }
});

// --- VENDEDOR ROUTES ---

// GET /api/vendedor/cartelas
app.get('/api/vendedor/cartelas', authenticate, requireVendedor, async (req, res) => {
  const { search } = req.query;
  const todayStr = new Date().toISOString().split('T')[0];
  const vendedor_id = req.user.vendedorId;
  
  let sql = "SELECT * FROM cartelas WHERE status = 'disponivel' AND data_sorteio >= ? AND vendedor_id = ?";
  const params = [todayStr, vendedor_id];

  if (search) {
    sql += " AND (numero_cartela LIKE ? OR milhar1 LIKE ? OR milhar2 LIKE ? OR milhar3 LIKE ? OR milhar4 LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  sql += " ORDER BY numero_cartela ASC";

  try {
    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar cartelas disponíveis' });
  }
});

// POST /api/vendedor/vender
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
    // Check if seller is active
    const seller = await dbGet("SELECT ativo FROM vendedores WHERE id = ?", [vendedor_id]);
    if (!seller || !seller.ativo) {
      return res.status(403).json({ error: 'Seu cadastro de vendedor está inativo. Vendas bloqueadas.' });
    }

    // Check if ticket is available
    const cartela = await dbGet("SELECT * FROM cartelas WHERE id = ?", [cartela_id]);
    if (!cartela) {
      return res.status(404).json({ error: 'Cartela não encontrada' });
    }
    if (cartela.status !== 'disponivel') {
      return res.status(400).json({ error: 'Esta cartela já não está mais disponível para venda' });
    }

    await dbRun("BEGIN TRANSACTION");
    try {
      // Find or insert client
      let cliente = await dbGet("SELECT id FROM clientes WHERE telefone = ?", [cliente_telefone]);
      let cliente_id;
      if (!cliente) {
        const cliRes = await dbRun(
          "INSERT INTO clientes (nome, telefone) VALUES (?, ?)",
          [cliente_nome, cliente_telefone]
        );
        cliente_id = cliRes.lastID;
      } else {
        cliente_id = cliente.id;
        // Optionally update client name
        await dbRun("UPDATE clientes SET nome = ? WHERE id = ?", [cliente_nome, cliente_id]);
      }

      // Record sales
      const nowStr = new Date().toISOString();
      const vendaRes = await dbRun(
        "INSERT INTO vendas (cartela_id, vendedor_id, cliente_id, data_venda, valor_venda) VALUES (?, ?, ?, ?, ?)",
        [cartela_id, vendedor_id, cliente_id, nowStr, cartela.valor]
      );
      const venda_id = vendaRes.lastID;

      // Record payment
      const pStatus = metodo_pagamento === 'pix' ? 'pix_pendente' : 'pago';
      const pDate = metodo_pagamento === 'dinheiro' ? nowStr : null;
      await dbRun(
        "INSERT INTO pagamentos (venda_id, metodo, status, data_pagamento) VALUES (?, ?, ?, ?)",
        [venda_id, metodo_pagamento, pStatus, pDate]
      );

      // Update ticket status
      await dbRun("UPDATE cartelas SET status = 'vendida' WHERE id = ?", [cartela_id]);

      await dbRun("COMMIT");
      res.status(201).json({ 
        message: 'Venda registrada com sucesso!',
        vendaId: venda_id,
        pixConfig: metodo_pagamento === 'pix' ? pixConfig : null
      });
    } catch (txErr) {
      await dbRun("ROLLBACK");
      throw txErr;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar venda' });
  }
});

// GET /api/vendedor/vendas-dia
app.get('/api/vendedor/vendas-dia', authenticate, requireVendedor, async (req, res) => {
  const vendedor_id = req.user.vendedorId;
  const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD local prefix
  try {
    const rows = await dbAll(`
      SELECT v.id as venda_id, v.data_venda, v.valor_venda, c.numero_cartela, cli.nome as cliente_nome, p.metodo, p.status as pagamento_status
      FROM vendas v
      JOIN cartelas c ON v.cartela_id = c.id
      JOIN clientes cli ON v.cliente_id = cli.id
      JOIN pagamentos p ON v.id = p.venda_id
      WHERE v.vendedor_id = ? AND v.data_venda LIKE ?
      ORDER BY v.data_venda DESC
    `, [vendedor_id, `${todayStr}%`]);
    
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar vendas do dia' });
  }
});

// Start DB then server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
      console.log(`Acesse em http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error("Erro ao inicializar o banco de dados:", err);
  });
