const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

// Modelo para sessões de QR code
const QRCodeSession = sequelize.define('qrcodesessions', {
  session_id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending'
  },
  qr_code: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Função para sincronizar a tabela
async function syncQRCodeTable() {
  try {
    await QRCodeSession.sync({ alter: true });
    console.log('✅ Tabela de sessões QR code sincronizada com sucesso.');
    return QRCodeSession;
  } catch (error) {
    console.error('❌ Erro ao sincronizar tabela de sessões QR code:', error);
    throw error;
  }
}

module.exports = {
  QRCodeSession,
  syncQRCodeTable
}; 