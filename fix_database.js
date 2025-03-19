const { Sequelize } = require('sequelize');
const path = require('path');

async function fixDatabase() {
    try {
        const sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: path.join(__dirname, 'database.sqlite'),
            logging: false
        });

        // Primeiro, vamos dropar a tabela de backup se ela existir
        await sequelize.query('DROP TABLE IF EXISTS whatsappusers_backup;');

        // Criar a tabela de backup com a mesma estrutura
        await sequelize.query(`
            CREATE TABLE whatsappusers_backup AS 
            SELECT * FROM whatsappusers 
            WHERE 1=0;
        `);

        // Copiar os dados sem conflito
        await sequelize.query(`
            INSERT INTO whatsappusers_backup 
            SELECT * FROM whatsappusers;
        `);

        console.log('Backup da tabela realizado com sucesso!');
        
        // Verificar quantidade de registros
        const [results] = await sequelize.query('SELECT COUNT(*) as count FROM whatsappusers_backup;');
        console.log(`Total de registros na tabela de backup: ${results[0].count}`);

    } catch (error) {
        console.error('Erro ao corrigir banco de dados:', error);
    }
}

fixDatabase(); 