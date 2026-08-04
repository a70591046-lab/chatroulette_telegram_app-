const translations = {
  uz: {
    welcome: `👋 *Xush kelibsiz! Chatroulette Mini App Botiga!*

🎥 Bu yerda siz tasodifiy suhbatdoshlar bilan video muloqot qilishingiz, yangi do'stlar orttirishingiz va qiziqarli vaqt o'tkazishingiz mumkin.`,
    choose_lang: "🇺🇿 Tilni tanlang / 🇷🇺 Выберите язык:",
    lang_set: "✅ *Til O'zbek tiliga o'zgartirildi!*",
    share_contact_btn: "📱 Telefon raqamni yuborish",
    share_contact_prompt: "🔒 *Mini App-ga kirishdan oldin autentifikatsiya:* \nIltimos, pastdagi \"📱 Telefon raqamni yuborish\" tugmasini bosing.",
    contact_verified: "✅ *Telefon raqamingiz muvaffaqiyatli tasdiqlandi!*",
    sponsor_required_msg: "⚠️ *Mini App-ga kirish uchun quyidagi homiy kanallarga obuna bo'lishingiz shart:*",
    verify_sub_btn: "🔄 Obunani tekshirish",
    open_miniapp_btn: "🚀 Chatroulette Mini App-ni ochish",
    sub_verified: "🎉 Obuna muvaffaqiyatli tekshirildi! Endi Mini App-ni ochishingiz mumkin.",
    sub_not_completed: "❌ Siz hali barcha kanallarga a'zo bo'lmadingiz. Iltimos, a'zo bo'lib qayta tekshiring!",
    admin_welcome: "⚙️ *Admin Panel:* \nSiz admin huquqiga egasiz. Mini App orqali to'liq boshqarishingiz mumkin."
  },
  ru: {
    welcome: `👋 *Добро пожаловать в бота Chatroulette Mini App!*

🎥 Здесь вы можете общаться в случайных видеочатах, находить новых друзей и весело проводить время.`,
    choose_lang: "🇺🇿 Tilni tanlang / 🇷🇺 Выберите язык:",
    lang_set: "✅ *Язык успешно изменен на Русский!*",
    share_contact_btn: "📱 Поделиться номером",
    share_contact_prompt: "🔒 *Аутентификация перед входом в Mini App:* \nПожалуйста, нажмите кнопку \"📱 Поделиться номером\" ниже.",
    contact_verified: "✅ *Ваш номер телефона успешно подтвержден!*",
    sponsor_required_msg: "⚠️ *Для доступа к Mini App необходимо подписаться на следующие спонсорские каналы:*",
    verify_sub_btn: "🔄 Проверить подписку",
    open_miniapp_btn: "🚀 Открыть Chatroulette Mini App",
    sub_verified: "🎉 Подписка успешно подтверждена! Теперь вы можете открыть Mini App.",
    sub_not_completed: "❌ Вы еще не подписались на все каналы. Пожалуйста, подпишитесь и проверьте снова!",
    admin_welcome: "⚙️ *Панель Администратора:* \nВы обладаете правами администратора. Управляйте через Mini App."
  }
};

function getText(lang, key) {
  const l = translations[lang] ? lang : 'uz';
  return translations[l][key] || translations['uz'][key] || key;
}

module.exports = {
  translations,
  getText
};
