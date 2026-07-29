require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  BOT_TOKEN: process.env.BOT_TOKEN || '8709403193:AAGo0kSASxn_5zL9wBwVo0FeOt-VRDsqINI',
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : ['7713174177', '123456789'], // Admin Telegram IDs
  WEBAPP_URL: process.env.WEBAPP_URL || 'http://localhost:3000',
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};
