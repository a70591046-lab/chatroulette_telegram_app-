const appTranslations = {
  uz: {
    app_title: "CHATROULETTE",
    start_search: "Suhbatdosh izlash",
    searching_peer: "Suhbatdosh qidirilmoqda...",
    looking_for: "Qidiruv jinsi:",
    gender_any: "Farqi yo'q",
    gender_male: "Erkak",
    gender_female: "Ayol",
    tab_chat: "Muloqot",
    tab_profile: "Profil",
    tab_friends: "Do'stlar",
    tab_admin: "Admin",
    profile_title: "Profil sozlamalari",
    name_label: "Ismingiz:",
    age_label: "Yoshingiz:",
    gender_label: "Jinsingiz:",
    target_label: "Kimni qidiryapsiz?",
    hobbies_label: "Xobbilar va qiziqishlar:",
    save_profile: "Profilni saqlash",
    profile_saved: "✅ Profil saqlandi!",
    likes_count: "Like'lar",
    followers_count: "Obunachilar",
    friends_count: "Do'stlar",
    like_btn: "Like",
    follow_btn: "Follow",
    friend_req_btn: "Do'stlashish",
    skip_btn: "Keyingisi",
    end_btn: "Yakunlash",
    send_msg_placeholder: "Xabar yozing...",
    admin_title: "Admin Panel & Analitika",
    total_users: "Jami foydalanuvchilar",
    dau: "Kunlik faol (DAU)",
    mau: "Oylik faol (MAU)",
    total_calls: "Jami video suhbatlar",
    call_duration: "Umumiy davomiylik",
    gender_split: "Jinslar nisbati",
    lang_split: "Tillar nisbati",
    broadcast_section: "Ommaviy Xabar Yuborish (Broadcasting)",
    broadcast_text: "Xabar matni (Markdown):",
    broadcast_photo: "Rasm URL (Ixtiyoriy):",
    broadcast_voice: "Audio URL (Ixtiyoriy):",
    send_broadcast: "🚀 Barchaga Yuborish",
    sponsor_section: "Majburiy Obuna Kanallari (Guard)",
    channel_id_label: "Kanal Username/ID (masalan @mychannel):",
    channel_title_label: "Kanal Nomi:",
    channel_link_label: "Kanal Havolasi:",
    add_channel_btn: "➕ Kanal Qo'shish",
    no_sponsors: "Hozircha majburiy kanallar yo'q.",
    broadcast_history: "Yuborilgan Xabarlar Tarixi",
    delete: "O'chirish",
    edit: "Tahrirlash"
  },
  ru: {
    app_title: "CHATROULETTE",
    start_search: "Найти собеседника",
    searching_peer: "Поиск собеседника...",
    looking_for: "Искать пол:",
    gender_any: "Неважно",
    gender_male: "Мужчина",
    gender_female: "Женщина",
    tab_chat: "Чат",
    tab_profile: "Профиль",
    tab_friends: "Друзья",
    tab_admin: "Админ",
    profile_title: "Настройки профиля",
    name_label: "Ваше имя:",
    age_label: "Ваш возраст:",
    gender_label: "Ваш пол:",
    target_label: "Кого вы ищете?",
    hobbies_label: "Хобби и интересы:",
    save_profile: "Сохранить профиль",
    profile_saved: "✅ Профиль сохранен!",
    likes_count: "Лайки",
    followers_count: "Подписчики",
    friends_count: "Друзья",
    like_btn: "Лайк",
    follow_btn: "Подписаться",
    friend_req_btn: "В друзья",
    skip_btn: "Следующий",
    end_btn: "Завершить",
    send_msg_placeholder: "Напишите сообщение...",
    admin_title: "Панель Админа и Аналитика",
    total_users: "Всего пользователей",
    dau: "Дневные активные (DAU)",
    mau: "Месячные активные (MAU)",
    total_calls: "Всего видеозвонков",
    call_duration: "Общая длительность",
    gender_split: "Соотношение полов",
    lang_split: "Соотношение языков",
    broadcast_section: "Рассылка сообщений (Broadcasting)",
    broadcast_text: "Текст сообщения (Markdown):",
    broadcast_photo: "URL фото (Опционально):",
    broadcast_voice: "URL аудио (Опционально):",
    send_broadcast: "🚀 Отправить всем",
    sponsor_section: "Обязательные каналы подписки (Guard)",
    channel_id_label: "Username/ID канала (напр. @mychannel):",
    channel_title_label: "Название канала:",
    channel_link_label: "Ссылка на канал:",
    add_channel_btn: "➕ Добавить канал",
    no_sponsors: "Обязательных каналов пока нет.",
    broadcast_history: "История рассылок",
    delete: "Удалить",
    edit: "Изменить"
  }
};

let currentLang = 'uz';

function setAppLanguage(lang) {
  currentLang = (lang === 'ru') ? 'ru' : 'uz';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (appTranslations[currentLang][key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = appTranslations[currentLang][key];
      } else {
        el.innerText = appTranslations[currentLang][key];
      }
    }
  });
  
  // Update lang badge
  const btn = document.getElementById('langToggleBtn');
  if (btn) btn.innerText = currentLang === 'uz' ? '🇺🇿 UZ' : '🇷🇺 RU';
}

function getAppText(key) {
  return appTranslations[currentLang][key] || key;
}
