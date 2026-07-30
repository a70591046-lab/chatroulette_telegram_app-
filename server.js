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
