// Script para atualizar a estrutura do banco de dados
const db = require('./db/database');
const { DataTypes } = require('sequelize');

async function atualizarBancoDados() {
  try {
    console.log('Iniciando atualização do banco de dados...');
    
    // Adicionar coluna is_active à tabela users se não existir
    try {
      await db.query('ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1');
      console.log('✅ Coluna is_active adicionada à tabela users');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('A coluna is_active já existe na tabela users');
      } else {
        console.error('Erro ao adicionar coluna is_active:', error);
      }
    }
    
    // Adicionar colunas createdAt e updatedAt se não existirem
    try {
      await db.query('ALTER TABLE users ADD COLUMN createdAt DATETIME');
      console.log('✅ Coluna createdAt adicionada à tabela users');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('A coluna createdAt já existe na tabela users');
      } else {
        console.error('Erro ao adicionar coluna createdAt:', error);
      }
    }
    
    try {
      await db.query('ALTER TABLE users ADD COLUMN updatedAt DATETIME');
      console.log('✅ Coluna updatedAt adicionada à tabela users');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('A coluna updatedAt já existe na tabela users');
      } else {
        console.error('Erro ao adicionar coluna updatedAt:', error);
      }
    }
    
    // Criar a tabela conversations se não existir
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone_number TEXT NOT NULL,
          user_message TEXT NOT NULL,
          bot_response TEXT NOT NULL,
          config_id INTEGER,
          metadata TEXT,
          createdAt DATETIME,
          updatedAt DATETIME
        )
      `);
      console.log('✅ Tabela conversations criada ou já existente');
    } catch (error) {
      console.error('Erro ao criar tabela conversations:', error);
    }
    
    // Criar a tabela botconfigs se não existir
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS botconfigs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          model TEXT NOT NULL DEFAULT 'gpt-3.5-turbo',
          is_active BOOLEAN NOT NULL DEFAULT 0,
          createdAt DATETIME,
          updatedAt DATETIME
        )
      `);
      console.log('✅ Tabela botconfigs criada ou já existente');
    } catch (error) {
      console.error('Erro ao criar tabela botconfigs:', error);
    }
    
    console.log('✅ Atualização do banco de dados concluída');
  } catch (error) {
    console.error('❌ Erro ao atualizar banco de dados:', error);
  } finally {
    process.exit(0);
  }
}

// Executar a atualização
atualizarBancoDados(); 