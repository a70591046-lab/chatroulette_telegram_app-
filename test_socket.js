const { io } = require('socket.io-client');

const socket = io('https://web-production-65a7f.up.railway.app', {
  query: { tgId: '7713174177' },
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('Socket connected successfully! ID:', socket.id);
  
  socket.emit('start-search', {
    tgId: '7713174177',
    profile: { firstName: 'Test' }
  });
});

socket.on('searching', () => {
  console.log('Received searching event from server!');
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('Socket connection error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout waiting for connection/search');
  process.exit(1);
}, 5000);
