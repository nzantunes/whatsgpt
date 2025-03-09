const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

// Verificar tabelas existentes
db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
  if (err) {
    console.error('Erro ao verificar tabelas:', err);
    return;
  }
  
  console.log('Tabelas existentes:');
  tables.forEach((table) => {
    console.log(`- ${table.name}`);
  });
  
  // Verificar configurações do bot
  db.all("SELECT * FROM bot_configs", [], (err, configs) => {
    if (err) {
      console.error('Erro ao buscar configurações:', err);
    } else {
      console.log('\nConfigurações do bot:');
      if (configs.length === 0) {
        console.log('Nenhuma configuração encontrada');
      } else {
        configs.forEach(config => {
          console.log(`ID: ${config.id}, Nome: ${config.name}, Ativo: ${config.is_active ? 'Sim' : 'Não'}, Usuário: ${config.user_id}`);
          
          // Verificar conteúdo dos arquivos
          const hasPdf = config.pdf_content && config.pdf_content.length > 0;
          const hasExcel = config.xlsx_content && config.xlsx_content.length > 0;
          const hasCsv = config.csv_content && config.csv_content.length > 0;
          
          console.log(`  PDF: ${hasPdf ? `SIM (${config.pdf_content?.length || 0} caracteres)` : 'NÃO'}`);
          console.log(`  Excel: ${hasExcel ? `SIM (${config.xlsx_content?.length || 0} caracteres)` : 'NÃO'}`); 
          console.log(`  CSV: ${hasCsv ? `SIM (${config.csv_content?.length || 0} caracteres)` : 'NÃO'}`);
          
          try {
            const pdfFilenames = config.pdf_filenames ? JSON.parse(config.pdf_filenames) : [];
            const xlsxFilenames = config.xlsx_filenames ? JSON.parse(config.xlsx_filenames) : [];
            const csvFilenames = config.csv_filenames ? JSON.parse(config.csv_filenames) : [];
            
            console.log(`  PDF Filenames: ${pdfFilenames.join(', ')}`);
            console.log(`  Excel Filenames: ${xlsxFilenames.join(', ')}`);
            console.log(`  CSV Filenames: ${csvFilenames.join(', ')}`);
          } catch (e) {
            console.error(`  Erro ao analisar filenames: ${e.message}`);
          }
        });
      }
    }
    
    // Verificar última configuração ativa
    db.get("SELECT * FROM bot_configs WHERE is_active = 1 ORDER BY updatedAt DESC LIMIT 1", [], (err, activeConfig) => {
      if (err) {
        console.error('Erro ao buscar configuração ativa:', err);
      } else {
        console.log('\nConfiguração ativa mais recente:');
        if (activeConfig) {
          console.log(`ID: ${activeConfig.id}, Nome: ${activeConfig.name}, Usuário: ${activeConfig.user_id}`);
          console.log(`Prompt: ${activeConfig.prompt}`);
          
          // Verificar a presença de dados de arquivos
          if (activeConfig.pdf_content) {
            console.log(`PDF: SIM (${activeConfig.pdf_content.length} caracteres)`);
            if (activeConfig.pdf_content.length > 0) {
              console.log(`Amostra PDF: ${activeConfig.pdf_content.substring(0, 100)}...`);
            }
          } else {
            console.log(`PDF: NÃO`);
          }
          
          if (activeConfig.xlsx_content) {
            console.log(`Excel: SIM (${activeConfig.xlsx_content.length} caracteres)`);
            if (activeConfig.xlsx_content.length > 0) {
              console.log(`Amostra Excel: ${activeConfig.xlsx_content.substring(0, 100)}...`);
            }
          } else {
            console.log(`Excel: NÃO`);
          }
          
          if (activeConfig.csv_content) {
            console.log(`CSV: SIM (${activeConfig.csv_content.length} caracteres)`);
            if (activeConfig.csv_content.length > 0) {
              console.log(`Amostra CSV: ${activeConfig.csv_content.substring(0, 100)}...`);
            }
          } else {
            console.log(`CSV: NÃO`);
          }
        } else {
          console.log('Nenhuma configuração ativa encontrada');
        }
      }
      
      // Verificar todas as configurações ativas
      db.all("SELECT id, name, user_id FROM bot_configs WHERE is_active = 1", [], (err, activeConfigs) => {
        if (err) {
          console.error('Erro ao buscar todas as configurações ativas:', err);
        } else {
          console.log('\nTodas as configurações ativas:');
          if (activeConfigs.length === 0) {
            console.log('Nenhuma configuração ativa encontrada');
          } else {
            activeConfigs.forEach(config => {
              console.log(`ID: ${config.id}, Nome: ${config.name}, Usuário: ${config.user_id}`);
            });
          }
        }
        
        db.close();
      });
    });
  });
}); 