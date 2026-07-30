const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./config');
const db = require('./db/database');
const { initBot } = require('./bot/bot');
const { setupWebRTCSignaling, connectedUsers } = require('./services/webrtcSignaling');
const broadcastService = require('./services/broadcastService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware to set bypass headers for tunnels (No IP prompts)
app.use((req, res, next) => {
  res.setHeader('Bypass-Tunnel-Reminder', 'true');
  res.setHeader('Bypass-Tunnel-Warning', 'true');
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Bypass localtunnel IP page: set cookie then redirect to app
app.get('/bypass', (req, res) => {
  res.setHeader('Set-Cookie', [
    'bypass-tunnel-reminder=1; Path=/; SameSite=None; Secure',
    'localtunnel=true; Path=/; SameSite=None; Secure'
  ]);
  res.redirect('/');
});

app.use(express.static(path.join(__dirname, 'public')));

// Setup Socket.io Signaling
setupWebRTCSignaling(io);

// API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/user/:tgId', (req, res) => {
  const { tgId } = req.params;
  const user = db.getUser(tgId);
  if (user) {
    res.json({ success: true, user });
  } else {
    res.json({ success: false, message: 'User not found' });
  }
});

app.get('/api/user/:id/friends', (req, res) => {
  const friends = db.getUserFriends(req.params.id);
  const friendsWithStatus = friends.map(f => {
    return {
      ...f,
      isOnline: connectedUsers.has(String(f.tgId))
    };
  });
  res.json({ success: true, friends: friendsWithStatus });
});

app.post('/api/user/update', (req, res) => {
  const { tgId, profile } = req.body;
  if (!tgId || !profile) {
    return res.status(400).json({ success: false, message: 'Missing parameters' });
  }
  const updated = db.saveUser(tgId, profile);
  res.json({ success: true, user: updated });
});
// ── ADMIN API ──────────────────────────────────────────────────────────────
const ADMIN_IDS_SET = new Set(config.ADMIN_IDS.map(String));

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.adminToken;
  if (!token || !ADMIN_IDS_SET.has(String(token))) {
    return res.status(403).json({ success: false, message: 'Ruxsat yo\'q (Forbidden)' });
  }
  next();
}

// GET /api/admin/stats
app.get('/api/admin/stats', adminAuth, (req, res) => {
  const users = Object.values(db.data.users);
  const now = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);

  const dau = (db.data.callStats?.dailyActive?.[todayKey] || []).length;
  let mau = 0;
  if (db.data.callStats?.dailyActive) {
    const activeSet = new Set();
    Object.entries(db.data.callStats.dailyActive).forEach(([dateKey, ids]) => {
      if (new Date(dateKey) >= monthAgo) (ids || []).forEach(id => activeSet.add(id));
    });
    mau = activeSet.size;
  }

  res.json({
    success: true,
    stats: {
      totalUsers: users.length,
      onlineUsers: connectedUsers.size,
      dau,
      mau,
      totalCalls: db.data.callStats?.totalCalls || 0,
      totalDurationMin: Math.floor((db.data.callStats?.totalDurationSeconds || 0) / 60),
      bannedCount: db.data.bannedUsers?.length || 0,
      males: users.filter(u => u.gender === 'male').length,
      females: users.filter(u => u.gender === 'female').length,
      langUz: users.filter(u => u.lang === 'uz').length,
      langRu: users.filter(u => u.lang === 'ru').length,
    }
  });
});

// GET /api/admin/users
app.get('/api/admin/users', adminAuth, (req, res) => {
  const users = Object.values(db.data.users).map(u => ({
    ...u,
    isOnline: connectedUsers.has(String(u.tgId)),
    isBanned: db.isBanned(u.tgId)
  }));
  res.json({ success: true, users });
});

// POST /api/admin/ban
app.post('/api/admin/ban', adminAuth, (req, res) => {
  const { tgId } = req.body;
  if (!tgId) return res.status(400).json({ success: false });
  db.banUser(tgId);
  // Force disconnect
  const { disconnectUser } = require('./services/webrtcSignaling');
  disconnectUser(tgId);
  res.json({ success: true, message: `${tgId} bloklandi` });
});

// POST /api/admin/unban
app.post('/api/admin/unban', adminAuth, (req, res) => {
  const { tgId } = req.body;
  if (!tgId) return res.status(400).json({ success: false });
  db.data.bannedUsers = (db.data.bannedUsers || []).filter(id => String(id) !== String(tgId));
  db.save();
  res.json({ success: true, message: `${tgId} blokdan chiqarildi` });
});

// POST /api/admin/broadcast
app.post('/api/admin/broadcast', adminAuth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ success: false });
  const { sendToAdmins } = require('./bot/bot');
  const users = Object.values(db.data.users);
  let sent = 0;
  const botMod = require('./bot/bot');
  for (const u of users) {
    try {
      await botMod.getBotInstance()?.telegram.sendMessage(u.tgId, text);
      sent++;
    } catch (e) {}
  }
  res.json({ success: true, sent });
});

// ──────────────────────────────────────────────────────────────────────────

let botInstance = null;


server.listen(config.PORT, async () => {
  console.log(`=================================================`);
  console.log(`🚀 Chatroulette Server listening on port ${config.PORT}`);
  console.log(`🔗 Local WebApp URL: ${config.WEBAPP_URL}`);

  // Only use localtunnel in local dev (when WEBAPP_URL is localhost)
  const isLocal = config.WEBAPP_URL.includes('localhost') || config.WEBAPP_URL.includes('127.0.0.1');
  if (isLocal) {
    try {
      const localtunnel = require('localtunnel');
      const tunnel = await localtunnel({
        port: config.PORT,
        subdomain: 'chatroulette-uz-app'
      });
      config.WEBAPP_URL = tunnel.url;
      console.log(`🌍 HTTPS TUNNEL URL: ${tunnel.url}`);
      tunnel.on('close', () => console.log('Tunnel closed'));
      tunnel.on('error', (err) => console.error('Tunnel error:', err.message));
    } catch (e) {
      console.log('Tunnel init error:', e.message);
    }
  } else {
    console.log(`☁️ Cloud mode — WebApp URL: ${config.WEBAPP_URL}`);
  }

  console.log(`=================================================`);

  // Launch Bot after URL is determined
  try {
    botInstance = initBot();
    botInstance.launch().then(() => {
      console.log('🤖 Telegram Bot launched successfully!');
    }).catch((err) => {
      console.error('⚠️ Telegram Bot launch error:', err.message);
    });
  } catch (err) {
    console.error('⚠️ Telegram Bot init exception:', err.message);
  }
});

process.once('SIGINT', () => botInstance && botInstance.stop('SIGINT'));
process.once('SIGTERM', () => botInstance && botInstance.stop('SIGTERM'));
