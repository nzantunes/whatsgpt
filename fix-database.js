const { Sequelize, DataTypes, QueryTypes } = require('sequelize');
const fs = require('fs');
const path = require('path');

// Configuração do banco de dados
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: console.log
});

async function fixDatabase() {
  try {
    // Testar conexão
    await db.authenticate();
    console.log('Conexão com o banco de dados estabelecida com sucesso.');

    // Backup do banco de dados antes de qualquer alteração
    const backupPath = path.join(__dirname, `database_backup_${Date.now()}.sqlite`);
    fs.copyFileSync(dbPath, backupPath);
    console.log(`Backup do banco de dados criado em: ${backupPath}`);

    // Verificar se a tabela users existe
    const tables = await db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
      { type: QueryTypes.SELECT }
    );
    
    if (tables.length === 0) {
      console.log('A tabela users não existe. Criando tabela...');
      await createUsersTable();
    } else {
      console.log('A tabela users existe. Verificando a estrutura...');
      await updateUsersTable();
    }

    console.log('Processo de correção do banco de dados concluído com sucesso!');
  } catch (error) {
    console.error('Erro durante a correção do banco de dados:', error);
  } finally {
    await db.close();
  }
}

async function createUsersTable() {
  await db.query(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      whatsapp_number TEXT UNIQUE,
      auth_type TEXT NOT NULL DEFAULT 'whatsapp',
      password TEXT,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Tabela users criada com sucesso.');
}

async function updateUsersTable() {
  try {
    // Verificar colunas existentes
    const tableInfo = await db.query("PRAGMA table_info(users)", { type: QueryTypes.SELECT });
    
    const columns = tableInfo.map(col => col.name.toLowerCase());
    console.log('Colunas existentes:', columns);

    // Verificar e adicionar coluna whatsapp_number se não existir
    if (!columns.includes('whatsapp_number')) {
      console.log('Adicionando coluna whatsapp_number...');
      await db.query("ALTER TABLE users ADD COLUMN whatsapp_number TEXT");
      
      // Como SQLite não suporta adicionar constraint UNIQUE em ALTER TABLE,
      // precisamos criar uma nova tabela e migrar os dados
      await migrateTableWithUniqueConstraint();
    }

    // Verificar e adicionar coluna auth_type se não existir
    if (!columns.includes('auth_type')) {
      console.log('Adicionando coluna auth_type...');
      await db.query("ALTER TABLE users ADD COLUMN auth_type TEXT DEFAULT 'whatsapp' NOT NULL");
    }

    // Verificar valores atuais na tabela
    const users = await db.query("SELECT * FROM users LIMIT 5", { type: QueryTypes.SELECT });
    console.log('Primeiros 5 usuários na tabela:', users);

  } catch (error) {
    console.error('Erro ao atualizar a tabela users:', error);
    throw error;
  }
}

async function migrateTableWithUniqueConstraint() {
  try {
    console.log('Criando nova tabela users_new com restrição UNIQUE para whatsapp_number...');
    
    // Criar tabela nova com as constraints desejadas
    await db.query(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        whatsapp_number TEXT UNIQUE,
        auth_type TEXT NOT NULL DEFAULT 'whatsapp',
        password TEXT,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Copiar dados da tabela antiga para a nova
    await db.query(`
      INSERT INTO users_new 
      SELECT 
        id, 
        name, 
        email, 
        whatsapp_number, 
        COALESCE(auth_type, 'whatsapp') as auth_type, 
        password, 
        last_login, 
        created_at, 
        updated_at 
      FROM users
    `);
    
    // Verificar se a cópia foi bem-sucedida
    const oldCount = await db.query("SELECT COUNT(*) as count FROM users", { type: QueryTypes.SELECT });
    const newCount = await db.query("SELECT COUNT(*) as count FROM users_new", { type: QueryTypes.SELECT });
    
    if (oldCount[0].count === newCount[0].count) {
      console.log(`Migração bem-sucedida: ${oldCount[0].count} registros copiados.`);
      
      // Renomear tabelas
      await db.query("DROP TABLE users");
      await db.query("ALTER TABLE users_new RENAME TO users");
      console.log('Tabela users atualizada com sucesso.');
    } else {
      throw new Error(`Contagem de registros não coincide: antiga=${oldCount[0].count}, nova=${newCount[0].count}`);
    }
  } catch (error) {
    console.error('Erro durante a migração da tabela:', error);
    throw error;
  }
}

// Executar a função
fixDatabase(); 