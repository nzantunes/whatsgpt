// Script para recriar a tabela de usuários

// Importar modelos de banco de dados
const db = require('./db/database');
const { User } = require('./models/index');
const { QueryTypes } = require('sequelize');

// Função principal para recriar a tabela de usuários
async function recreateUsersTable() {
  try {
    console.log('Iniciando recriação da tabela de usuários...');
    
    // Conectar ao banco de dados
    await db.authenticate();
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
    
    // Backup dos usuários existentes usando SQL direto para evitar problemas com colunas
    console.log('Fazendo backup dos usuários existentes...');
    const existingUsers = await db.query('SELECT * FROM users', { type: QueryTypes.SELECT });
    console.log(`Encontrados ${existingUsers.length} usuários para backup.`);
    
    // Desativar verificação de chaves estrangeiras temporariamente
    console.log('Desativando verificação de chaves estrangeiras...');
    await db.query('PRAGMA foreign_keys = OFF;', { type: QueryTypes.RAW });
    
    try {
      // Forçar recriação da tabela (isso vai apagar todos os dados)
      console.log('Recriando tabela de usuários...');
      await User.sync({ force: true });
      console.log('✅ Tabela de usuários recriada com sucesso!');
      
      // Restaurar usuários
      if (existingUsers.length > 0) {
        console.log('Restaurando usuários do backup...');
        
        // Restaurar cada usuário
        for (const userData of existingUsers) {
          // Criar objeto com os campos necessários
          const newUser = {
            name: userData.name,
            email: userData.email,
            password: userData.password, // Já está hasheado
            last_login: userData.last_login,
            auth_type: 'email' // Valor padrão para usuários existentes
          };
          
          // Criar usuário novamente
          await User.create(newUser);
        }
        
        console.log(`✅ ${existingUsers.length} usuários restaurados com sucesso!`);
      }
    } finally {
      // Reativar verificação de chaves estrangeiras
      console.log('Reativando verificação de chaves estrangeiras...');
      await db.query('PRAGMA foreign_keys = ON;', { type: QueryTypes.RAW });
    }
    
    console.log('✅ Processo de recriação concluído com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao recriar tabela de usuários:', error);
    console.error('Detalhes do erro:', JSON.stringify(error, null, 2));
    process.exit(1);
  }
}

// Executar a função
recreateUsersTable(); 