const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

const defaultData = {
  users: {},            // tgId -> { tgId, username, firstName, phone, verifiedPhone, lang, gender, targetGender, age, bio, hobbies, likes, followers, friends: [], createdAt }
  sponsors: [           // array of channels { id: '@example', name: 'Example Channel', link: 'https://t.me/example' }
    // default sample sponsor channel if needed
  ],
  likes: [],            // { from: tgId, to: tgId, timestamp }
  follows: [],          // { followerId: tgId, followingId: tgId, timestamp }
  friends: [],          // { user1: tgId, user2: tgId, status: 'accepted'|'pending', timestamp }
  callStats: {
    totalCalls: 0,
    totalDurationSeconds: 0,
    dailyActive: {}     // date (YYYY-MM-DD) -> Set of active tgIds
  },
  broadcasts: []        // { id, text, photoUrl, voiceUrl, sentAt, totalRecipients, status }
};

class Database {
  constructor() {
    this.data = defaultData;
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(path.dirname(DB_FILE))) {
        fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
        // Ensure keys exist
        this.data.users = this.data.users || {};
        this.data.sponsors = this.data.sponsors || [];
        this.data.likes = this.data.likes || [];
        this.data.follows = this.data.follows || [];
        this.data.friends = this.data.friends || [];
        this.data.callStats = this.data.callStats || { totalCalls: 0, totalDurationSeconds: 0, dailyActive: {} };
        this.data.broadcasts = this.data.broadcasts || [];
      } else {
        this.save();
      }
    } catch (e) {
      console.error('Database initialization error:', e);
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error('Database save error:', e);
    }
  }

  // User Management
  getUser(tgId) {
    const id = String(tgId);
    return this.data.users[id] || null;
  }

  saveUser(tgId, userObj) {
    const id = String(tgId);
    const existing = this.data.users[id] || {};
    this.data.users[id] = {
      tgId: id,
      username: userObj.username || existing.username || '',
      firstName: userObj.firstName || existing.firstName || 'Foydalanuvchi',
      phone: userObj.phone || existing.phone || null,
      verifiedPhone: userObj.verifiedPhone !== undefined ? userObj.verifiedPhone : (existing.verifiedPhone || false),
      lang: userObj.lang || existing.lang || 'uz',
      gender: userObj.gender || existing.gender || 'male',
      targetGender: userObj.targetGender || existing.targetGender || 'any',
      age: userObj.age || existing.age || 20,
      bio: userObj.bio || existing.bio || '',
      hobbies: userObj.hobbies || existing.hobbies || ['IT', 'Gaming'],
      likes: userObj.likes !== undefined ? userObj.likes : (existing.likes || 0),
      followers: userObj.followers !== undefined ? userObj.followers : (existing.followers || 0),
      avatar: userObj.avatar || existing.avatar || 'avatar_1',
      createdAt: existing.createdAt || new Date().toISOString()
    };
    this.save();
    return this.data.users[id];
  }

  setUserLang(tgId, lang) {
    const user = this.getUser(tgId) || { tgId: String(tgId) };
    user.lang = lang;
    return this.saveUser(tgId, user);
  }

  setVerifiedPhone(tgId, phone) {
    const user = this.getUser(tgId) || { tgId: String(tgId) };
    user.phone = phone;
    user.verifiedPhone = true;
    return this.saveUser(tgId, user);
  }

  recordActivity(tgId) {
    const today = new Date().toISOString().split('T')[0];
    if (!this.data.callStats.dailyActive) {
      this.data.callStats.dailyActive = {};
    }
    if (!Array.isArray(this.data.callStats.dailyActive[today])) {
      this.data.callStats.dailyActive[today] = [];
    }
    const idStr = String(tgId);
    if (!this.data.callStats.dailyActive[today].includes(idStr)) {
      this.data.callStats.dailyActive[today].push(idStr);
      this.save();
    }
  }

  // Sponsor Channel Management
  getSponsors() {
    return this.data.sponsors;
  }

  addSponsor(channelUsernameOrId, title, inviteLink) {
    const exists = this.data.sponsors.find(s => s.id === channelUsernameOrId);
    if (!exists) {
      this.data.sponsors.push({
        id: channelUsernameOrId,
        title: title || channelUsernameOrId,
        link: inviteLink || `https://t.me/${channelUsernameOrId.replace('@', '')}`
      });
      this.save();
    }
    return this.data.sponsors;
  }

  removeSponsor(channelUsernameOrId) {
    this.data.sponsors = this.data.sponsors.filter(s => s.id !== channelUsernameOrId);
    this.save();
    return this.data.sponsors;
  }

  // Social interactions
  addLike(fromId, toId) {
    const from = String(fromId);
    const to = String(toId);
    this.data.likes.push({ from, to, timestamp: Date.now() });
    
    // Update target user's likes count
    const targetUser = this.getUser(to);
    if (targetUser) {
      targetUser.likes = (targetUser.likes || 0) + 1;
      this.saveUser(to, targetUser);
    } else {
      this.save();
    }
  }

  addFollow(followerId, followingId) {
    const follower = String(followerId);
    const following = String(followingId);
    const exists = this.data.follows.find(f => f.followerId === follower && f.followingId === following);
    if (!exists) {
      this.data.follows.push({ followerId: follower, followingId: following, timestamp: Date.now() });
      const targetUser = this.getUser(following);
      if (targetUser) {
        targetUser.followers = (targetUser.followers || 0) + 1;
        this.saveUser(following, targetUser);
      } else {
        this.save();
      }
    }
  }

  addFriendRequest(user1, user2) {
    const u1 = String(user1);
    const u2 = String(user2);
    const existing = this.data.friends.find(f => (f.user1 === u1 && f.user2 === u2) || (f.user1 === u2 && f.user2 === u1));
    if (!existing) {
      this.data.friends.push({ user1: u1, user2: u2, status: 'accepted', timestamp: Date.now() });
      this.save();
    }
  }

  getUserFriends(tgId) {
    const id = String(tgId);
    const friendLinks = this.data.friends.filter(f => (f.user1 === id || f.user2 === id) && f.status === 'accepted');
    const friends = [];
    friendLinks.forEach(f => {
      const friendId = f.user1 === id ? f.user2 : f.user1;
      const user = this.getUser(friendId);
      if (user) {
        friends.push({
          tgId: user.tgId,
          firstName: user.firstName,
          gender: user.gender
        });
      }
    });
    return friends;
  }

  // Call stats
  recordCall(durationSeconds) {
    this.data.callStats.totalCalls = (this.data.callStats.totalCalls || 0) + 1;
    this.data.callStats.totalDurationSeconds = (this.data.callStats.totalDurationSeconds || 0) + durationSeconds;
    this.save();
  }

  // Analytics
  getAnalytics() {
    const allUsers = Object.values(this.data.users);
    const totalUsers = allUsers.length;

    let maleCount = 0;
    let femaleCount = 0;
    let uzCount = 0;
    let ruCount = 0;

    allUsers.forEach(u => {
      if (u.gender === 'female') femaleCount++;
      else maleCount++;

      if (u.lang === 'ru') ruCount++;
      else uzCount++;
    });

    const today = new Date().toISOString().split('T')[0];
    const dau = (this.data.callStats.dailyActive && this.data.callStats.dailyActive[today]) 
      ? this.data.callStats.dailyActive[today].length 
      : 0;

    // Monthly active (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const mauSet = new Set();
    
    if (this.data.callStats.dailyActive) {
      Object.keys(this.data.callStats.dailyActive).forEach(dateStr => {
        if (new Date(dateStr) >= thirtyDaysAgo) {
          (this.data.callStats.dailyActive[dateStr] || []).forEach(id => mauSet.add(id));
        }
      });
    }

    return {
      totalUsers,
      dau,
      mau: mauSet.size,
      genderRatio: { male: maleCount, female: femaleCount },
      langRatio: { uz: uzCount, ru: ruCount },
      totalCalls: this.data.callStats.totalCalls || 0,
      totalDurationSeconds: this.data.callStats.totalDurationSeconds || 0,
      sponsorsCount: this.data.sponsors.length
    };
  }

  // Broadcast Log Management
  addBroadcastLog(logObj) {
    this.data.broadcasts.unshift({
      id: Date.now().toString(),
      ...logObj,
      sentAt: new Date().toISOString()
    });
    this.save();
  }

  updateBroadcastLog(id, newContent) {
    const item = this.data.broadcasts.find(b => b.id === id);
    if (item) {
      if (newContent.text !== undefined) item.text = newContent.text;
      if (newContent.status !== undefined) item.status = newContent.status;
      this.save();
    }
  }

  deleteBroadcastLog(id) {
    this.data.broadcasts = this.data.broadcasts.filter(b => b.id !== id);
    this.save();
  }
}

module.exports = new Database();
