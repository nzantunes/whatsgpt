const db = require('./db/database');
const fs = require('fs');
const path = require('path');

async function corrigirBancoDados() {
  try {
    console.log('Corrigindo banco de dados com SQL direto...');
    
    // Fazer backup do banco de dados
    const dbPath = path.join(__dirname, 'db', 'database.sqlite');
    if (fs.existsSync(dbPath)) {
      const backupPath = path.join(__dirname, 'db', `database_backup_${Date.now()}.sqlite`);
      fs.copyFileSync(dbPath, backupPath);
      console.log(`✅ Backup do banco de dados criado: ${backupPath}`);
    }

    // Verificar se a tabela users existe
    try {
      await db.query('SELECT * FROM users LIMIT 1');
      console.log('✅ Tabela users existe');
      
      // Adicionar coluna is_active à tabela users
      try {
        await db.query('ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1');
        console.log('✅ Coluna is_active adicionada à tabela users');
      } catch (err) {
        if (err.message.includes('duplicate column name')) {
          console.log('A coluna is_active já existe na tabela users');
        } else {
          console.error('Erro ao adicionar coluna is_active:', err.message);
        }
      }
    } catch (err) {
      console.log('Criando tabela users...');
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE,
          password TEXT,
          whatsapp_number TEXT UNIQUE,
          auth_type TEXT NOT NULL DEFAULT 'email',
          last_login DATETIME,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Tabela users criada');
    }

    // Verificar se a tabela botconfigs existe
    try {
      await db.query('SELECT * FROM botconfigs LIMIT 1');
      console.log('✅ Tabela botconfigs existe');
      
      // Adicionar colunas de timestamps se não existirem
      try {
        await db.query('ALTER TABLE botconfigs ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
        console.log('✅ Coluna created_at adicionada à tabela botconfigs');
      } catch (err) {
        if (err.message.includes('duplicate column name')) {
          console.log('A coluna created_at já existe na tabela botconfigs');
        } else {
          console.error('Erro ao adicionar coluna created_at:', err.message);
        }
      }
      
      try {
        await db.query('ALTER TABLE botconfigs ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
        console.log('✅ Coluna updated_at adicionada à tabela botconfigs');
      } catch (err) {
        if (err.message.includes('duplicate column name')) {
          console.log('A coluna updated_at já existe na tabela botconfigs');
        } else {
          console.error('Erro ao adicionar coluna updated_at:', err.message);
        }
      }
    } catch (err) {
      console.log('Criando tabela botconfigs...');
      await db.query(`
        CREATE TABLE IF NOT EXISTS botconfigs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          model TEXT NOT NULL DEFAULT 'gpt-3.5-turbo',
          is_active BOOLEAN NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Tabela botconfigs criada');
    }

    // Verificar se a tabela conversations existe
    try {
      await db.query('SELECT * FROM conversations LIMIT 1');
      console.log('✅ Tabela conversations existe');
      
      // Adicionar colunas de timestamps se não existirem
      try {
        await db.query('ALTER TABLE conversations ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
        console.log('✅ Coluna created_at adicionada à tabela conversations');
      } catch (err) {
        if (err.message.includes('duplicate column name')) {
          console.log('A coluna created_at já existe na tabela conversations');
        } else {
          console.error('Erro ao adicionar coluna created_at:', err.message);
        }
      }
      
      try {
        await db.query('ALTER TABLE conversations ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
        console.log('✅ Coluna updated_at adicionada à tabela conversations');
      } catch (err) {
        if (err.message.includes('duplicate column name')) {
          console.log('A coluna updated_at já existe na tabela conversations');
        } else {
          console.error('Erro ao adicionar coluna updated_at:', err.message);
        }
      }
    } catch (err) {
      console.log('Criando tabela conversations...');
      await db.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone_number TEXT NOT NULL,
          user_message TEXT NOT NULL,
          bot_response TEXT NOT NULL,
          config_id INTEGER,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Tabela conversations criada');
    }

    // Criar usuário padrão se não existir
    try {
      const [users] = await db.query('SELECT * FROM users WHERE email = ?', ['admin@example.com']);
      if (!users || users.length === 0) {
        await db.query(`
          INSERT INTO users (name, email, password, auth_type, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `, ['Administrador', 'admin@example.com', '$2b$10$kIqIqI9Jj9qUJJK6pVbA1eZQr0A0TIB.6tnjK3hX.s5VkzFDGQZSy', 'email', 1]);
        console.log('✅ Usuário administrador criado');
      } else {
        console.log('✅ Usuário administrador já existe');
      }
    } catch (err) {
      console.error('Erro ao verificar/criar usuário padrão:', err.message);
    }

    // Criar configuração padrão se não existir
    try {
      const [configs] = await db.query('SELECT * FROM botconfigs LIMIT 1');
      if (!configs || configs.length === 0) {
        await db.query(`
          INSERT INTO botconfigs (user_id, name, prompt, model, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [1, 'Configuração Padrão', 'Você é um assistente virtual educado e prestativo.', 'gpt-3.5-turbo', 1]);
        console.log('✅ Configuração padrão criada');
      } else {
        console.log('✅ Configuração padrão já existe');
      }
    } catch (err) {
      console.error('Erro ao verificar/criar configuração padrão:', err.message);
    }

    console.log('✅ Banco de dados corrigido com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao corrigir banco de dados:', error);
  } finally {
    process.exit(0);
  }
}

// Executar
corrigirBancoDados(); 