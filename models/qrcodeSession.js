const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/database');

// Definição do modelo QRCodeSession
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

// Funções auxiliares para gerenciar sessões QR code
async function findSessionById(sessionId) {
  return await QRCodeSession.findOne({ where: { session_id: sessionId } });
}

async function createSession(sessionId) {
  return await QRCodeSession.create({
    session_id: sessionId,
    status: 'pending'
  });
}

async function updateSessionQRCode(sessionId, qrCode) {
  const session = await findSessionById(sessionId);
  
  if (session) {
    await session.update({
      qr_code: qrCode,
      status: 'pending'
    });
    return true;
  }
  
  return false;
}

async function updateSessionStatus(sessionId, status, phoneNumber = null) {
  const session = await findSessionById(sessionId);
  
  if (session) {
    const updateData = { status };
    if (phoneNumber) {
      updateData.phone_number = phoneNumber;
    }
    
    await session.update(updateData);
    return true;
  }
  
  return false;
}

module.exports = {
  QRCodeSession,
  findSessionById,
  createSession,
  updateSessionQRCode,
  updateSessionStatus
}; 