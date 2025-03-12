const db = require('./db/database');
const { User, BotConfig, Conversation, EmailConfig } = require('./models/index');

async function clearDatabase() {
  try {
    console.log('Iniciando a limpeza do banco de dados...');
    
    // Desativar restrições de chave estrangeira temporariamente (para SQLite)
    await db.query('PRAGMA foreign_keys = OFF;');
    
    // Limpar todas as tabelas (na ordem correta para evitar problemas de chave estrangeira)
    await Conversation.destroy({ where: {}, truncate: true, cascade: true });
    console.log('✅ Tabela Conversation limpa');
    
    await EmailConfig.destroy({ where: {}, truncate: true, cascade: true });
    console.log('✅ Tabela EmailConfig limpa');
    
    await BotConfig.destroy({ where: {}, truncate: true, cascade: true });
    console.log('✅ Tabela BotConfig limpa');
    
    await User.destroy({ where: {}, truncate: true, cascade: true });
    console.log('✅ Tabela User limpa');
    
    // Limpar a tabela de sessões também (se existir)
    try {
      const Session = db.models.Session;
      if (Session) {
        await Session.destroy({ where: {}, truncate: true, cascade: true });
        console.log('✅ Tabela Session limpa');
      }
    } catch (error) {
      console.log('Nota: Tabela Session não encontrada ou não pôde ser limpa');
    }
    
    // Reativar restrições de chave estrangeira
    await db.query('PRAGMA foreign_keys = ON;');
    
    console.log('Banco de dados limpo com sucesso!');
    console.log('Você precisará criar um novo usuário e configurações após reiniciar o servidor.');
    
    // Fechar a conexão
    await db.close();
  } catch (error) {
    console.error('Erro ao limpar o banco de dados:', error);
  }
}

// Executar a limpeza
clearDatabase(); 