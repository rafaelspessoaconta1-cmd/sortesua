CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendedores (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  telefone TEXT,
  ativo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cartelas (
  id SERIAL PRIMARY KEY,
  numero_cartela TEXT UNIQUE NOT NULL,
  data_sorteio TEXT NOT NULL,
  milhar1 TEXT NOT NULL,
  milhar2 TEXT NOT NULL,
  milhar3 TEXT NOT NULL,
  milhar4 TEXT NOT NULL,
  valor REAL DEFAULT 2.00,
  status TEXT DEFAULT 'disponivel',
  vendedor_id INTEGER REFERENCES vendedores(id)
);

CREATE TABLE IF NOT EXISTS vendas (
  id SERIAL PRIMARY KEY,
  cartela_id INTEGER UNIQUE NOT NULL REFERENCES cartelas(id),
  vendedor_id INTEGER NOT NULL REFERENCES vendedores(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  data_venda TEXT NOT NULL,
  valor_venda REAL DEFAULT 2.00
);

CREATE TABLE IF NOT EXISTS pagamentos (
  id SERIAL PRIMARY KEY,
  venda_id INTEGER UNIQUE NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  metodo TEXT NOT NULL,
  status TEXT NOT NULL,
  data_pagamento TEXT
);

CREATE TABLE IF NOT EXISTS resultados (
  id SERIAL PRIMARY KEY,
  data_sorteio TEXT UNIQUE NOT NULL,
  milhar_sorteada TEXT NOT NULL,
  data_cadastro TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milhares_bloqueados (
  id SERIAL PRIMARY KEY,
  milhar TEXT NOT NULL,
  data_sorteio TEXT NOT NULL,
  data_cadastro TEXT NOT NULL,
  UNIQUE(milhar, data_sorteio)
);

CREATE TABLE IF NOT EXISTS configuracoes (
  id SERIAL PRIMARY KEY,
  chave TEXT UNIQUE NOT NULL,
  valor TEXT NOT NULL
);

INSERT INTO configuracoes (chave, valor) VALUES ('app_config', '{"valor_premio": 500}') ON CONFLICT (chave) DO NOTHING;


