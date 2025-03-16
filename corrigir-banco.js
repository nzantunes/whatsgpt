// Script para corrigir a estrutura do banco de dados
const db = require('./db/database');
const { User } = require('./models/user');
const BotConfig = require('./models/botconfig');
const Conversation = require('./models/conversation');
const fs = require('fs');
const path = require('path');

async function corrigirBancoDados() {
  try {
    console.log('Iniciando correção completa do banco de dados...');
    
    // 1. Fazer backup do banco de dados atual
    const dbPath = path.join(__dirname, 'db', 'database.sqlite');
    if (fs.existsSync(dbPath)) {
      const backupPath = path.join(__dirname, 'db', `database_backup_${Date.now()}.sqlite`);
      fs.copyFileSync(dbPath, backupPath);
      console.log(`✅ Backup do banco de dados criado: ${backupPath}`);
    }
    
    // 2. Sincronizar todos os modelos com o banco de dados
    console.log('Sincronizando modelos com o banco de dados...');
    
    // Sincronizar tabela users
    await User.sync({ alter: true });
    console.log('✅ Tabela users sincronizada');
    
    // Sincronizar tabela botconfigs
    await BotConfig.sync({ alter: true });
    console.log('✅ Tabela botconfigs sincronizada');
    
    // Sincronizar tabela conversations
    await Conversation.sync({ alter: true });
    console.log('✅ Tabela conversations sincronizada');
    
    // 3. Criar usuário padrão se não existir
    const adminUser = await User.findOne({ where: { email: 'admin@example.com' } });
    if (!adminUser) {
      await User.create({
        name: 'Administrador',
        email: 'admin@example.com',
        password: 'admin123',
        auth_type: 'email',
        is_active: true
      });
      console.log('✅ Usuário administrador criado');
    }
    
    // 4. Criar configuração padrão se não existir
    const configs = await BotConfig.findAll();
    if (configs.length === 0) {
      await BotConfig.create({
        user_id: 1,
        name: 'Configuração Padrão',
        prompt: 'Você é um assistente virtual educado e prestativo.',
        model: 'gpt-3.5-turbo',
        is_active: true
      });
      console.log('✅ Configuração padrão criada');
    }
    
    console.log('✅ Correção do banco de dados concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao corrigir banco de dados:', error);
  } finally {
    process.exit(0);
  }
}

// Executar correção
corrigirBancoDados(); 