import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// --- CONFIGURATION ---
// Configuration constants for the bot
const TOKEN = Deno.env.get("BOT_TOKEN");
if (!TOKEN) throw new Error("BOT_TOKEN env var is required");
const API = `https://api.telegram.org/bot${TOKEN}`;
const ADMIN_USERNAME = "Masakoff"; // The admin username (without @)
const BOT_USERNAME = "XOGridBot";

// --- KV DATABASE ---
// Open Deno KV database for persistent storage
const kv = await Deno.openKv();

// --- TYPES ---
// Type definitions for user profiles, matches, queues, withdrawals, and payments
type Lang = "en" | "ru";

interface UserProfile {
  id: number;
  username?: string;
  firstName: string;
  language: Lang | null; // null means not selected yet
  registrationDate?: number;
  xog: number;
  inAppStars: number;
  withdrawalStars: number;
  referrals: number;
  earnedFromReferrals: number;
  trophies: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  lastDailyBonus: number;
  lastActive: number;
  referredBy?: number;
  hasPlayedTrophy?: boolean;
}

interface Match {
  id: string;
  p1: number;
  p2: number;
  type: "trophy" | "star";
  board: string[]; // 9 cells, "" or "X" or "O"
  turn: number; // User ID whose turn it is
  p1Mark: "X";
  p2Mark: "O";
  rounds: number; // Current round number (1, 2, 3)
  wins: { [userId: number]: number }; // Round wins
  msgIds: { [userId: number]: number }; // To edit messages
  active: boolean;
  lastMoveTime: number;
}

interface QueueEntry {
  userId: number;
  joinTime: number;
}

interface Withdrawal {
  userId: number;
  amount: number;
  timestamp: number;
  completed: boolean;
}

interface Payment {
  id: string;
  userId: number;
  amount: number;
  timestamp: number;
}

interface Stats {
  totalMatches: number;
  totalStarsDistributed: number;
  totalStarsPurchased: number;
}

// --- LOCALIZATION ---
// Localized texts with emojis for better user experience
const texts: Record<Lang, Record<string, string>> = {
  en: {
    chooseLang: "🌍 Choose your language",
    english: "🇬🇧 English",
    russian: "🇷🇺 Русский",
    welcome: "👋 Welcome! Language selected.",
    menu: "📋 Main Menu",
    play: "🎮 Play",
    playTrophy: "🏆 Play Trophy Match",
    playStar: "⭐ Play Star Match",
    referrals: "👥 Referrals",
    leaderboard: "🏅 Leaderboard",
    leaderboardTrophies: "🏅 Trophies",
    leaderboardStars: "🌟 Stars",
    withdraw: "💸 Withdraw",
    topUp: "➕ Top Up",
    exchange: "🔄 Exchange",
    dailyBonus: "🎁 Claim Daily Bonus",
    adminPanel: "🔧 Admin Panel",
    yourTurn: "🔹 Your turn!",
    opponentTurn: "⏳ Opponent's turn...",
    youWinRound: "🎉 You won the round!",
    opponentWinRound: "😔 Opponent won the round!",
    tieRound: "🤝 Tie round!",
    youWinMatch: "🏆 You won the match!",
    youLoseMatch: "❌ You lost the match!",
    tieMatch: "🤝 Match tied!",
    matchStarted: "⚔️ Match started against @{username}! Get ready!",
    invalidAmount: "❌ Invalid amount. Please enter a number ≥ 1",
    enterAmount: "➕ Enter the number of stars you want to top up\n\nMinimum: 1 ⭐",
    paymentSuccess: "✅ Payment successful!\n⭐ ",
    starsAdded: " in-app stars added to your balance",
    alreadyInMatch: "🚫 You are already in a match.",
    alreadyInQueue: "⏳ You are already in the queue.",
    insufficientStars: "⚠️ Insufficient in-app stars.",
    dailyClaimedXOG: "🎁 Daily bonus claimed! +{amount} XOG",
    dailyNotReady: "⏰ Daily bonus not ready yet. Try again in 24 hours.",
    profileText: "👤 Your Profile:\n\n📅 Registration date: <code>{regDate}</code>\n🆔 ID: <code>{id}</code>\n💰 Balance: <code>{xog}</code> XOG\n⭐ In-app stars: <code>{inAppStars}</code>\n💸 Withdrawal stars: <code>{withdrawalStars}</code>\n👥 Referrals: <code>{referrals}</code>\n💵 Earned from referrals: <code>{earned}</code> XOG\n🏆 Trophy: <code>{trophies}</code>\n🎮 Matches Played: <code>{matches}</code>\n🏅 Wins / Losses: <code>{wins}</code>/{losses}",
    leaderboardTrophiesText: "🏅 Top 10 by Trophies:\n",
    leaderboardStarsText: "🌟 Top 10 by Stars:\n",
    accessDenied: "🚫 Access denied.",
    adminMenu: "🔧 Admin Panel",
    adminViewPlayers: "👥 View Player Profiles",
    adminModifyBalances: "⚖️ Modify Balances",
    adminStats: "📊 Bot Statistics",
    adminWithdrawals: "💸 Pending Withdrawals",
    adminPayments: "📜 Payment History",
    enterUser: "🔍 Enter user ID or username",
    userNotFound: "❓ User not found.",
    adminModifyActions: "⚖️ Modify for {username}:\nChoose action",
    addTrophy: "➕ Add Trophies",
    removeTrophy: "➖ Remove Trophies",
    addInAppStar: "➕ Add In-App Stars",
    removeInAppStar: "➖ Remove In-App Stars",
    addWithdrawalStar: "➕ Add Withdrawal Stars",
    removeWithdrawalStar: "➖ Remove Withdrawal Stars",
    addXog: "➕ Add XOG",
    removeXog: "➖ Remove XOG",
    enterModifyAmount: "🔢 Enter amount to {action}",
    balanceModified: "✅ Balance modified.",
    statsText: "📊 Bot Stats:\n👥 Total Users: {users}\n🟢 Active Users (24h): {active}\n🎮 Total Matches: {matches}\n🌟 Total Stars Distributed: {stars}\n💰 Total Stars Purchased: {purchased}",
    pendingWithdrawals: "💸 Pending Withdrawals:\n",
    completeWithdraw: "✅ Complete",
    withdrawalRequest: "💸 Withdrawal request from @{username} for {amount} stars",
    withdrawalCompleted: "✅ Withdrawal completed for {amount} stars",
    withdrawalInsufficient: "⚠️ Insufficient stars for withdrawal.",
    withdrawalMin: "⚠️ Minimum withdrawal is 50 stars.",
    withdrawalPending: "⏳ You already have a pending withdrawal.",
    withdrawalSuccess: "✅ Withdrawal request sent. Waiting for admin approval.",
    enterWithdrawAmount: "💸 Enter the number of stars to withdraw\n\nMinimum: 50 ⭐\nYou have {stars} ⭐",
    invalidWithdrawAmount: "❌ Invalid amount. Please enter a number ≥ 50 and ≤ your balance",
    playText: "You can play for real stars or trophy",
    referralsText: "For every referral that sign up with your link and at least one time plays one trophy match you will be received 10 XOG\n\n{refLink}",
    leaderboardText: "See leaderboard",
    exchangeAmount: "Enter the number of stars to exchange\n\nMinimum: 1 ⭐\nYou have {withdrawal} ⭐",
    invalidExchange: "❌ Invalid amount. Please enter a number ≥ 1 and ≤ your balance",
    exchangeSuccess: "✅ Exchange successful! {amount} stars moved to in-app",
    cantFindOpponent: "❌ Can't find opponent. Removed from queue.",
    back: "🔙 Back",
    copy: "📋 Copy",
    share: "📤 Share",
  },
  ru: {
    chooseLang: "🌍 Выберите язык",
    english: "🇬🇧 Английский",
    russian: "🇷🇺 Русский",
    welcome: "👋 Добро пожаловать! Язык выбран.",
    menu: "📋 Главное меню",
    play: "🎮 Играть",
    playTrophy: "🏆 Играть в матч за трофеи",
    playStar: "⭐ Играть в матч за звезды",
    referrals: "👥 Рефералы",
    leaderboard: "🏅 Лидерборд",
    leaderboardTrophies: "🏅 Трофеи",
    leaderboardStars: "🌟 Звезды",
    withdraw: "💸 Вывести",
    topUp: "➕ Пополнить",
    exchange: "🔄 Обменять",
    dailyBonus: "🎁 Забрать ежедневный бонус",
    adminPanel: "🔧 Панель админа",
    yourTurn: "🔹 Ваш ход!",
    opponentTurn: "⏳ Ход оппонента...",
    youWinRound: "🎉 Вы выиграли раунд!",
    opponentWinRound: "😔 Оппонент выиграл раунд!",
    tieRound: "🤝 Ничья в раунде!",
    youWinMatch: "🏆 Вы выиграли матч!",
    youLoseMatch: "❌ Вы проиграли матч!",
    tieMatch: "🤝 Матч ничья!",
    matchStarted: "⚔️ Матч начался против @{username}! Приготовьтесь!",
    invalidAmount: "❌ Неверная сумма. Введите число ≥ 1",
    enterAmount: "➕ Введите количество звезд для пополнения\n\nМинимум: 1 ⭐",
    paymentSuccess: "✅ Оплата успешна!\n⭐ ",
    starsAdded: " in-app звезд добавлено на баланс",
    alreadyInMatch: "🚫 Вы уже в матче.",
    alreadyInQueue: "⏳ Вы уже в очереди.",
    insufficientStars: "⚠️ Недостаточно in-app звезд.",
    dailyClaimedXOG: "🎁 Ежедневный бонус получен! +{amount} XOG",
    dailyNotReady: "⏰ Ежедневный бонус еще не готов. Попробуйте через 24 часа.",
    profileText: "👤 Ваш Профиль:\n\n📅 Дата регистрации: <code>{regDate}</code>\n🆔 ID: <code>{id}</code>\n💰 Баланс: <code>{xog}</code> XOG\n⭐ In-app stars: <code>{inAppStars}</code>\n💸 Withdrawal stars: <code>{withdrawalStars}</code>\n👥 Рефералы: <code>{referrals}</code>\n💵 Заработано от рефералов: <code>{earned}</code> XOG\n🏆 Трофеи: <code>{trophies}</code>\n🎮 Матчей сыграно: <code>{matches}</code>\n🏅 Побед / Поражений: <code>{wins}</code>/{losses}",
    leaderboardTrophiesText: "🏅 Топ 10 по трофеям:\n",
    leaderboardStarsText: "🌟 Топ 10 по звездам:\n",
    accessDenied: "🚫 Доступ запрещен.",
    adminMenu: "🔧 Панель админа",
    adminViewPlayers: "👥 Просмотр профилей игроков",
    adminModifyBalances: "⚖️ Изменить балансы",
    adminStats: "📊 Статистика бота",
    adminWithdrawals: "💸 Ожидающие выводы",
    adminPayments: "📜 История платежей",
    enterUser: "🔍 Введите ID или username пользователя",
    userNotFound: "❓ Пользователь не найден.",
    adminModifyActions: "⚖️ Изменить для {username}:\nВыберите действие",
    addTrophy: "➕ Добавить трофеи",
    removeTrophy: "➖ Убрать трофеи",
    addInAppStar: "➕ Добавить In-App Stars",
    removeInAppStar: "➖ Убрать In-App Stars",
    addWithdrawalStar: "➕ Добавить Withdrawal Stars",
    removeWithdrawalStar: "➖ Убрать Withdrawal Stars",
    addXog: "➕ Добавить XOG",
    removeXog: "➖ Убрать XOG",
    enterModifyAmount: "🔢 Введите сумму для {action}",
    balanceModified: "✅ Баланс изменен.",
    statsText: "📊 Статистика бота:\n👥 Всего пользователей: {users}\n🟢 Активных (24ч): {active}\n🎮 Всего матчей: {matches}\n🌟 Всего звезд распределено: {stars}\n💰 Всего звезд куплено: {purchased}",
    pendingWithdrawals: "💸 Ожидающие выводы:\n",
    completeWithdraw: "✅ Завершить",
    withdrawalRequest: "💸 Запрос на вывод от @{username} на {amount} звезд",
    withdrawalCompleted: "✅ Вывод завершен на {amount} звезд",
    withdrawalInsufficient: "⚠️ Недостаточно звезд для вывода.",
    withdrawalMin: "⚠️ Минимальный вывод 50 звезд.",
    withdrawalPending: "⏳ У вас уже есть ожидающий вывод.",
    withdrawalSuccess: "✅ Запрос на вывод отправлен. Ожидайте одобрения админа.",
    enterWithdrawAmount: "💸 Введите количество звезд для вывода\n\nМинимум: 50 ⭐\nУ вас {stars} ⭐",
    invalidWithdrawAmount: "❌ Неверная сумма. Введите число ≥ 50 и ≤ вашему балансу",
    playText: "Вы можете играть за реальные звезды или трофеи",
    referralsText: "За каждого реферала, который зарегистрируется по вашей ссылке и хотя бы один раз сыграет в трофейный матч, вы получите 10 XOG\n\n{refLink}",
    leaderboardText: "Просмотр лидерборда",
    exchangeAmount: "Введите количество звезд для обмена\n\nМинимум: 1 ⭐\nУ вас {withdrawal} ⭐",
    invalidExchange: "❌ Неверная сумма. Введите число ≥ 1 и ≤ вашему балансу",
    exchangeSuccess: "✅ Обмен успешен! {amount} звезд перемещено в in-app",
    cantFindOpponent: "❌ Не удалось найти оппонента. Удалено из очереди.",
    back: "🔙 Назад",
    copy: "📋 Копировать",
    share: "📤 Поделиться",
  },
};

// --- HELPER FUNCTIONS ---
// Function to get localized text with optional parameters
function getText(lang: Lang | null, key: string, params: Record<string, any> = {}): string {
  const base = texts[lang || "en"][key] || texts["en"][key];
  return Object.entries(params).reduce((txt, [k, v]) => txt.replace(`{${k}}`, v), base);
}

// Function to send a text message to a chat
async function sendText(chatId: number, text: string) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// Function to send a message with inline keyboard and return message ID
async function sendTextWithKeyboard(chatId: number, text: string, reply_markup: any, parse_mode?: string): Promise<number> {
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup, parse_mode }),
  });
  const data = await res.json();
  return data.result.message_id;
}

// Function to edit a message's text and keyboard
async function editText(chatId: number, msgId: number, text: string, reply_markup?: any, parse_mode?: string) {
  await fetch(`${API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: msgId, text, reply_markup, parse_mode }),
  });
}

// Function to answer a callback query
async function answerCallback(id: string, text?: string) {
  await fetch(`${API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id, text }),
  });
}

// Function to retrieve user profile from KV
async function getUserProfile(id: number): Promise<UserProfile> {
  const res = await kv.get<UserProfile>(["users", id]);
  return res.value || {
    id,
    username: undefined,
    firstName: "",
    language: null,
    registrationDate: undefined,
    xog: 0,
    inAppStars: 0,
    withdrawalStars: 0,
    referrals: 0,
    earnedFromReferrals: 0,
    trophies: 0,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    lastDailyBonus: 0,
    lastActive: Date.now(),
    hasPlayedTrophy: false,
  };
}

// Function to save user profile to KV
async function saveUserProfile(profile: UserProfile) {
  await kv.set(["users", profile.id], profile);
}

// Function to get user state from KV
async function getState(userId: number): Promise<string | null> {
  const res = await kv.get<string>(["states", userId]);
  return res.value;
}

// Function to set or delete user state in KV
async function setState(userId: number, state: string | null) {
  if (state === null) {
    await kv.delete(["states", userId]);
  } else {
    await kv.set(["states", userId], state);
  }
}

// Function to show the profile with main menu buttons
async function showProfileMenu(chatId: number, msgId: number | null, profile: UserProfile, isAdmin: boolean) {
  const lang = profile.language || "en";
  const date = new Date(profile.registrationDate!);
  const regDate = date.toLocaleDateString('en-GB', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) + ' in ' + date.toLocaleTimeString('en-GB', { timeZone: 'UTC' });
  const params = {
    regDate,
    id: profile.id,
    xog: profile.xog,
    inAppStars: profile.inAppStars,
    withdrawalStars: profile.withdrawalStars,
    referrals: profile.referrals,
    earned: profile.earnedFromReferrals,
    trophies: profile.trophies,
    matches: profile.matchesPlayed,
    wins: profile.wins,
    losses: profile.losses,
  };
  const text = getText(lang, "profileText", params);
  const kb = [
    [{ text: getText(lang, "play"), callback_data: "play" }],
    [
      { text: getText(lang, "referrals"), callback_data: "referrals" },
      { text: getText(lang, "leaderboard"), callback_data: "leaderboard" },
    ],
    [
      { text: getText(lang, "withdraw"), callback_data: "withdraw" },
      { text: getText(lang, "topUp"), callback_data: "topUp" },
    ],
    [{ text: getText(lang, "exchange"), callback_data: "exchange" }],
    [{ text: getText(lang, "dailyBonus"), callback_data: "daily" }],
  ];
  if (isAdmin) {
    kb.push([{ text: getText(lang, "adminPanel"), callback_data: "admin" }]);
  }
  if (msgId) {
    await editText(chatId, msgId, text, { inline_keyboard: kb }, 'HTML');
  } else {
    await sendTextWithKeyboard(chatId, text, { inline_keyboard: kb }, 'HTML');
  }
}

// Function to show play menu
async function showPlayMenu(chatId: number, msgId: number, lang: Lang) {
  const text = getText(lang, "playText");
  const kb = [
    [{ text: getText(lang, "playTrophy"), callback_data: "play_trophy" }],
    [{ text: getText(lang, "playStar"), callback_data: "play_star" }],
    [{ text: getText(lang, "back"), callback_data: "back_main" }],
  ];
  await editText(chatId, msgId, text, { inline_keyboard: kb });
}

// Function to show referral menu
async function showReferralMenu(chatId: number, msgId: number, lang: Lang, userId: number) {
  const refLink = `https://t.me/${BOT_USERNAME}?start=${userId}`;
  const text = getText(lang, "referralsText", { refLink });
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Join via my referral!")}`;
  const kb = [
    [
      { text: getText(lang, "copy"), callback_data: "copy_ref" },
      { text: getText(lang, "share"), url: shareUrl },
    ],
    [{ text: getText(lang, "back"), callback_data: "back_main" }],
  ];
  await editText(chatId, msgId, text, { inline_keyboard: kb });
}

// Function to show leaderboard menu
async function showLeaderMenu(chatId: number, msgId: number, lang: Lang) {
  const text = getText(lang, "leaderboardText");
  const kb = [
    [
      { text: getText(lang, "leaderboardTrophies"), callback_data: "leader_trophy" },
      { text: getText(lang, "leaderboardStars"), callback_data: "leader_stars" },
    ],
    [{ text: getText(lang, "back"), callback_data: "back_main" }],
  ];
  await editText(chatId, msgId, text, { inline_keyboard: kb });
}

// Function to show trophy leaderboard
async function showLeaderTrophy(chatId: number, msgId: number, lang: Lang) {
  const users: UserProfile[] = [];
  for await (const entry of kv.list({ prefix: ["users"] })) {
    users.push(entry.value as UserProfile);
  }
  users.sort((a, b) => b.trophies - a.trophies);
  let text = getText(lang, "leaderboardTrophiesText");
  for (let i = 0; i < Math.min(10, users.length); i++) {
    const u = users[i];
    text += `${i + 1}. @${u.username || u.firstName} - ${u.trophies}\n`;
  }
  const kb = [[{ text: getText(lang, "back"), callback_data: "back_leader" }]];
  await editText(chatId, msgId, text, { inline_keyboard: kb });
}

// Function to show stars leaderboard (withdrawal stars)
async function showLeaderStars(chatId: number, msgId: number, lang: Lang) {
  const users: UserProfile[] = [];
  for await (const entry of kv.list({ prefix: ["users"] })) {
    users.push(entry.value as UserProfile);
  }
  users.sort((a, b) => b.withdrawalStars - a.withdrawalStars);
  let text = getText(lang, "leaderboardStarsText");
  for (let i = 0; i < Math.min(10, users.length); i++) {
    const u = users[i];
    text += `${i + 1}. @${u.username || u.firstName} - ${u.withdrawalStars}\n`;
  }
  const kb = [[{ text: getText(lang, "back"), callback_data: "back_leader" }]];
  await editText(chatId, msgId, text, { inline_keyboard: kb });
}

// --- COMMAND HANDLERS ---
// Handler for /start command: initializes user and prompts for language if needed
async function handleStart(msg: any) {
  const user = msg.from;
  const chatId = msg.chat.id;
  let profile = await getUserProfile(user.id);
  profile.username = user.username;
  profile.firstName = user.first_name || "";
  profile.lastActive = Date.now();
  if (!profile.registrationDate) {
    profile.registrationDate = Date.now();
  }
  // Handle referral
  const text = msg.text || "";
  if (text.startsWith("/start ") && text.split(" ").length > 1) {
    const refId = parseInt(text.split(" ")[1]);
    if (!isNaN(refId) && refId !== user.id && !profile.referredBy) {
      profile.referredBy = refId;
      const referrer = await getUserProfile(refId);
      if (referrer) {
        referrer.referrals += 1;
        await saveUserProfile(referrer);
      }
    }
  }
  await saveUserProfile(profile);

  if (profile.language) {
    await showProfileMenu(chatId, null, profile, profile.username === ADMIN_USERNAME);
    return;
  }

  const kb = {
    inline_keyboard: [
      [{ text: getText("en", "english"), callback_data: "lang:en" }],
      [{ text: getText("ru", "russian"), callback_data: "lang:ru" }],
    ],
  };
  await sendTextWithKeyboard(chatId, getText("en", "chooseLang"), kb);
}

// --- GAME LOGIC ---
// Function to check if user is in an active match
async function isInActiveMatch(userId: number): Promise<boolean> {
  const res = await kv.get(["active_matches", userId]);
  return !!res.value;
}

// Function to get matchmaking queue for a type
async function getQueue(type: "trophy" | "star"): Promise<QueueEntry[]> {
  const res = await kv.get<QueueEntry[]>(["queues", type]);
  return res.value || [];
}

// Function to save matchmaking queue
async function saveQueue(type: "trophy" | "star", queue: QueueEntry[]) {
  await kv.set(["queues", type], queue);
}

// Handler to join matchmaking queue
async function handleJoinQueue(userId: number, lang: Lang, type: "trophy" | "star", cbId: string) {
  if (await isInActiveMatch(userId)) {
    await answerCallback(cbId, getText(lang, "alreadyInMatch"));
    return;
  }

  // Clean current queue
  let queue = await getQueue(type);
  const now = Date.now();
  const removed: number[] = [];
  queue = queue.filter((e) => {
    if (now - e.joinTime >= 60000) {
      removed.push(e.userId);
      return false;
    }
    return true;
  });
  await saveQueue(type, queue);
  for (const rid of removed) {
    const rprof = await getUserProfile(rid);
    await sendText(rid, getText(rprof.language || "en", "cantFindOpponent"));
  }

  // Clean other queue
  const otherType = type === "trophy" ? "star" : "trophy";
  let otherQueue = await getQueue(otherType);
  const oremoved: number[] = [];
  otherQueue = otherQueue.filter((e) => {
    if (now - e.joinTime >= 60000) {
      oremoved.push(e.userId);
      return false;
    }
    return true;
  });
  await saveQueue(otherType, otherQueue);
  for (const rid of oremoved) {
    const rprof = await getUserProfile(rid);
    await sendText(rid, getText(rprof.language || "en", "cantFindOpponent"));
  }

  if (otherQueue.some((e) => e.userId === userId) || queue.some((e) => e.userId === userId)) {
    await answerCallback(cbId, getText(lang, "alreadyInQueue"));
    return;
  }

  if (type === "star") {
    const profile = await getUserProfile(userId);
    if (profile.inAppStars < 1) {
      await answerCallback(cbId, getText(lang, "insufficientStars"));
      return;
    }
  }

  queue.push({ userId, joinTime: now });
  await saveQueue(type, queue);

  if (queue.length >= 2) {
    queue.sort((a, b) => a.joinTime - b.joinTime);
    const p1 = queue.shift()!.userId;
    const p2 = queue.shift()!.userId;
    await saveQueue(type, queue);
    if (p1 !== p2) {
      await startMatch(p1, p2, type);
    }
  }
  await answerCallback(cbId, "Joined queue");
}

// Function to start a new match between two players
async function startMatch(p1: number, p2: number, type: "trophy" | "star") {
  const matchId = crypto.randomUUID();
  const now = Date.now();
  const match: Match = {
    id: matchId,
    p1,
    p2,
    type,
    board: Array(9).fill(""),
    turn: p1,
    p1Mark: "X",
    p2Mark: "O",
    rounds: 1,
    wins: { [p1]: 0, [p2]: 0 },
    msgIds: {},
    active: true,
    lastMoveTime: now,
  };
  await kv.set(["matches", matchId], match);
  await kv.set(["active_matches", p1], matchId);
  await kv.set(["active_matches", p2], matchId);

  const p1Profile = await getUserProfile(p1);
  const p2Profile = await getUserProfile(p2);

  if (type === "star") {
    p1Profile.inAppStars -= 1;
    p2Profile.inAppStars -= 1;
    await saveUserProfile(p1Profile);
    await saveUserProfile(p2Profile);
  }

  await sendText(p1, getText(p1Profile.language || "en", "matchStarted", { username: p2Profile.username }));
  await sendText(p2, getText(p2Profile.language || "en", "matchStarted", { username: p1Profile.username }));

  const boardMsgP1 = await sendTextWithKeyboard(p1, await getBoardText(p1, match), getBoardKeyboard(match));
  const boardMsgP2 = await sendTextWithKeyboard(p2, await getBoardText(p2, match), getBoardKeyboard(match));
  match.msgIds[p1] = boardMsgP1;
  match.msgIds[p2] = boardMsgP2;
  await kv.set(["matches", matchId], match);
}

// Function to get board text for a player
async function getBoardText(userId: number, match: Match): Promise<string> {
  const profile = await getUserProfile(userId);
  const lang = profile.language || "en";
  const round = `🔢 **Round ${match.rounds}**\n`;
  const mark = userId === match.p1 ? "X" : "O";
  const turn = match.turn === userId ? getText(lang, "yourTurn") : getText(lang, "opponentTurn");
  return round + `🔸 **Your mark: ${mark}**\n${turn}`;
}

// Function to generate inline keyboard for the board
function getBoardKeyboard(match: Match): any {
  const kb = [];
  for (let row = 0; row < 3; row++) {
    const r = [];
    for (let col = 0; col < 3; col++) {
      const i = row * 3 + col;
      const txt = match.board[i] || " ";
      const data = `move:${match.id}:${row}:${col}`;
      r.push({ text: txt, callback_data: data });
    }
    kb.push(r);
  }
  return { inline_keyboard: kb };
}

// Handler for player moves in the game
async function handleMove(cb: any, match: Match) {
  const userId = cb.from.id;
  const [_, __, rowStr, colStr] = cb.data.split(":");
  const row = parseInt(rowStr);
  const col = parseInt(colStr);
  const index = row * 3 + col;
  const now = Date.now();

  if (!match.active) {
    await answerCallback(cb.id, "Match ended");
    return;
  }
  if (userId !== match.turn) {
    await answerCallback(cb.id, "Not your turn");
    return;
  }
  if (now - match.lastMoveTime > 60000) { // 1 minute timeout
    const opponent = userId === match.p1 ? match.p2 : match.p1;
    await answerCallback(cb.id, "Timeout! You forfeited the match.");
    await endMatch(match, opponent); // Pass winner
    return;
  }
  if (match.board[index] !== "") {
    await answerCallback(cb.id, "Cell taken");
    return;
  }

  match.board[index] = userId === match.p1 ? "X" : "O";
  const opponent = userId === match.p1 ? match.p2 : match.p1;
  match.turn = opponent;
  match.lastMoveTime = now;

  const winnerMark = checkWin(match.board);
  const tie = !winnerMark && match.board.every((c) => c !== "");

  let statusKey = "";
  if (winnerMark) {
    const winnerId = winnerMark === "X" ? match.p1 : match.p2;
    match.wins[winnerId]++;
    statusKey = userId === winnerId ? "youWinRound" : "opponentWinRound";
  } else if (tie) {
    statusKey = "tieRound";
  }

  await kv.set(["matches", match.id], match);

  // Update boards for both players
  await editText(match.p1, match.msgIds[match.p1], await getBoardText(match.p1, match) + (statusKey ? `\n${getText((await getUserProfile(match.p1)).language || "en", statusKey)}` : ""), getBoardKeyboard(match));
  await editText(match.p2, match.msgIds[match.p2], await getBoardText(match.p2, match) + (statusKey ? `\n${getText((await getUserProfile(match.p2)).language || "en", statusKey)}` : ""), getBoardKeyboard(match));

  if (winnerMark || tie) {
    if (match.wins[match.p1] >= 2 || match.wins[match.p2] >= 2 || match.rounds === 3) {
      await endMatch(match);
    } else {
      match.rounds++;
      match.board = Array(9).fill("");
      match.turn = match.rounds % 2 === 1 ? match.p1 : match.p2; // Alternate starter
      match.lastMoveTime = now;
      await kv.set(["matches", match.id], match);
      await editText(match.p1, match.msgIds[match.p1], await getBoardText(match.p1, match), getBoardKeyboard(match));
      await editText(match.p2, match.msgIds[match.p2], await getBoardText(match.p2, match), getBoardKeyboard(match));
    }
  }
}

// Function to check for a win on the board
function checkWin(board: string[]): string | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const line of lines) {
    if (board[line[0]] && board[line[0]] === board[line[1]] && board[line[0]] === board[line[2]]) {
      return board[line[0]];
    }
  }
  return null;
}

// Function to end a match and update profiles/stats
async function endMatch(match: Match, forfeitWinner?: number) {
  match.active = false;
  await kv.set(["matches", match.id], match);
  await kv.delete(["active_matches", match.p1]);
  await kv.delete(["active_matches", match.p2]);

  const p1Profile = await getUserProfile(match.p1);
  const p2Profile = await getUserProfile(match.p2);
  p1Profile.matchesPlayed++;
  p2Profile.matchesPlayed++;

  let winnerId: number | null = forfeitWinner || null;
  let statusKeyP1 = "tieMatch";
  let statusKeyP2 = "tieMatch";
  if (!forfeitWinner) {
    const p1Wins = match.wins[match.p1];
    const p2Wins = match.wins[match.p2];
    if (p1Wins > p2Wins) {
      winnerId = match.p1;
      statusKeyP1 = "youWinMatch";
      statusKeyP2 = "youLoseMatch";
      p1Profile.wins++;
      p2Profile.losses++;
    } else if (p2Wins > p1Wins) {
      winnerId = match.p2;
      statusKeyP1 = "youLoseMatch";
      statusKeyP2 = "youWinMatch";
      p2Profile.wins++;
      p1Profile.losses++;
    }
  } else {
    const winnerProfile = forfeitWinner === match.p1 ? p1Profile : p2Profile;
    const loserProfile = forfeitWinner === match.p1 ? p2Profile : p1Profile;
    winnerProfile.wins++;
    loserProfile.losses++;
    statusKeyP1 = forfeitWinner === match.p1 ? "youWinMatch" : "youLoseMatch";
    statusKeyP2 = forfeitWinner === match.p2 ? "youWinMatch" : "youLoseMatch";
  }

  if (winnerId) {
    const winnerProfile = winnerId === match.p1 ? p1Profile : p2Profile;
    const loserProfile = winnerId === match.p1 ? p2Profile : p1Profile;
    if (match.type === "trophy") {
      winnerProfile.trophies += 1;
      loserProfile.trophies -= 1;
      if (loserProfile.trophies < 0) loserProfile.trophies = 0;
    } else {
      winnerProfile.withdrawalStars += 1.5;
      let statsRes = await kv.get<Stats>(["stats"]);
      let stats = statsRes.value || { totalMatches: 0, totalStarsDistributed: 0, totalStarsPurchased: 0 };
      stats.totalStarsDistributed += 0.5;
      await kv.set(["stats"], stats);
    }
  }

  // Handle referral earnings for trophy matches
  if (match.type === "trophy") {
    if (!p1Profile.hasPlayedTrophy) {
      p1Profile.hasPlayedTrophy = true;
      if (p1Profile.referredBy) {
        const referrer = await getUserProfile(p1Profile.referredBy);
        referrer.earnedFromReferrals += 10;
        referrer.xog += 10;
        await saveUserProfile(referrer);
      }
    }
    if (!p2Profile.hasPlayedTrophy) {
      p2Profile.hasPlayedTrophy = true;
      if (p2Profile.referredBy) {
        const referrer = await getUserProfile(p2Profile.referredBy);
        referrer.earnedFromReferrals += 10;
        referrer.xog += 10;
        await saveUserProfile(referrer);
      }
    }
  }

  // Update total matches
  let statsRes = await kv.get<Stats>(["stats"]);
  let stats = statsRes.value || { totalMatches: 0, totalStarsDistributed: 0, totalStarsPurchased: 0 };
  stats.totalMatches += 1;
  await kv.set(["stats"], stats);

  await saveUserProfile(p1Profile);
  await saveUserProfile(p2Profile);

  await sendText(match.p1, getText(p1Profile.language || "en", statusKeyP1));
  await sendText(match.p2, getText(p2Profile.language || "en", statusKeyP2));
}

// --- TOP-UP LOGIC ---
// Function to create Telegram Stars invoice
async function createInvoice(chatId: number, userId: number, amount: number) {
  const payload = JSON.stringify({ userId, amount, id: crypto.randomUUID() });
  await fetch(`${API}/sendInvoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      title: "Star Top-Up",
      description: `Top up ${amount} stars`,
      payload,
      currency: "XTR",
      prices: [{ label: "Stars", amount: amount }],
    }),
  });
}

// --- DAILY BONUS ---
// Handler for daily bonus claim
async function handleDaily(userId: number, lang: Lang, cbId: string) {
  const profile = await getUserProfile(userId);
  const now = Date.now();
  if (now - profile.lastDailyBonus < 24 * 3600 * 1000) {
    await answerCallback(cbId, getText(lang, "dailyNotReady"));
    return;
  }
  profile.lastDailyBonus = now;
  const amount = Math.floor(Math.random() * 4) + 2;
  profile.xog += amount;
  await saveUserProfile(profile);
  await answerCallback(cbId, getText(lang, "dailyClaimedXOG", { amount }));
}

// --- WITHDRAWAL LOGIC ---
// Handler for star withdrawal
async function handleWithdraw(userId: number, lang: Lang, cbId: string) {
  const profile = await getUserProfile(userId);
  if (profile.withdrawalStars < 50) {
    await answerCallback(cbId, getText(lang, "withdrawalMin"));
    return;
  }
  const existing = await kv.get<Withdrawal>(["withdrawals", userId]);
  if (existing.value && !existing.value.completed) {
    await answerCallback(cbId, getText(lang, "withdrawalPending"));
    return;
  }
  await sendText(userId, getText(lang, "enterWithdrawAmount", { stars: profile.withdrawalStars }));
  await setState(userId, "withdraw_amount");
  await answerCallback(cbId);
}

// --- ADMIN LOGIC ---
// Function to find user by ID or username
async function findUser(query: string): Promise<UserProfile | null> {
  if (!isNaN(parseInt(query))) {
    return await getUserProfile(parseInt(query));
  }
  for await (const entry of kv.list({ prefix: ["users"] })) {
    const profile = entry.value as UserProfile;
    if (profile.username === query) return profile;
  }
  return null;
}

// Function to send admin menu
async function sendAdminMenu(chatId: number, lang: Lang) {
  const kb = [
    [{ text: getText(lang, "adminViewPlayers"), callback_data: "admin_view" }],
    [{ text: getText(lang, "adminModifyBalances"), callback_data: "admin_modify" }],
    [{ text: getText(lang, "adminStats"), callback_data: "admin_stats" }],
    [{ text: getText(lang, "adminWithdrawals"), callback_data: "admin_pending" }],
    [{ text: getText(lang, "adminPayments"), callback_data: "admin_payments" }],
  ];
  await sendTextWithKeyboard(chatId, getText(lang, "adminMenu"), { inline_keyboard: kb });
}

// Handler for admin stats
async function handleAdminStats(chatId: number, lang: Lang) {
  let totalUsers = 0;
  let activeUsers = 0;
  const now = Date.now();
  for await (const entry of kv.list({ prefix: ["users"] })) {
    totalUsers++;
    if ((entry.value as UserProfile).lastActive > now - 24 * 3600 * 1000) activeUsers++;
  }
  const statsRes = await kv.get<Stats>(["stats"]);
  const stats = statsRes.value || { totalMatches: 0, totalStarsDistributed: 0, totalStarsPurchased: 0 };
  const text = getText(lang, "statsText", {
    users: totalUsers,
    active: activeUsers,
    matches: stats.totalMatches,
    stars: stats.totalStarsDistributed,
    purchased: stats.totalStarsPurchased,
  });
  await sendText(chatId, text);
}

// Handler for admin pending withdrawals
async function handleAdminPending(chatId: number, lang: Lang) {
  let hasPending = false;
  for await (const entry of kv.list({ prefix: ["withdrawals"] })) {
    const w = entry.value as Withdrawal;
    if (!w.completed) {
      hasPending = true;
      const profile = await getUserProfile(w.userId);
      const text = getText(lang, "withdrawalRequest", { username: profile.username, amount: w.amount });
      const kb = {
        inline_keyboard: [[{ text: getText(lang, "completeWithdraw"), callback_data: `complete_withdraw:${w.userId}` }]],
      };
      await sendTextWithKeyboard(chatId, text, kb);
    }
  }
  if (!hasPending) {
    await sendText(chatId, "No pending withdrawals.");
  }
}

// Handler for admin payment history
async function handleAdminPayments(chatId: number, lang: Lang) {
  const payments: Payment[] = [];
  for await (const entry of kv.list({ prefix: ["payments"] })) {
    payments.push(entry.value as Payment);
  }
  payments.sort((a, b) => b.timestamp - a.timestamp);
  let text = "📜 Recent Payments:\n";
  for (let i = 0; i < Math.min(10, payments.length); i++) {
    const p = payments[i];
    const profile = await getUserProfile(p.userId);
    text += `@${profile.username || profile.firstName} purchased ${p.amount} stars on ${new Date(p.timestamp).toLocaleString()}\n`;
  }
  if (payments.length === 0) text = "No payments yet.";
  await sendText(chatId, text);
}

// Function to complete a withdrawal
async function completeWithdrawal(userId: number, cbId: string) {
  const withdrawalRes = await kv.get<Withdrawal>(["withdrawals", userId]);
  if (!withdrawalRes.value || withdrawalRes.value.completed) return;
  const profile = await getUserProfile(userId);
  if (profile.withdrawalStars < withdrawalRes.value.amount) {
    await answerCallback(cbId, getText("en", "withdrawalInsufficient"));
    return;
  }
  profile.withdrawalStars -= withdrawalRes.value.amount;
  await saveUserProfile(profile);
  const withdrawal = withdrawalRes.value;
  withdrawal.completed = true;
  await kv.set(["withdrawals", userId], withdrawal);
  await sendText(userId, getText(profile.language || "en", "withdrawalCompleted", { amount: withdrawal.amount }));
  await answerCallback(cbId, "Completed");
}

// --- MAIN UPDATE HANDLER ---
// Main function to handle incoming updates from Telegram
async function handleUpdate(update: any) {
  if (update.message) {
    const msg = update.message;
    const user = msg.from;
    const text = msg.text;
    const chatId = msg.chat.id;

    let profile = await getUserProfile(user.id);
    profile.username = user.username || profile.username;
    profile.firstName = user.first_name || profile.firstName;
    profile.lastActive = Date.now();
    await saveUserProfile(profile);

    const state = await getState(user.id);
    const lang = profile.language || "en";

    if (state === "topup_amount") {
      const amount = parseInt(text);
      if (Number.isInteger(amount) && amount >= 1) {
        await createInvoice(chatId, user.id, amount);
        await setState(user.id, null);
      } else {
        await sendText(chatId, getText(lang, "invalidAmount"));
        await setState(user.id, null);
      }
      return;
    }

    if (state === "withdraw_amount") {
      const amount = Number(text);
      if (!isNaN(amount) && amount >= 50 && amount <= profile.withdrawalStars) {
        const withdrawal: Withdrawal = {
          userId: user.id,
          amount,
          timestamp: Date.now(),
          completed: false,
        };
        await kv.set(["withdrawals", user.id], withdrawal);
        const adminIdRes = await kv.get<number>(["admin_id"]);
        if (adminIdRes.value) {
          const kb = {
            inline_keyboard: [[{ text: getText("en", "completeWithdraw"), callback_data: `complete_withdraw:${user.id}` }]],
          };
          await sendTextWithKeyboard(adminIdRes.value, getText("en", "withdrawalRequest", { username: profile.username, amount }), kb);
        }
        await sendText(chatId, getText(lang, "withdrawalSuccess"));
        await setState(user.id, null);
      } else {
        await sendText(chatId, getText(lang, "invalidWithdrawAmount"));
        await setState(user.id, null);
      }
      return;
    }

    if (state === "exchange_amount") {
      const amount = Number(text);
      if (!isNaN(amount) && amount >= 1 && amount <= profile.withdrawalStars) {
        profile.withdrawalStars -= amount;
        profile.inAppStars += amount;
        await saveUserProfile(profile);
        await sendText(chatId, getText(lang, "exchangeSuccess", { amount }));
        await setState(user.id, null);
      } else {
        await sendText(chatId, getText(lang, "invalidExchange"));
        await setState(user.id, null);
      }
      return;
    }

    if (state === "admin_view_user") {
      const target = await findUser(text);
      if (!target) {
        await sendText(chatId, getText(lang, "userNotFound"));
      } else {
        const tdate = new Date(target.registrationDate!);
        const tregDate = tdate.toLocaleDateString('en-GB', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) + ' in ' + tdate.toLocaleTimeString('en-GB', { timeZone: 'UTC' });
        const tparams = {
          regDate: tregDate,
          id: target.id,
          xog: target.xog,
          inAppStars: target.inAppStars,
          withdrawalStars: target.withdrawalStars,
          referrals: target.referrals,
          earned: target.earnedFromReferrals,
          trophies: target.trophies,
          matches: target.matchesPlayed,
          wins: target.wins,
          losses: target.losses,
        };
        await sendText(chatId, getText(lang, "profileText", tparams));
      }
      await setState(user.id, null);
      return;
    }

    if (state?.startsWith("admin_modify_amount:")) {
      const [, action, targetIdStr] = state.split(":");
      const targetId = parseInt(targetIdStr);
      const amount = parseInt(text);
      if (!Number.isInteger(amount) || amount < 0) {
        await sendText(chatId, getText(lang, "invalidAmount"));
        await setState(user.id, null);
        return;
      }
      const targetProfile = await getUserProfile(targetId);
      if (action === "add_trophy") targetProfile.trophies += amount;
      else if (action === "remove_trophy") {
        targetProfile.trophies -= amount;
        if (targetProfile.trophies < 0) targetProfile.trophies = 0;
      } else if (action === "add_inapp") targetProfile.inAppStars += amount;
      else if (action === "remove_inapp") {
        targetProfile.inAppStars -= amount;
        if (targetProfile.inAppStars < 0) targetProfile.inAppStars = 0;
      } else if (action === "add_withdrawal") targetProfile.withdrawalStars += amount;
      else if (action === "remove_withdrawal") {
        targetProfile.withdrawalStars -= amount;
        if (targetProfile.withdrawalStars < 0) targetProfile.withdrawalStars = 0;
      } else if (action === "add_xog") targetProfile.xog += amount;
      else if (action === "remove_xog") {
        targetProfile.xog -= amount;
        if (targetProfile.xog < 0) targetProfile.xog = 0;
      }
      await saveUserProfile(targetProfile);
      await sendText(chatId, getText(lang, "balanceModified"));
      await setState(user.id, null);
      return;
    }

    if (state === "admin_modify_user") {
      const target = await findUser(text);
      if (!target) {
        await sendText(chatId, getText(lang, "userNotFound"));
      } else {
        const kb = {
          inline_keyboard: [
            [{ text: getText(lang, "addTrophy"), callback_data: `admin_add_trophy:${target.id}` }],
            [{ text: getText(lang, "removeTrophy"), callback_data: `admin_remove_trophy:${target.id}` }],
            [{ text: getText(lang, "addInAppStar"), callback_data: `admin_add_inapp:${target.id}` }],
            [{ text: getText(lang, "removeInAppStar"), callback_data: `admin_remove_inapp:${target.id}` }],
            [{ text: getText(lang, "addWithdrawalStar"), callback_data: `admin_add_withdrawal:${target.id}` }],
            [{ text: getText(lang, "removeWithdrawalStar"), callback_data: `admin_remove_withdrawal:${target.id}` }],
            [{ text: getText(lang, "addXog"), callback_data: `admin_add_xog:${target.id}` }],
            [{ text: getText(lang, "removeXog"), callback_data: `admin_remove_xog:${target.id}` }],
          ],
        };
        await sendTextWithKeyboard(chatId, getText(lang, "adminModifyActions", { username: target.username }), kb);
      }
      await setState(user.id, null);
      return;
    }

    if (text === "/start") {
      await handleStart(msg);
    } else if (text === "/admin" && profile.username === ADMIN_USERNAME) {
      await kv.set(["admin_id"], user.id);
      await sendAdminMenu(chatId, lang);
    }
  } else if (update.callback_query) {
    const cb = update.callback_query;
    const user = cb.from;
    const data = cb.data;
    const msgId = cb.message.message_id;
    const chatId = cb.message.chat.id;

    let profile = await getUserProfile(user.id);
    profile.lastActive = Date.now();
    await saveUserProfile(profile);
    const lang = profile.language || "en";
    const isAdmin = profile.username === ADMIN_USERNAME;

    if (isAdmin) {
      await kv.set(["admin_id"], user.id);
    }

    if (data.startsWith("lang:")) {
      const selectedLang = data.slice(5) as Lang;
      profile.language = selectedLang;
      await saveUserProfile(profile);
      await answerCallback(cb.id, "Language set");
      await editText(chatId, msgId, getText(selectedLang, "welcome"));
      await showProfileMenu(chatId, null, profile, isAdmin);
      return;
    }

    if (!profile.language) return;

    if (data === "play") {
      await showPlayMenu(chatId, msgId, lang);
      await answerCallback(cb.id);
    } else if (data === "play_trophy") {
      await handleJoinQueue(user.id, lang, "trophy", cb.id);
    } else if (data === "play_star") {
      await handleJoinQueue(user.id, lang, "star", cb.id);
    } else if (data === "referrals") {
      await showReferralMenu(chatId, msgId, lang, user.id);
      await answerCallback(cb.id);
    } else if (data === "copy_ref") {
      await answerCallback(cb.id, "Please copy the link from the message text.");
    } else if (data === "leaderboard") {
      await showLeaderMenu(chatId, msgId, lang);
      await answerCallback(cb.id);
    } else if (data === "leader_trophy") {
      await showLeaderTrophy(chatId, msgId, lang);
      await answerCallback(cb.id);
    } else if (data === "leader_stars") {
      await showLeaderStars(chatId, msgId, lang);
      await answerCallback(cb.id);
    } else if (data === "back_leader") {
      await showLeaderMenu(chatId, msgId, lang);
      await answerCallback(cb.id);
    } else if (data === "withdraw") {
      await handleWithdraw(user.id, lang, cb.id);
    } else if (data === "topUp") {
      await sendText(chatId, getText(lang, "enterAmount"));
      await setState(user.id, "topup_amount");
      await answerCallback(cb.id);
    } else if (data === "exchange") {
      await sendText(chatId, getText(lang, "exchangeAmount", { withdrawal: profile.withdrawalStars }));
      await setState(user.id, "exchange_amount");
      await answerCallback(cb.id);
    } else if (data === "daily") {
      await handleDaily(user.id, lang, cb.id);
    } else if (data === "back_main") {
      await showProfileMenu(chatId, msgId, profile, isAdmin);
      await answerCallback(cb.id);
    } else if (data === "admin") {
      if (!isAdmin) {
        await sendText(chatId, getText(lang, "accessDenied"));
        return;
      }
      await sendAdminMenu(chatId, lang);
      await answerCallback(cb.id);
    } else if (data === "admin_view") {
      await sendText(chatId, getText(lang, "enterUser"));
      await setState(user.id, "admin_view_user");
      await answerCallback(cb.id);
    } else if (data === "admin_modify") {
      await sendText(chatId, getText(lang, "enterUser"));
      await setState(user.id, "admin_modify_user");
      await answerCallback(cb.id);
    } else if (data.startsWith("admin_add_trophy:")) {
      const targetId = parseInt(data.split(":")[1]);
      await sendText(chatId, getText(lang, "enterModifyAmount", { action: "add trophies" }));
      await setState(user.id, `admin_modify_amount:add_trophy:${targetId}`);
      await answerCallback(cb.id);
    } else if (data.startsWith("admin_remove_trophy:")) {
      const targetId = parseInt(data.split(":")[1]);
      await sendText(chatId, getText(lang, "enterModifyAmount", { action: "remove trophies" }));
      await setState(user.id, `admin_modify_amount:remove_trophy:${targetId}`);
      await answerCallback(cb.id);
    } else if (data.startsWith("admin_add_inapp:")) {
      const targetId = parseInt(data.split(":")[1]);
      await sendText(chatId, getText(lang, "enterModifyAmount", { action: "add in-app stars" }));
      await setState(user.id, `admin_modify_amount:add_inapp:${targetId}`);
      await answerCallback(cb.id);
    } else if (data.startsWith("admin_remove_inapp:")) {
      const targetId = parseInt(data.split(":")[1]);
      await sendText(chatId, getText(lang, "enterModifyAmount", { action: "remove in-app stars" }));
      await setState(user.id, `admin_modify_amount:remove_inapp:${targetId}`);
      await answerCallback(cb.id);
    } else if (data.startsWith("admin_add_withdrawal:")) {
      const targetId = parseInt(data.split(":")[1]);
      await sendText(chatId, getText(lang, "enterModifyAmount", { action: "add withdrawal stars" }));
      await setState(user.id, `admin_modify_amount:add_withdrawal:${targetId}`);
      await answerCallback(cb.id);
    } else if (data.startsWith("admin_remove_withdrawal:")) {
      const targetId = parseInt(data.split(":")[1]);
      await sendText(chatId, getText(lang, "enterModifyAmount", { action: "remove withdrawal stars" }));
      await setState(user.id, `admin_modify_amount:remove_withdrawal:${targetId}`);
      await answerCallback(cb.id);
    } else if (data.startsWith("admin_add_xog:")) {
      const targetId = parseInt(data.split(":")[1]);
      await sendText(chatId, getText(lang, "enterModifyAmount", { action: "add XOG" }));
      await setState(user.id, `admin_modify_amount:add_xog:${targetId}`);
      await answerCallback(cb.id);
    } else if (data.startsWith("admin_remove_xog:")) {
      const targetId = parseInt(data.split(":")[1]);
      await sendText(chatId, getText(lang, "enterModifyAmount", { action: "remove XOG" }));
      await setState(user.id, `admin_modify_amount:remove_xog:${targetId}`);
      await answerCallback(cb.id);
    } else if (data === "admin_stats") {
      await handleAdminStats(chatId, lang);
      await answerCallback(cb.id);
    } else if (data === "admin_pending") {
      await handleAdminPending(chatId, lang);
      await answerCallback(cb.id);
    } else if (data === "admin_payments") {
      await handleAdminPayments(chatId, lang);
      await answerCallback(cb.id);
    } else if (data.startsWith("complete_withdraw:")) {
      if (!isAdmin) return;
      const targetId = parseInt(data.split(":")[1]);
      await completeWithdrawal(targetId, cb.id);
    } else if (data.startsWith("move:")) {
      const matchRes = await kv.get<Match>(["matches", data.split(":")[1]]);
      if (matchRes.value) {
        await handleMove(cb, matchRes.value);
      }
    }
  } else if (update.pre_checkout_query) {
    const query = update.pre_checkout_query;
    await fetch(`${API}/answerPreCheckoutQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pre_checkout_query_id: query.id, ok: true }),
    });
  } else if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
    const chargeId = payment.telegram_payment_charge_id;
    const processed = await kv.get(["processed_payments", chargeId]);
    if (processed.value) return;
    await kv.set(["processed_payments", chargeId], true);

    const payload = JSON.parse(payment.invoice_payload);
    const profile = await getUserProfile(payload.userId);
    profile.inAppStars += payload.amount;
    await saveUserProfile(profile);

    const paymentRecord: Payment = {
      id: crypto.randomUUID(),
      userId: payload.userId,
      amount: payload.amount,
      timestamp: Date.now(),
    };
    await kv.set(["payments", paymentRecord.id], paymentRecord);

    let statsRes = await kv.get<Stats>(["stats"]);
    let stats = statsRes.value || { totalMatches: 0, totalStarsDistributed: 0, totalStarsPurchased: 0 };
    stats.totalStarsPurchased += payload.amount;
    await kv.set(["stats"], stats);

    await sendText(update.message.chat.id, getText(profile.language || "en", "paymentSuccess") + payload.amount + getText(profile.language || "en", "starsAdded"));
  }
}

// --- SERVER ---
// Start the HTTP server to handle webhooks
serve(async (req) => {
  if (req.method === "POST") {
    const update = await req.json();
    await handleUpdate(update);
    return new Response("OK", { status: 200 });
  }
  return new Response("Bot is running");
});