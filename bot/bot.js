const { Telegraf, Markup } = require('telegraf');
const config = require('../config');
const db = require('../db/database');
const { getText } = require('./i18n');

let botInstance = null;

function initBot() {
  const bot = new Telegraf(config.BOT_TOKEN);
  botInstance = bot;

  // Helper: Check if user is subscribed to all mandatory sponsor channels
  async function checkSponsorSubscription(userId) {
    const sponsors = db.getSponsors();
    if (!sponsors || sponsors.length === 0) return true;

    for (const sponsor of sponsors) {
      try {
        const member = await bot.telegram.getChatMember(sponsor.id, userId);
        if (['left', 'kicked', 'restricted'].includes(member.status)) {
          return false;
        }
      } catch (err) {
        console.error(`Error checking chat member for ${sponsor.id}:`, err.message);
      }
    }
    return true;
  }

  // /start handler
  bot.start(async (ctx) => {
    try {
      const tgId = ctx.from.id;
      const username = ctx.from.username || '';
      const firstName = ctx.from.first_name || 'Foydalanuvchi';

      let user = db.getUser(tgId);
      if (!user) {
        user = db.saveUser(tgId, { username, firstName, lang: 'uz' });
      }
      db.recordActivity(tgId);

      const lang = user.lang || 'uz';
      const text = getText(lang, 'welcome');
      
      await sendMainMenu(ctx, tgId, lang);
    } catch (err) {
      console.error('Error in /start command:', err.message);
    }
  });

  const broadcastService = require('../services/broadcastService');
  const adminState = {};

  // /admin handler
  bot.command('admin', async (ctx) => {
    try {
      const tgId = String(ctx.from.id);
      if (!config.ADMIN_IDS.includes(tgId)) return;

      adminState[tgId] = null; // reset state
      
      const adminPanelUrl = `${config.WEBAPP_URL}/admin.html?token=${tgId}`;

      const inlineButtons = [
        [Markup.button.url('🖥 Admin Panel (Web)', adminPanelUrl)],
        [Markup.button.callback('📊 Statistika', 'admin_stats')],
        [Markup.button.callback('📥 Foydalanuvchilar ro\'yxati (TXT)', 'admin_users_list')],
        [Markup.button.callback('📢 Majburiy obunalar', 'admin_sponsors')],
        [Markup.button.callback('✉️ Xabar yuborish', 'admin_broadcast')]
      ];

      await ctx.reply(`🛡 Admin Paneliga Xush Kelibsiz!

🌐 Web panel tayyor — pastdagi tugmani bosing:
🔑 Siz avtomatik kirasiz (ID: ${tgId})`, {
        ...Markup.inlineKeyboard(inlineButtons)
      });
    } catch (err) {
      console.error('Error in /admin command:', err.message);
    }
  });

  bot.action('admin_stats', async (ctx) => {
    try {
      const tgId = String(ctx.from.id);
      if (!config.ADMIN_IDS.includes(tgId)) return;
      
      const stats = db.getAnalytics();
      let msg = `📊 Platforma Statistikasi:\n\n` +
                  `👥 Jami foydalanuvchilar: ${stats.totalUsers}\n` +
                  `📈 Kunlik faol (DAU): ${stats.dau}\n` +
                  `📅 Oylik faol (MAU): ${stats.mau}\n` +
                  `📞 Jami video suhbatlar: ${stats.totalCalls}\n` +
                  `⏱ Umumiy davomiylik: ${Math.floor(stats.totalDurationSeconds / 60)} daqiqa\n\n` +
                  `👨 Erkaklar: ${stats.genderRatio.male} | 👩 Ayollar: ${stats.genderRatio.female}\n` +
                  `🇺🇿 UZ: ${stats.langRatio.uz} | 🇷🇺 RU: ${stats.langRatio.ru}\n\n` +
                  `📋 Foydalanuvchilar:\n`;
                  
      const users = db.data.users;
      let count = 1;
      for (const id in users) {
        const u = users[id];
        const username = u.username ? `@${u.username}` : 'Yo\'q';
        const gender = u.gender === 'female' ? 'Ayol' : 'Erkak';
        const line = `${count}. ${u.tgId} | ${u.firstName} | ${username} | ${gender} | ${u.age}\n`;
        if (msg.length + line.length > 4000) {
          msg += `...va yana boshqalar. Toliq ro'yxatni olish uchun pastdagi TXT tugmasini bosing.`;
          break;
        }
        msg += line;
        count++;
      }
                  
      await ctx.answerCbQuery();
      await ctx.reply(msg);
    } catch (err) {
      console.error(err);
    }
  });

  bot.action('admin_users_list', async (ctx) => {
    try {
      const tgId = String(ctx.from.id);
      if (!config.ADMIN_IDS.includes(tgId)) return;
      
      const users = db.data.users;
      let textContent = "Foydalanuvchilar Ro'yxati:\n\n";
      let count = 1;
      for (const id in users) {
        const u = users[id];
        const username = u.username ? `@${u.username}` : 'Yo\'q';
        const gender = u.gender === 'female' ? 'Ayol' : 'Erkak';
        textContent += `${count}. ID: ${u.tgId} | Ism: ${u.firstName} | Nik: ${username} | Jins: ${gender} | Yosh: ${u.age}\n`;
        count++;
      }
      
      await ctx.answerCbQuery();
      await ctx.replyWithDocument({
        source: Buffer.from(textContent, 'utf8'),
        filename: 'foydalanuvchilar.txt'
      }, { caption: "Tizimdagi barcha foydalanuvchilar ro'yxati." });
    } catch (err) {
      console.error(err);
      await ctx.reply("Xatolik yuz berdi.");
    }
  });

  bot.action('admin_sponsors', async (ctx) => {
    try {
      const tgId = String(ctx.from.id);
      if (!config.ADMIN_IDS.includes(tgId)) return;
      
      const sponsors = db.getSponsors();
      let msg = `📢 **Majburiy Obunalar Ro'yxati:**\n\n`;
      if (sponsors.length === 0) {
        msg += `Hozircha hech qanday majburiy obuna yo'q.\n`;
      } else {
        sponsors.forEach((s, i) => {
          msg += `${i+1}. [${s.title}](${s.link}) (ID: ${s.id})\n`;
        });
      }
      msg += `\nYangi qo'shish uchun xabarga javob qilib quyidagi formatda jo'nating:\n\n\`/add_sponsor @KanalUsername Kanal_Nomi https://t.me/KanalUsername\``;
      
      await ctx.answerCbQuery();
      await ctx.reply(msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
    } catch (err) {
      console.error(err);
    }
  });

  bot.action('admin_broadcast', async (ctx) => {
    try {
      const tgId = String(ctx.from.id);
      if (!config.ADMIN_IDS.includes(tgId)) return;
      
      adminState[tgId] = { step: 'waiting_broadcast' };
      await ctx.answerCbQuery();
      await ctx.reply('✉️ **Barchaga xabar yuborish:**\n\nIltimos, yubormoqchi bo\'lgan xabaringizni (rasm, video yoki oddiy matn) hozir shu yerga yuboring. Bekor qilish uchun /cancel bosing.', { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(err);
    }
  });

  bot.command('cancel', async (ctx) => {
    const tgId = String(ctx.from.id);
    if (adminState[tgId]) {
      adminState[tgId] = null;
      await ctx.reply('Bekor qilindi.');
    }
  });

  bot.on('message', async (ctx, next) => {
    const tgId = String(ctx.from.id);
    if (!config.ADMIN_IDS.includes(tgId)) return next();

    // Handle add_sponsor command directly
    if (ctx.message.text && ctx.message.text.startsWith('/add_sponsor')) {
      const parts = ctx.message.text.split(' ');
      if (parts.length >= 4) {
        const id = parts[1];
        const link = parts[parts.length - 1];
        const title = parts.slice(2, parts.length - 1).join(' ');
        db.addSponsor(id, title, link);
        return ctx.reply(`✅ Kanal qo'shildi: ${title} (${id})`);
      } else {
        return ctx.reply(`Xato format! Namuna:\n\`/add_sponsor @KanalUsername Kanal Nomi https://t.me/KanalUsername\``, { parse_mode: 'Markdown' });
      }
    }

    if (ctx.message.text && ctx.message.text.startsWith('/remove_sponsor')) {
      const parts = ctx.message.text.split(' ');
      if (parts.length >= 2) {
        db.removeSponsor(parts[1]);
        return ctx.reply(`✅ Kanal o'chirildi: ${parts[1]}`);
      }
    }

    if (adminState[tgId] && adminState[tgId].step === 'waiting_broadcast') {
      adminState[tgId] = null;
      await ctx.reply('Barchaga xabar yuborish boshlandi... Bu biroz vaqt olishi mumkin.');
      try {
        let text = ctx.message.text || ctx.message.caption || '';
        let photoUrl = '';
        let voiceUrl = '';
        
        // Simple logic for broadcast using broadcastService
        // We will just pass the text for now, or just copy message
        const result = await broadcastService.sendBroadcast(bot, { text });
        await ctx.reply(`✅ Xabar yuborish yakunlandi.\n\nMuvaffaqiyatli: ${result.successful}\nXato: ${result.failed}`);
      } catch (e) {
        await ctx.reply('Xatolik yuz berdi: ' + e.message);
      }
      return;
    }

    return next();
  });

  // Language switch handlers
  bot.action('set_lang_uz', async (ctx) => {
    try {
      const tgId = ctx.from.id;
      db.setUserLang(tgId, 'uz');
      await ctx.answerCbQuery('O\'zbek tili tanlandi');
      await sendMainMenu(ctx, tgId, 'uz');
    } catch (e) {
      console.error('Error in set_lang_uz:', e.message);
    }
  });

  bot.action('set_lang_ru', async (ctx) => {
    try {
      const tgId = ctx.from.id;
      db.setUserLang(tgId, 'ru');
      await ctx.answerCbQuery('Русский язык выбран');
      await sendMainMenu(ctx, tgId, 'ru');
    } catch (e) {
      console.error('Error in set_lang_ru:', e.message);
    }
  });

  // Contact Handler
  bot.on('contact', async (ctx) => {
    try {
      const tgId = ctx.from.id;
      const contact = ctx.message.contact;

      if (contact && String(contact.user_id) === String(tgId)) {
        db.setVerifiedPhone(tgId, contact.phone_number);
        const user = db.getUser(tgId);
        const lang = user ? user.lang : 'uz';

        await ctx.reply(
          getText(lang, 'contact_verified'),
          Markup.removeKeyboard()
        );

        await sendMainMenu(ctx, tgId, lang);
      } else {
        await ctx.reply("❌ O'zingizning telefon raqamingizni yuboring!");
      }
    } catch (err) {
      console.error('Error in contact handler:', err.message);
    }
  });

  // Verify Subscription Callback
  bot.action('check_subscription', async (ctx) => {
    try {
      const tgId = ctx.from.id;
      const user = db.getUser(tgId);
      const lang = user ? user.lang : 'uz';

      const isSubscribed = await checkSponsorSubscription(tgId);
      if (isSubscribed) {
        await ctx.answerCbQuery(getText(lang, 'sub_verified'));
        await sendMainMenu(ctx, tgId, lang);
      } else {
        await ctx.answerCbQuery(getText(lang, 'sub_not_completed'), { show_alert: true });
        await sendSponsorGuardMessage(ctx, tgId, lang);
      }
    } catch (err) {
      console.error('Error in check_subscription:', err.message);
    }
  });

  // Helper: Send main menu with Mini App button or Sponsor guard
  async function sendMainMenu(ctx, tgId, lang) {
    const user = db.getUser(tgId);
    if (!user) return;

    const isSubscribed = await checkSponsorSubscription(tgId);

    if (!isSubscribed) {
      await sendSponsorGuardMessage(ctx, tgId, lang);
      return;
    }

    const webAppUrlSolo = `${config.WEBAPP_URL}?tgId=${tgId}&mode=solo&v=100`;
    const webAppUrlGroup = `${config.WEBAPP_URL}?tgId=${tgId}&mode=group&v=100`;
    const webAppUrlMain = `${config.WEBAPP_URL}?tgId=${tgId}&v=100`;

    // Dynamically update Telegram Bot Menu Button for instant persistent WebApp access
    if (isHttps) {
      try {
        await bot.telegram.setChatMenuButton({
          chat_id: tgId,
          menu_button: {
            type: 'web_app',
            text: '⚡ Muloqot Turini Tanlash',
            web_app: { url: webAppUrlMain }
          }
        });
      } catch (err) {
        console.warn('Failed to set chat menu button:', err.message);
      }
    }

    const inlineButtons = [];

    if (isHttps) {
      inlineButtons.push([
        Markup.button.webApp('👤 1-ga-1 Chat Ochish', webAppUrlSolo),
        Markup.button.webApp('👥 Guruh Ochish', webAppUrlGroup)
      ]);
      inlineButtons.push([
        Markup.button.webApp('🚀 Asosiy Mini App', webAppUrlMain)
      ]);
      inlineButtons.push([
        Markup.button.url('🌐 Brauzerda ochish', webAppUrlMain)
      ]);
    } else {
      inlineButtons.push([
        Markup.button.url('👤 1-ga-1 Chat Ochish', webAppUrlSolo),
        Markup.button.url('👥 Guruh Ochish', webAppUrlGroup)
      ]);
      inlineButtons.push([
        Markup.button.url(getText(lang, 'open_miniapp_btn'), webAppUrlMain)
      ]);
    }

    inlineButtons.push([
      Markup.button.callback('🇺🇿 O\'zbekcha', 'set_lang_uz'),
      Markup.button.callback('🇷🇺 Русский', 'set_lang_ru')
    ]);

    await ctx.replyWithMarkdown(
      `💬 *Muloqot Turini Tanlang:*\n\n1️⃣ **👤 1-ga-1 Chat Ochish** — Tasodifiy suhbatdosh bilan 1-ga-1 muloqot.\n2️⃣ **👥 Guruh Ochish** — 4 kishilik Guruh Video Lounge xonasi yaratish va muloqot qilish.`,
      Markup.inlineKeyboard(inlineButtons)
    );
  }

  // Helper: Send sponsor guard prompt with channel links
  async function sendSponsorGuardMessage(ctx, tgId, lang) {
    const sponsors = db.getSponsors();
    const inlineButtons = [];

    sponsors.forEach((sp) => {
      inlineButtons.push([
        Markup.button.url(`📢 ${sp.title || sp.id}`, sp.link)
      ]);
    });

    inlineButtons.push([
      Markup.button.callback(getText(lang, 'verify_sub_btn'), 'check_subscription')
    ]);

    await ctx.replyWithMarkdown(
      getText(lang, 'sponsor_required_msg'),
      Markup.inlineKeyboard(inlineButtons)
    );
  }

  bot.action(/^ban_user_(.+)$/, async (ctx) => {
    try {
      const tgId = String(ctx.from.id);
      if (!config.ADMIN_IDS.includes(tgId)) return;
      
      const targetId = ctx.match[1];
      db.banUser(targetId);
      
      await ctx.answerCbQuery('Foydalanuvchi bloklandi!');
      await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ BLOKLANGAN', {
        reply_markup: { inline_keyboard: [] }
      });
      
      const { disconnectUser } = require('../services/webrtcSignaling');
      if (typeof disconnectUser === 'function') {
        disconnectUser(targetId);
      }
    } catch (err) {
      console.error(err);
    }
  });

  return bot;
}

async function sendToAdmins(msg, extra) {
  if (!botInstance) return;
  for (const adminId of config.ADMIN_IDS) {
    try {
      await botInstance.telegram.sendMessage(adminId, msg, extra);
    } catch (e) { console.error("Admin xabar yuborishda xato:", e); }
  }
}

function getBotInstance() {
  return botInstance;
}

module.exports = {
  initBot,
  sendToAdmins,
  getBotInstance
};

