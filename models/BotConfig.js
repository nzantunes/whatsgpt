const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/database');

const BotConfig = sequelize.define('BotConfig', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    prompt: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    model: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'gpt-3.5-turbo'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'bot_configs',
    timestamps: true
});

module.exports = BotConfig; 