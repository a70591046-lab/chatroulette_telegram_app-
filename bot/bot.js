const { Telegraf, Markup } = require('telegraf');
const config = require('../config');
const db = require('../db/database');
const { getText } = require('./i18n');

function initBot() {
  const bot = new Telegraf(config.BOT_TOKEN);

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

    const webAppUrl = `${config.WEBAPP_URL}?tgId=${tgId}`;
    const isHttps = webAppUrl.startsWith('https://');

    // Dynamically update Telegram Bot Menu Button for instant persistent WebApp access
    if (isHttps) {
      try {
        await bot.telegram.setChatMenuButton({
          chat_id: tgId,
          menu_button: {
            type: 'web_app',
            text: '🚀 Mini App',
            web_app: { url: webAppUrl }
          }
        });
      } catch (err) {
        console.warn('Failed to set chat menu button:', err.message);
      }
    }

    const inlineButtons = [
      [
        Markup.button.callback('🇺🇿 O\'zbekcha', 'set_lang_uz'),
        Markup.button.callback('🇷🇺 Русский', 'set_lang_ru')
      ]
    ];

    if (isHttps) {
      inlineButtons.push([
        Markup.button.webApp(getText(lang, 'open_miniapp_btn'), webAppUrl)
      ]);
      inlineButtons.push([
        Markup.button.url('🌐 Brauzerda to\'liq ochish', webAppUrl)
      ]);
    } else {
      inlineButtons.push([
        Markup.button.url(getText(lang, 'open_miniapp_btn'), webAppUrl)
      ]);
    }

    await ctx.replyWithMarkdown(
      `🚀 *${getText(lang, 'open_miniapp_btn')}*\n\nSuhbatni boshlash va Mini App-ni to'liq ekranda ochish uchun pastdagi tugmani bosing:`,
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

  return bot;
}

module.exports = {
  initBot
};
