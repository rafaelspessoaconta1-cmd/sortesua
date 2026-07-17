const { initDb, dbAll, dbGet, hashPassword } = require('./database');

async function test() {
  console.log("Iniciando teste de banco de dados...");
  try {
    await initDb();
    console.log("Banco de dados inicializado com sucesso!");
    
    // Verificando usuário admin
    const admin = await dbGet("SELECT username, role, nome FROM usuarios WHERE role = 'admin'");
    console.log("Admin cadastrado:", admin);

    // Verificando vendedor padrão
    const vendedor = await dbGet(`
      SELECT u.username, u.role, v.telefone 
      FROM usuarios u 
      JOIN vendedores v ON u.id = v.usuario_id 
      WHERE u.username = 'vendedor1'
    `);
    console.log("Vendedor cadastrado:", vendedor);

    // Verificando cartelas geradas
    const cartelas = await dbAll("SELECT COUNT(*) as count FROM cartelas");
    console.log("Quantidade de cartelas geradas:", cartelas[0].count);

    console.log("TESTE CONCLUÍDO COM SUCESSO!");
    process.exit(0);
  } catch (err) {
    console.error("Erro durante o teste:", err);
    process.exit(1);
  }
}

test();
