const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbPath = path.resolve(__dirname, 'asorteesua.db');
const db = new sqlite3.Database(dbPath);

// Helper function to hash passwords
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Promisified DB helpers
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  // Create tables
  await dbRun(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL, -- 'admin' ou 'vendedor'
      nome TEXT NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS vendedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER UNIQUE NOT NULL,
      telefone TEXT,
      ativo INTEGER DEFAULT 1, -- 1 = ativo, 0 = inativo
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS cartelas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_cartela TEXT UNIQUE NOT NULL,
      data_sorteio TEXT NOT NULL, -- YYYY-MM-DD
      milhar1 TEXT NOT NULL, -- 4 dígitos
      milhar2 TEXT NOT NULL,
      milhar3 TEXT NOT NULL,
      milhar4 TEXT NOT NULL,
      valor REAL DEFAULT 2.00,
      status TEXT DEFAULT 'disponivel', -- 'disponivel', 'vendida', 'cancelada', 'premiada'
      vendedor_id INTEGER,
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
    )
  `);

  // Migração: Verificar se a coluna vendedor_id existe na tabela cartelas
  try {
    const tableInfo = await dbAll("PRAGMA table_info(cartelas)");
    const hasVendedorId = tableInfo.some(col => col.name === 'vendedor_id');
    if (!hasVendedorId) {
      await dbRun("ALTER TABLE cartelas ADD COLUMN vendedor_id INTEGER REFERENCES vendedores(id)");
      console.log("Coluna 'vendedor_id' adicionada à tabela 'cartelas' com sucesso.");
    }
  } catch (err) {
    console.error("Erro na migração de vendedor_id em cartelas:", err);
  }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cartela_id INTEGER UNIQUE NOT NULL,
      vendedor_id INTEGER NOT NULL,
      cliente_id INTEGER NOT NULL,
      data_venda TEXT NOT NULL, -- DATETIME ISO string
      valor_venda REAL DEFAULT 2.00,
      FOREIGN KEY (cartela_id) REFERENCES cartelas(id),
      FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER UNIQUE NOT NULL,
      metodo TEXT NOT NULL, -- 'dinheiro' ou 'pix'
      status TEXT NOT NULL, -- 'pago' ou 'pix_pendente'
      data_pagamento TEXT, -- DATETIME ISO string ou NULL se pendente
      FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS resultados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_sorteio TEXT UNIQUE NOT NULL, -- YYYY-MM-DD
      milhar_sorteada TEXT NOT NULL, -- 4 dígitos
      data_cadastro TEXT NOT NULL -- DATETIME ISO string
    )
  `);

  // Insert default Admin
  const adminExists = await dbGet("SELECT id FROM usuarios WHERE username = 'admin'");
  if (!adminExists) {
    const adminPass = hashPassword('admin123');
    await dbRun(
      "INSERT INTO usuarios (username, password, role, nome) VALUES (?, ?, 'admin', 'Administrador Principal')",
      ['admin', adminPass]
    );
  }

  // Insert default Seller
  const sellerExists = await dbGet("SELECT id FROM usuarios WHERE username = 'vendedor1'");
  let defaultVendedorId = null;
  if (!sellerExists) {
    const sellerPass = hashPassword('vend123');
    const res = await dbRun(
      "INSERT INTO usuarios (username, password, role, nome) VALUES (?, ?, 'vendedor', 'Vendedor Padrão 1')",
      ['vendedor1', sellerPass]
    );
    const vRes = await dbRun(
      "INSERT INTO vendedores (usuario_id, telefone) VALUES (?, ?)",
      [res.lastID, '11999999999']
    );
    defaultVendedorId = vRes.lastID;
  } else {
    const v = await dbGet("SELECT id FROM vendedores WHERE usuario_id = ?", [sellerExists.id]);
    if (v) defaultVendedorId = v.id;
  }

  // Insert some default tickets if there are none
  const ticketsCount = await dbGet("SELECT COUNT(*) as count FROM cartelas");
  if (ticketsCount.count === 0) {
    // Generate some raffle numbers for today/tomorrow
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Auxiliary function to generate random 4-digit number as string
    const randMilhar = () => Math.floor(Math.random() * 10000).toString().padStart(4, '0');

    for (let i = 1; i <= 30; i++) {
      const num = i.toString().padStart(3, '0');
      await dbRun(
        `INSERT INTO cartelas (numero_cartela, data_sorteio, milhar1, milhar2, milhar3, milhar4, valor, status, vendedor_id) 
         VALUES (?, ?, ?, ?, ?, ?, 2.00, 'disponivel', ?)`,
        [num, todayStr, randMilhar(), randMilhar(), randMilhar(), randMilhar(), defaultVendedorId]
      );
    }
    console.log("30 cartelas padrão inseridas para o vendedor padrão 1 e data:", todayStr);
  }
}

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDb,
  hashPassword
};
