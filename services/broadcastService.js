const db = require('../db/database');

class BroadcastService {
  async sendBroadcast(bot, options) {
    const { text, photoUrl, voiceUrl } = options;
    const users = Object.values(db.data.users || {});
    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      const tgId = user.tgId;
      try {
        if (photoUrl && text) {
          await bot.telegram.sendPhoto(tgId, photoUrl, { caption: text, parse_mode: 'Markdown' });
        } else if (photoUrl) {
          await bot.telegram.sendPhoto(tgId, photoUrl);
        } else if (voiceUrl && text) {
          await bot.telegram.sendAudio(tgId, voiceUrl, { caption: text, parse_mode: 'Markdown' });
        } else if (voiceUrl) {
          await bot.telegram.sendAudio(tgId, voiceUrl);
        } else if (text) {
          await bot.telegram.sendMessage(tgId, text, { parse_mode: 'Markdown' });
        }
        successCount++;
      } catch (err) {
        console.error(`Failed to send broadcast to ${tgId}:`, err.message);
        failCount++;
      }
      // Brief rate limit protection
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const logEntry = {
      text: text || '',
      photoUrl: photoUrl || '',
      voiceUrl: voiceUrl || '',
      successCount,
      failCount,
      totalRecipients: users.length,
      status: 'completed'
    };

    db.addBroadcastLog(logEntry);
    return logEntry;
  }
}

module.exports = new BroadcastService();
