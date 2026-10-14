const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  generateWAMessageFromContent,
  downloadMediaMessage,
  proto,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const PREFIX = '!';
const NUMBER = '249993582995'; // رقمك بالصيغة الدولية
const CHANNEL_URL = ''; // رابط قناتك (اختياري). اتركه فاضي وما رح يظهر زر القناة

// إعدادات بطولة sxo
const MAX_PLAYERS = 16;          // أقصى عدد مشاركين
const REG_TIME = 3 * 60 * 1000;  // مدة التسجيل (3 دقايق)
const MOVE_TIME = 60 * 1000;     // مهلة كل حركة (دقيقة)

// إعدادات مسابقة الايموجي
const BOMB_DUEL_TIME = 2000;         // مواجهة الاثنين الأخيرين: ثانيتين فقط
const EMOJI_WIN = 3;                 // النقاط المطلوبة للفوز
const EMOJI_ROUND_TIME = 30 * 1000;  // مهلة كل جولة
const EMOJI_MAX_ROUNDS = 15;         // أقصى عدد جولات
const EMOJIS = ['😂', '❤️', '🔥', '😍', '🤣', '😎', '🥺', '👍', '🙏', '😭', '🤔', '😅'];

const games = new Map();
const xoGames = new Map();
const sxoGames = new Map();
const emojiGames = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = (jid) => '@' + jid.split('@')[0];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ================= القائمة والأزرار =================
const LINE = '━━━━━━━━━━━━━━━━━━';
const LINE2 = '•────────•✦•────────•';
const BRAND = '> 𝐑𝐎𝐃𝐎 𝐁𝐎𝐓 🌹';

// إطار موحد لكل النصوص
const card = (title, rows = [], note = '', brand = true) =>
  `*${title}*\n${LINE}\n${rows.join('\n')}\n${LINE}` +
  (note ? '\n' + note.split('\n').map((l) => '> ' + l).join('\n') : '') +
  (brand ? `\n\n${BRAND}` : '');

const MENU_BODY =
  '> اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ ﷺ\n\n' +
  `${LINE}\n` +
  '> 𝐑𝐔𝐃𝐎---𝐋𝐈𝐒𝐓\n' +
  ' *إختر قسمآ من القائمة ادناه↓↓* 🌹\n\n' +
  LINE2;

const GAMES_BODY =
  '> اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ ﷺ\n\n' +
  `${LINE}\n` +
  '> 𝐑𝐔𝐃𝐎---𝐆𝐀𝐌𝐄𝐒\n' +
  ' *إختر اللعبة اللي بدك ياها↓↓* 🎮\n\n' +
  LINE2;

// القائمة الرئيسية
const MAIN_ROWS = [
  { title: 'الألعاب🎮', description: 'القنبلة • XO • الايموجي', id: 'sec_games' },
  { title: '🏆 النقاط والترتيب', description: 'ترتيب • نقاطي', id: 'sec_points' },
  { title: '🛠️ أوامر عامة', description: 'ping • say • بحث صورة • فتح', id: 'sec_tools' },
  { title: '🍷 V', description: 'أوامر خاصة بفئة V', id: 'sec_v' },
];

// قائمة الألعاب
const GAME_ROWS = [
  { title: '💣 لعبة القنبلة', description: 'المشرف يبدأها بـ stg', id: 'g_bomb' },
  { title: '❌⭕ لعبة XO', description: 'لاعبين اثنين ضد بعض', id: 'g_xo' },
  { title: '🎯 مسابقة الايموجي', description: 'تفاعل بسرعة (للمشرفين)', id: 'g_emoji' },
];

// صفحات الشرح
const PAGES = {
  g_bomb: card(
    '💣 لعبة القنبلة',
    [
      '🔹 *stg* ← بدء اللعبة (للمشرفين)',
      '🔹 *stop* ← إيقافها',
    ],
    'البوت بيمنشن شخص عشوائي، وعليه يمنشن غيره قبل العد لـ 3 وإلا بينطرد.\nولما يبقى اثنين بس: ثانيتين بدون عد ⚡\nآخر واحد بيضل هو الفائز.\nلازم البوت يكون مشرف.'
  ),
  g_xo: card(
    '❌⭕ لعبة XO',
    [
      '🔹 *xo @منشن* ← تحدي شخص',
      '🔹 *xo* ← بالرد على رسالة الخصم',
      '🔹 *قبول* / *رفض* ← الرد على التحدي',
      '🔹 *xo stop* ← إنهاء اللعبة',
    ],
    'لاعبين اثنين بس، وكل واحد بيكتب رقم من 1 إلى 9 بدوره.\nمهلة كل حركة دقيقة.'
  ),
  g_emoji: card(
    '🎯 مسابقة الايموجي',
    [
      '🔹 *ايموجي* ← بدء المسابقة (للمشرفين)',
      '🔹 *ايموجي stop* ← إيقافها',
      '🔹 *ايموجي فتح* ← فتح الشات يدوياً',
    ],
    'أول واحد يتفاعل بنفس الايموجي بياخد نقطة.\nأول واحد يوصل 3 نقاط يفوز.\nلازم البوت يكون مشرف.'
  ),
  sec_points: card(
    '🏆 النقاط والترتيب',
    [
      '🔹 *ترتيب* ← لوحة أفضل 10 بالقروب',
      '🔹 *نقاطي* ← بطاقتك الشخصية',
      '🔹 *نقاط @منشن* ← بطاقة شخص ثاني',
      '🔹 *تصفير النقاط* ← للمشرفين فقط',
    ],
    `الفوز بالألعاب بيعطيك نقاط:\n💣 قنبلة +${5} • 🎯 ايموجي +${4}\n❌⭕ XO +${3} • 🏅 بطولة +${10}\nوكل ما زادت نقاطك بيرتفع مستواك 🌱 ← 💎`
  ),
  sec_tools: card(
    '🛠️ أوامر عامة',
    [
      '🔹 *!ping* ← اختبار البوت',
      '🔹 *!say نص* ← يكرر كلامك',
      '🔹 *رودو* ← رد البوت',
      '🔹 *بحث صورة اسم* ← صورة شخصية أنمي أو أي موضوع',
      '🔹 *لست❤️‍🩹* ← القائمة',
      '🔹 *فتح* ← بالرد على صورة/فيديو مرة واحدة (لصاحب الرقم)',
    ]
  ),
  sec_v: card(
    '🍷 فئة V',
    [
      '🔹 *سرقة* ← منشن/رد على شخص، يرسل صورة بروفايله',
      '🔹 *بروفايل* ← بالرد على صورة، يحطها صورة القروب',
      '🔹 *نسخ قروب* ← يحفظ اسم ووصف وصورة القروب',
      '🔹 *لصق قروب* ← يطبّقهم بقروب ثاني',
      '🔹 *id* ← منشن/رد على شخص، يرسل آيديه',
      '🔹 *ارفع نخبة* ← منشن/رد (أو بالخاص معه)، لصاحب الرقم فقط',
    ],
    'هذا القسم خاص بفئة V، وما يقدر يستخدمه غيرهم.'
  ),
};

function textMenu() {
  return (
    MENU_BODY +
    '\n\n' +
    [PAGES.g_bomb, PAGES.g_xo, PAGES.g_emoji, PAGES.sec_points, PAGES.sec_tools].join('\n\n')
  );
}

// إرسال قائمة منسدلة (Native Flow)
async function sendList(sock, from, quoted, body, rows, fallbackText) {
  const buttons = [
    {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: '📂 اختر من هنا',
        sections: [{ title: 'القائمة', rows }],
      }),
    },
  ];
  if (CHANNEL_URL) {
    buttons.push({
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '📢 قناة البوت',
        url: CHANNEL_URL,
        merchant_url: CHANNEL_URL,
      }),
    });
  }

  try {
    const msg = generateWAMessageFromContent(
      from,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: proto.Message.InteractiveMessage.create({
              header: { title: '', hasMediaAttachment: false },
              body: { text: body },
              footer: { text: 'Rodo 🌹' },
              nativeFlowMessage: { buttons },
            }),
          },
        },
      },
      { userJid: sock.user.id, quoted }
    );

    await sock.relayMessage(from, msg.message, {
      messageId: msg.key.id,
      additionalNodes: [
        {
          tag: 'biz',
          attrs: {},
          content: [
            {
              tag: 'interactive',
              attrs: { type: 'native_flow', v: '1' },
              content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
            },
          ],
        },
      ],
    });
  } catch (e) {
    console.log('buttons error:', e);
    await sock.sendMessage(from, { text: fallbackText }, { quoted });
  }
}

const sendMenuButtons = (sock, from, quoted) =>
  sendList(sock, from, quoted, MENU_BODY, MAIN_ROWS, textMenu());

const sendGamesMenu = (sock, from, quoted) =>
  sendList(
    sock,
    from,
    quoted,
    GAMES_BODY,
    GAME_ROWS,
    [PAGES.g_bomb, PAGES.g_xo, PAGES.g_emoji].join('\n\n')
  );

// ذاكرة مؤقتة لرسائل "مرة واحدة" (بالذاكرة فقط، آخر 30، وتنمسح بعد 30 دقيقة أو بإعادة التشغيل)
const voCache = new Map();
function cacheViewOnce(m) {
  const mm = m.message;
  if (!mm || m.key.fromMe) return;
  const inner =
    mm.viewOnceMessageV2?.message ||
    mm.viewOnceMessageV2Extension?.message ||
    mm.viewOnceMessage?.message ||
    ((mm.imageMessage?.viewOnce || mm.videoMessage?.viewOnce || mm.audioMessage?.viewOnce) ? mm : null);
  if (!inner) return;
  if (!['imageMessage', 'videoMessage', 'audioMessage'].some((t) => inner[t])) return;
  voCache.set(m.key.id, { key: m.key, message: inner, t: Date.now() });
  for (const [k, v] of voCache) {
    if (Date.now() - v.t > 30 * 60 * 1000 || voCache.size > 30) voCache.delete(k);
  }
}

// فتح صورة/فيديو "مرة واحدة" وإرسالها كرسالة عادية (لصاحب الرقم فقط)
async function handleOpen(sock, m, from, ctx) {
  if (!m.key.fromMe) return; // حماية خصوصية أصحاب الرسائل
  const say = (text) =>
    sock.sendMessage(from, { text }, { quoted: m }).catch(() => {});

  const cached = ctx?.stanzaId ? voCache.get(ctx.stanzaId) : null;
  const q = ctx?.quotedMessage;
  const inner = cached
    ? cached.message
    : q?.viewOnceMessageV2?.message ||
      q?.viewOnceMessageV2Extension?.message ||
      q?.viewOnceMessage?.message ||
      q;
  const type = inner
    ? ['imageMessage', 'videoMessage', 'audioMessage'].find((t) => inner[t])
    : null;

  if (!type) {
    await say(
      card('👁️ فتح', ['رد على صورة أو فيديو (مرة واحدة)', 'واكتب *فتح*'], '', false)
    );
    return;
  }

  try {
    const buffer = await downloadMediaMessage(
      cached
        ? { key: cached.key, message: inner }
        : {
            key: {
              remoteJid: from,
              id: ctx.stanzaId,
              participant: ctx.participant,
              fromMe: false,
            },
            message: inner,
          },
      'buffer',
      {},
      {
        logger: pino({ level: 'silent' }),
        reuploadRequest: sock.updateMediaMessage,
      }
    );
    const media = inner[type];
    const cap = `✅ *تم الفتح*${media.caption ? '\n\n' + media.caption : ''}`;

    if (type === 'imageMessage') {
      await sock.sendMessage(from, { image: buffer, caption: cap, viewOnce: false }, { quoted: m });
    } else if (type === 'videoMessage') {
      await sock.sendMessage(
        from,
        { video: buffer, caption: cap, mimetype: media.mimetype || 'video/mp4', viewOnce: false },
        { quoted: m }
      );
    } else {
      await sock.sendMessage(
        from,
        {
          audio: buffer,
          mimetype: media.mimetype || 'audio/ogg; codecs=opus',
          ptt: !!media.ptt,
          viewOnce: false,
        },
        { quoted: m }
      );
    }
  } catch (e) {
    console.log('open error:', e?.message || e);
    await say(
      card(
        '⚠️ ما قدرت أفتحها',
        [cached ? 'الوسائط انحذفت من سيرفر واتساب.' : 'البوت ما استلم هاي الرسالة بوقتها.'],
        'لازم يكون البوت شغال لما توصل الصورة، وتفتحها بالرد قبل ما تفتحها على جوالك.',
        false
      )
    );
  }
}

// ================= أدوات عامة =================
// توحيد أشكال الأرقام (lid / رقم عادي) لنفس الشخص
function makeNorm(meta) {
  const map = new Map();
  for (const p of meta.participants) {
    for (const x of [p.id, p.lid, p.phoneNumber, p.jid]) {
      if (x) map.set(jidNormalizedUser(x), p.id);
    }
  }
  return (jid) => {
    if (!jid) return '';
    const n = jidNormalizedUser(jid);
    return map.get(n) || n;
  };
}

function selfJid(sock, norm, meta) {
  const ids = new Set(meta.participants.map((p) => p.id));
  const cands = [sock.user?.id, sock.user?.lid].filter(Boolean).map(norm);
  return cands.find((c) => ids.has(c)) || cands[0] || '';
}

async function groupCtx(sock, m, from) {
  const meta = await sock.groupMetadata(from);
  const norm = makeNorm(meta);
  const self = selfJid(sock, norm, meta);
  const sender = m.key.fromMe ? self : norm(m.key.participant);
  const admins = new Set(
    meta.participants.filter((p) => p.admin).map((p) => p.id)
  );
  return {
    meta,
    norm,
    self,
    sender,
    isAdmin: m.key.fromMe || admins.has(sender),
    botAdmin: admins.has(self),
  };
}

// ================= XO (أدوات اللوحة) =================
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const NUMS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const MARK = ['❌', '⭕'];

function renderBoard(b) {
  const cell = (i) => (b[i] === null ? NUMS[i] : MARK[b[i]]);
  return [0, 3, 6]
    .map((r) => `${cell(r)} ${cell(r + 1)} ${cell(r + 2)}`)
    .join('\n');
}

function checkWin(b) {
  for (const [a, c, d] of LINES) {
    if (b[a] !== null && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return null;
}

// ================= مسابقة الايموجي =================
const stripVS = (e) => (e || '').replace(/\uFE0F/g, '');

function emojiScoreboard(g) {
  const rows = [...g.points.entries()].sort((a, b) => b[1] - a[1]);
  return rows.map(([j, p]) => `• ${tag(j)}: ${p}/${EMOJI_WIN}`).join('\n');
}

async function runEmoji(sock, from, g) {
  const say = (text, mentions = []) =>
    sock.sendMessage(from, { text, mentions }).catch(() => {});
  let locked = false;

  try {
    // قفل الشات
    try {
      await sock.groupSettingUpdate(from, 'announcement');
      locked = true;
    } catch {
      await say('⚠️ ما قدرت أقفل الشات، تأكد إني مشرف بالقروب');
      return;
    }

    // منشن الكل + إعلان البدء
    const meta = await sock.groupMetadata(from);
    const everyone = meta.participants.map((p) => p.id);
    await say(
      `『 *مسابقة الايموجي* 🎮 』\n` +
        `──────────✦─────────\n` +
        `- *تم قفل الشات 🔒*\n` +
        `- *بعد ثواني بنرسل ايموجي، تفاعل عليه بنفس الايموجي بسرعة ⚡*\n` +
        `- *أول واحد يتفاعل بياخد نقطة*\n` +
        `- *أول واحد يوصل ${EMOJI_WIN} نقاط هو الفائز 🏆*\n` +
        `- ─────────ℛℴ𝒹ℴ──────\n` +
        `- *Enjoy* 🌹🚩`,
      everyone
    );
    await sleep(5000);

    let last = '';
    let winner = null;

    while (!g.stopped && g.round < EMOJI_MAX_ROUNDS && !winner) {
      g.round++;
      let emoji = pick(EMOJIS);
      while (EMOJIS.length > 1 && emoji === last) emoji = pick(EMOJIS);
      last = emoji;

      const sent = await sock.sendMessage(from, {
        text: `*🎯 الجولة ${g.round}*\n\nتفاعل بسرعة بهذا الايموجي:\n\n${emoji} ${emoji} ${emoji}`,
      });

      const who = await new Promise((resolve) => {
        g.cur = {
          id: sent.key.id,
          emoji: stripVS(emoji),
          resolve,
          timer: setTimeout(() => {
            g.cur = null;
            resolve(null);
          }, EMOJI_ROUND_TIME),
        };
      });
      g.cur = null;
      if (g.stopped) break;

      if (!who) {
        await say('⏰ *ما حدا تفاعل بهالجولة، منكمل...*');
        await sleep(2000);
        continue;
      }

      const pts = (g.points.get(who) || 0) + 1;
      g.points.set(who, pts);

      if (pts >= EMOJI_WIN) {
        winner = who;
        break;
      }

      await say(
        `✅ ${tag(who)} *أخذ نقطة!*\n\n*📊 النقاط:*\n${emojiScoreboard(g)}`,
        [...g.points.keys()]
      );
      await sleep(3000);
    }

    if (winner) {
      const er = addPoints(from, winner, 'emoji');
      const others = [...g.points.keys()].filter((j) => j !== winner);
      await say(
        `✦⊰ *مبروك يـ* ${tag(winner)} ⊱\n` +
          `━━━━━━━━━\n` +
          `- *فزت بمسابقة الايموجي* 🏆\n` +
          ` *Absolutely aura* 👌\n` +
          `━━━━━━━━━━⊰❃⊱━━━━━━━━━\n` +
          `${others.length ? `*📊 باقي النقاط:*\n${others.map((j) => `• ${tag(j)}: ${g.points.get(j)}`).join('\n')}\n\n` : ''}` +
          (er ? `${pointsLine(er)}\n\n` : '') +
          `▬▭▭▬▭ Rσԃσ Bσƚ ▭▬▭▬▭▬`,
        [winner, ...others]
      );
    } else if (!g.stopped) {
      await say(
        `⌛ *انتهت المسابقة بدون فائز*` +
          (g.points.size ? `\n\n*📊 النقاط:*\n${emojiScoreboard(g)}` : ''),
        [...g.points.keys()]
      );
    }
  } catch (e) {
    console.log('emoji error:', e);
  } finally {
    // دايماً افتح الشات بالآخر
    if (locked) {
      try {
        await sock.groupSettingUpdate(from, 'not_announcement');
        await say('🔓 *تم فتح الشات*');
      } catch {
        await say('⚠️ ما قدرت أفتح الشات، افتحه يدوياً أو اكتب *ايموجي فتح*');
      }
    }
    emojiGames.delete(from);
  }
}

function handleEmojiReaction(m, from, r) {
  const g = emojiGames.get(from);
  if (!g || !g.cur) return;
  if (r.key?.id !== g.cur.id) return;
  const emoji = stripVS(r.text);
  if (!emoji || emoji !== g.cur.emoji) return; // تجاهل إزالة التفاعل أو ايموجي غلط
  const who = m.key.fromMe ? g.self : g.norm(m.key.participant);
  if (!who) return;
  const cur = g.cur;
  g.cur = null;
  clearTimeout(cur.timer);
  cur.resolve(who);
}

async function handleEmojiCmd(sock, m, from, clean) {
  const say = (text) => sock.sendMessage(from, { text }).catch(() => {});
  const sub = clean.split(/\s+/)[1] || '';
  const c = await groupCtx(sock, m, from);
  if (!c.isAdmin) return; // للمشرفين فقط، بدون رد منعاً للسبام

  const g = emojiGames.get(from);

  // إيقاف
  if (['stop', 'انهاء', 'إنهاء', 'ايقاف', 'إيقاف'].includes(sub)) {
    if (!g) return;
    g.stopped = true;
    if (g.cur) {
      clearTimeout(g.cur.timer);
      g.cur.resolve(null);
      g.cur = null;
    }
    await say('تم إيقاف المسابقة 🛑');
    return;
  }

  // فتح الشات يدوياً (للطوارئ)
  if (sub === 'فتح') {
    if (!c.botAdmin) return;
    try {
      await sock.groupSettingUpdate(from, 'not_announcement');
      await say('🔓 *تم فتح الشات*');
    } catch {}
    return;
  }

  if (sub) return;

  if (g) {
    await say('في مسابقة شغالة أصلاً، اكتب *ايموجي stop* لإيقافها');
    return;
  }
  if (games.has(from) || xoGames.has(from) || sxoGames.has(from)) {
    await say('في لعبة ثانية شغالة بالقروب، استنوا تخلص 🚩');
    return;
  }
  if (!c.botAdmin) {
    await say('⚠️ لازم يكون رقم البوت مشرف بالقروب عشان أقدر أقفل الشات');
    return;
  }

  const game = {
    points: new Map(),
    round: 0,
    cur: null,
    stopped: false,
    norm: c.norm,
    self: c.self,
  };
  emojiGames.set(from, game);
  runEmoji(sock, from, game);
}

// ================= XO تحدي عادي =================
function xoEnd(from) {
  const g = xoGames.get(from);
  if (g) {
    clearTimeout(g.timer);
    xoGames.delete(from);
  }
}

function xoArm(sock, from, g) {
  clearTimeout(g.timer);
  g.timer = setTimeout(async () => {
    xoGames.delete(from);
    try {
      if (g.state === 'invite') {
        await sock.sendMessage(from, {
          text: `⏰ ${tag(g.p[1])} ما رد على التحدي، انلغت اللعبة`,
          mentions: [g.p[1]],
        });
      } else {
        const loser = g.p[g.turn];
        const winner = g.p[1 - g.turn];
        await sock.sendMessage(from, {
          text: `⏰ ${tag(loser)} تأخر كثير!\n🏆 الفوز لـ ${tag(winner)}`,
          mentions: [loser, winner],
        });
      }
    } catch {}
  }, 60000);
}

// يرجع true إذا الرسالة تخص XO
async function handleXO(sock, m, from, clean, mentioned, ctx) {
  const g = xoGames.get(from);
  const say = (text, mentions = []) =>
    sock.sendMessage(from, { text, mentions });

  // إنهاء اللعبة
  if (/^xo\s+(stop|انهاء|إنهاء)$/.test(clean)) {
    if (!g) return true;
    const sender = m.key.fromMe ? g.self : g.norm(m.key.participant);
    if (m.key.fromMe || g.p.includes(sender)) {
      xoEnd(from);
      await say('تم إنهاء لعبة XO 🛑');
    }
    return true;
  }

  // بدء تحدي جديد
  if (/^xo(\s|$)/.test(clean)) {
    if (sxoGames.has(from)) {
      await say('في بطولة XO شغالة بالقروب، استنوا تخلص 🚩');
      return true;
    }
    if (emojiGames.has(from)) {
      await say('في مسابقة ايموجي شغالة بالقروب، استنوا تخلص 🚩');
      return true;
    }
    if (g) {
      await say('في لعبة XO شغالة أصلاً، اكتب *xo stop* لإنهائها');
      return true;
    }
    const meta = await sock.groupMetadata(from);
    const norm = makeNorm(meta);
    const self = selfJid(sock, norm, meta);
    const sender = m.key.fromMe ? self : norm(m.key.participant);
    const target = mentioned[0] || ctx?.participant;

    if (!target) {
      await say('*الاستخدام:*\n`xo @منشن_الخصم`\nأو رد على رسالة الخصم واكتب `xo`');
      return true;
    }
    const opp = norm(target);
    const ids = new Set(meta.participants.map((p) => p.id));
    if (!ids.has(opp)) {
      await say('⚠️ هاد الشخص مو موجود بالقروب');
      return true;
    }
    if (opp === sender) {
      await say('ما تقدر تلعب ضد نفسك 😅');
      return true;
    }
    const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean).map(norm);
    if (botIds.includes(opp) && !m.key.fromMe) {
      await say('ما تقدر تتحدى البوت 🤖');
      return true;
    }

    const game = {
      state: 'invite',
      p: [sender, opp],
      board: Array(9).fill(null),
      turn: 0,
      norm,
      self,
      timer: null,
    };
    xoGames.set(from, game);
    await say(
      card('❌⭕ تحدي XO', [`🔥 ${tag(sender)} تحدّى ${tag(opp)}`], `${tag(opp)} اكتب *قبول* أو *رفض*\nعندك دقيقة`, false),
      [sender, opp]
    );
    xoArm(sock, from, game);
    return true;
  }

  if (!g) return false;
  const sender = m.key.fromMe ? g.self : g.norm(m.key.participant);

  // الرد على التحدي
  if (g.state === 'invite') {
    if (sender !== g.p[1]) return false;
    if (/^(قبول|yes|ok|اوك|أوك|موافق)$/.test(clean)) {
      g.state = 'play';
      await say(
        card('❌⭕ بدأت اللعبة!', [renderBoard(g.board), '', `${MARK[0]} ${tag(g.p[0])}`, `${MARK[1]} ${tag(g.p[1])}`], `دور ${tag(g.p[0])} ${MARK[0]}\nاكتب رقم من 1 إلى 9`, false),
        g.p
      );
      xoArm(sock, from, g);
      return true;
    }
    if (/^(رفض|no|لا)$/.test(clean)) {
      xoEnd(from);
      await say(`${tag(g.p[1])} رفض التحدي 🙅`, [g.p[1]]);
      return true;
    }
    return false;
  }

  // الحركات
  if (g.state === 'play' && /^[1-9]$/.test(clean)) {
    if (sender !== g.p[g.turn]) return false;
    const i = Number(clean) - 1;
    if (g.board[i] !== null) {
      await say('⚠️ الخانة مشغولة، اختر رقم ثاني');
      return true;
    }
    g.board[i] = g.turn;

    const w = checkWin(g.board);
    if (w !== null) {
      const xr = addXoPoints(from, g.p[w], g.p[1 - w]);
      xoEnd(from);
      await say(
        card('🏆 انتهت اللعبة', [
          renderBoard(g.board),
          '',
          `🎉 *مبروك* ${tag(g.p[w])} *فزت باللعبة!*`,
          '',
          pointsLine(xr) || '⏳ بدون نقاط (نفس الخصم بوقت قريب)',
        ]),
        [g.p[w]]
      );
      return true;
    }
    if (g.board.every((c) => c !== null)) {
      xoEnd(from);
      await say(card('🤝 تعادل!', [renderBoard(g.board)]));
      return true;
    }

    g.turn = 1 - g.turn;
    await say(
      card('❌⭕ XO', [renderBoard(g.board)], `دور ${tag(g.p[g.turn])} ${MARK[g.turn]}`, false),
      [g.p[g.turn]]
    );
    xoArm(sock, from, g);
    return true;
  }

  return false;
}

// ================= بطولة sxo =================
const SXO_INTRO = `『 *لعبة X,O* 🚩』
ّ
──────────✦─────────
- *طبعآ الكل يعرف اللعبة م تحتاج شرح🐤🍿*
- ─────────ℛℴ𝒹ℴ──────
- *كل شخص يريد يشارك يرد بـ"ضيفني"🔰*
- *من غير سبام لو سمحتو🚫*
- ──
- *Enjoy* 🌹🚩`;

function sxoWinText(w, losers) {
  return (
    `✦⊰ *مبروك يـ* ${tag(w)} ⊱\n` +
    `━━━━━━━━━\n` +
    `- *دعستهم بذكاءك* 🔥\n` +
    ` *Absolutely aura* 👌\n` +
    `━━━━━━━━━━⊰❃⊱━━━━━━━━━\n` +
    `\`الخاسرين\`:\n` +
    `${losers.map((l) => tag(l)).join(' ')} *اضربو براسكم الحيط* 🙂✨\n\n` +
    `▬▭▭▬▭ Rσԃσ Bσƚ ▭▬▭▬▭▬`
  );
}

function sxoStop(from) {
  const t = sxoGames.get(from);
  if (!t) return;
  t.stopped = true;
  clearTimeout(t.regTimer);
  const mt = t.match;
  if (mt) {
    clearTimeout(mt.timer);
    t.match = null;
    mt.resolve({ stopped: true });
  }
  sxoGames.delete(from);
}

async function sxoClose(sock, from, t) {
  if (t.state !== 'reg') return;
  clearTimeout(t.regTimer);
  if (t.players.length < 2) {
    sxoGames.delete(from);
    await sock
      .sendMessage(from, { text: '❌ انلغت البطولة، لازم مشاركين اثنين على الأقل' })
      .catch(() => {});
    return;
  }
  t.state = 'play';
  runSxo(sock, from, t);
}

// مباراة واحدة (x يبدأ)
function sxoPlayOne(sock, from, t, x, o) {
  return new Promise(async (resolve) => {
    const say = (text, mentions = []) =>
      sock.sendMessage(from, { text, mentions }).catch(() => {});
    const mt = {
      p: [x, o],
      board: Array(9).fill(null),
      turn: 0,
      timer: null,
      resolve,
      arm: null,
    };
    mt.arm = () => {
      if (t.match !== mt) return;
      clearTimeout(mt.timer);
      mt.timer = setTimeout(async () => {
        if (t.match !== mt) return;
        t.match = null;
        const loser = mt.p[mt.turn];
        const winner = mt.p[1 - mt.turn];
        await say(`⏰ ${tag(loser)} تأخر كثير وخسر!`, [loser]);
        resolve({ winner });
      }, MOVE_TIME);
    };
    t.match = mt;
    await say(
      card('❌⭕ المباراة', [renderBoard(mt.board), '', `❌ ${tag(x)}`, `⭕ ${tag(o)}`], `دور ${tag(x)} ❌\nاكتب رقم من 1 إلى 9`, false),
      [x, o]
    );
    mt.arm();
  });
}

// مباراة كاملة مع إعادة عند التعادل. ترجع الفائز أو null إذا انوقفت
async function sxoMatch(sock, from, t, a, b) {
  const say = (text, mentions = []) =>
    sock.sendMessage(from, { text, mentions }).catch(() => {});
  let x = a;
  let o = b;
  let lastBoard = '';
  for (let n = 0; n < 3; n++) {
    if (t.stopped) return null;
    const r = await sxoPlayOne(sock, from, t, x, o);
    if (r.stopped || t.stopped) return null;
    if (r.winner) {
      await say(
        `${r.board ? r.board + '\n\n' : ''}✅ تأهل ${tag(r.winner)} 🔥`,
        [r.winner]
      );
      return r.winner;
    }
    lastBoard = r.board || '';
    if (n < 2) {
      await say(
        `${lastBoard}\n\n🤝 *تعادل!* إعادة المباراة مع تبديل الأدوار (${n + 1}/2)`
      );
      [x, o] = [o, x];
      await sleep(2000);
    }
  }
  const w = pick([a, b]);
  await say(
    `${lastBoard}\n\n🤝 *تعادل ثالث!*\n🎲 تم اختيار المتأهل بالقرعة: ${tag(w)}`,
    [w]
  );
  return w;
}

async function runSxo(sock, from, t) {
  const say = (text, mentions = []) =>
    sock.sendMessage(from, { text, mentions }).catch(() => {});
  try {
    const all = [...t.players];
    await say(
      `🔒 *أُغلق التسجيل*\n\n👥 *المشاركين (${all.length}):*\n${all
        .map((p, i) => `${i + 1}. ${tag(p)}`)
        .join('\n')}\n\n> البطولة بتبدأ بعد ثواني، جهزوا حالكم ⚔️`,
      all
    );
    await sleep(5000);

    let alive = shuffle(all);
    const losers = [];
    let round = 1;

    while (alive.length > 1 && !t.stopped) {
      alive = shuffle(alive);
      const total = alive.length;
      let bye = null;
      if (alive.length % 2 === 1) bye = alive.pop();

      const pairs = [];
      for (let i = 0; i < alive.length; i += 2) pairs.push([alive[i], alive[i + 1]]);

      const title = total === 2 ? '🏆 النهائي' : `الجولة ${round}`;
      let txt =
        `*${title}*\n\n` +
        pairs.map(([a, b]) => `⚔️ ${tag(a)} ❌ ضد ⭕ ${tag(b)}`).join('\n');
      if (bye) txt += `\n\n🎟️ ${tag(bye)} تأهل مباشرة (عدد فردي)`;
      await say(txt, [...pairs.flat(), ...(bye ? [bye] : [])]);
      await sleep(3000);

      const next = [];
      for (const [a, b] of pairs) {
        if (t.stopped) break;
        const w = await sxoMatch(sock, from, t, a, b);
        if (w === null) break;
        next.push(w);
        losers.push(w === a ? b : a);
        await sleep(2000);
      }
      if (t.stopped) break;
      if (bye) next.push(bye);
      alive = next;
      round++;
    }

    if (!t.stopped && alive.length === 1) {
      const w = alive[0];
      const sr = addPoints(from, w, 'sxo');
      await say(sxoWinText(w, losers) + (sr ? `\n${pointsLine(sr)}` : ''), [w, ...losers]);
    }
  } catch (e) {
    console.log('sxo error:', e);
  } finally {
    if (sxoGames.get(from) === t) sxoGames.delete(from);
  }
}

// يرجع true إذا الرسالة تخص sxo
async function handleSxo(sock, m, from, clean) {
  const t = sxoGames.get(from);
  const say = (text, mentions = []) =>
    sock.sendMessage(from, { text, mentions }).catch(() => {});

  // الأوامر
  const cmd = clean.match(/^sxo(?:\s+(\S+))?$/);
  if (cmd) {
    const sub = (cmd[1] || '').toLowerCase();
    const c = await groupCtx(sock, m, from);
    if (!c.isAdmin) return true; // للمشرفين فقط (وبدون رد منعاً للسبام)

    // بدء التسجيل
    if (!sub) {
      if (t) {
        await say('في بطولة شغالة أصلاً، اكتب *sxo stop* لإلغائها');
        return true;
      }
      if (xoGames.has(from)) {
        await say('في تحدي XO شغال، اكتب *xo stop* أولاً');
        return true;
      }
      if (emojiGames.has(from)) {
        await say('في مسابقة ايموجي شغالة، استنوا تخلص 🚩');
        return true;
      }
      const nt = {
        state: 'reg',
        players: [],
        norm: c.norm,
        self: c.self,
        regTimer: null,
        match: null,
        stopped: false,
      };
      sxoGames.set(from, nt);
      await say(SXO_INTRO);
      nt.regTimer = setTimeout(() => sxoClose(sock, from, nt), REG_TIME);
      return true;
    }

    if (!t) return true;

    if (['stop', 'انهاء', 'إنهاء', 'الغاء', 'إلغاء'].includes(sub)) {
      sxoStop(from);
      await say('تم إلغاء البطولة 🛑');
      return true;
    }
    if (['go', 'start', 'بدء', 'ابدأ'].includes(sub)) {
      if (t.state !== 'reg') return true;
      await sxoClose(sock, from, t);
      return true;
    }
    if (sub === 'list') {
      if (!t.players.length) {
        await say('ما في مشاركين لسا');
      } else {
        await say(
          `👥 *المشاركين (${t.players.length}/${MAX_PLAYERS}):*\n${t.players
            .map((p, i) => `${i + 1}. ${tag(p)}`)
            .join('\n')}`,
          t.players
        );
      }
      return true;
    }
    return true;
  }

  if (!t) return false;

  // التسجيل: "ضيفني"
  if (t.state === 'reg' && /^ضيفني/.test(clean)) {
    const sender = m.key.fromMe ? t.self : t.norm(m.key.participant);
    if (!sender) return true;
    if (!t.players.includes(sender)) {
      t.players.push(sender);
      sock
        .sendMessage(from, { react: { text: '✅', key: m.key } })
        .catch(() => {});
      if (t.players.length >= MAX_PLAYERS) {
        await say(`✅ اكتمل العدد (${MAX_PLAYERS})، بتبدأ البطولة!`);
        await sxoClose(sock, from, t);
      }
    }
    return true;
  }

  // الحركات
  if (t.state === 'play' && t.match && /^[1-9]$/.test(clean)) {
    const mt = t.match;
    const sender = m.key.fromMe ? t.self : t.norm(m.key.participant);
    if (sender !== mt.p[mt.turn]) return false;

    const i = Number(clean) - 1;
    if (mt.board[i] !== null) {
      await say('⚠️ الخانة مشغولة، اختر رقم ثاني');
      return true;
    }
    mt.board[i] = mt.turn;

    const w = checkWin(mt.board);
    if (w !== null) {
      clearTimeout(mt.timer);
      t.match = null;
      mt.resolve({ winner: mt.p[w], board: renderBoard(mt.board) });
      return true;
    }
    if (mt.board.every((c) => c !== null)) {
      clearTimeout(mt.timer);
      t.match = null;
      mt.resolve({ draw: true, board: renderBoard(mt.board) });
      return true;
    }

    mt.turn = 1 - mt.turn;
    await say(
      card('❌⭕ XO', [renderBoard(mt.board)], `دور ${tag(mt.p[mt.turn])} ${MARK[mt.turn]}`, false),
      [mt.p[mt.turn]]
    );
    mt.arm();
    return true;
  }

  return false;
}

// ================= لعبة القنبلة =================
// رد الفوز: 10% / 70% / 20%
function winnerText(jid) {
  const r = Math.random() * 100;
  if (r < 10) {
    return `*مبروك يا* ${tag(jid)} *فزت باللعبة وتفوقت على النوبات او يمكن حظ تحب نعيد؟🙂‍↕️🤙*`;
  }
  if (r < 80) {
    return `*مبروك يا* ${tag(jid)} *فشخت كل النوبات Absolutely aura👌* 🌹`;
  }
  return `*مبروك* ${tag(jid)}🐦`;
}

async function playGame(sock, from, g) {
  const say = (text, mentions = []) =>
    sock.sendMessage(from, { text, mentions });

  try {
    await say(
      card('💣 لعبة القنبلة 💥', ['⏳ *استعدوا يا متسابقين...*', 'اللعبة بتبدأ بعد ثواني!'], 'اللي بنمنشنه لازم يمنشن شخص غيره\nقبل ما أعد لـ 3 وإلا بينطرد 😈\n⚡ ولما يبقى اثنين بس: ثانيتين فقط!')
    );
    await sleep(5000);

    while (g.alive.size > 1 && !g.stopped) {
      let holder = pick([...g.alive]);

      while (!g.stopped) {
        const turn = { holder, target: null };
        g.turn = turn;
        const duel = g.alive.size === 2; // باقي اثنين: بدون عدّ، ثانيتين بس
        await say(
          duel
            ? `⚡ ${tag(holder)}\n> *المواجهة الأخيرة! منشن خصمك بثانيتين!*`
            : `💣 ${tag(holder)}\n> *منشن شخص غيرك قبل ما أعد لـ 3!*`,
          [holder]
        );

        const start = Date.now();
        let counted = 0;
        let countMsg = null;
        const limit = duel ? BOMB_DUEL_TIME : 3500;
        while (Date.now() - start < limit && !turn.target && !g.stopped) {
          await sleep(50);
          const sec = Math.floor((Date.now() - start) / 1000);
          if (!duel && sec > counted && sec <= 3 && !turn.target) {
            counted = sec;
            const text = ['1️⃣', '2️⃣', '3️⃣'][sec - 1];
            try {
              if (countMsg) {
                await sock.sendMessage(from, { text, edit: countMsg.key });
              } else {
                countMsg = await sock.sendMessage(from, { text });
              }
            } catch {}
          }
        }
        g.turn = null;
        if (g.stopped) break;

        if (turn.target) {
          holder = turn.target; // نجح، الدور على الشخص اللي انمنشن
          continue;
        }

        // فشل: طرد
        g.alive.delete(holder);
        await say(`${tag(holder)} 💥 *المرة الجاية يا نوب*`, [holder]);
        try {
          await sock.groupParticipantsUpdate(from, [holder], 'remove');
        } catch {
          await say('⚠️ ما قدرت أطرده، تأكد إن البوت مشرف بالقروب');
        }
        break;
      }

      if (g.alive.size > 1 && !g.stopped) await sleep(2000);
    }

    if (!g.stopped && g.alive.size === 1) {
      const w = [...g.alive][0];
      const br = addPoints(from, w, 'bomb');
      await say(winnerText(w) + (br ? `\n\n${pointsLine(br)}` : ''), [w]);
    }
  } catch (e) {
    console.log('game error:', e);
  } finally {
    games.delete(from);
  }
}

// ================= بحث الصور =================
// المصادر: AniList (شخصيات الأنمي) + ويكيبيديا (أي موضوع ثاني)
const arNorm = (s) =>
  s
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();

// أسماء الشخصيات: عربي ← انجليزي (زيد عليها متل ما بدك)
const CHAR_ALIASES = {
  'استا': 'Asta', 'يونو': 'Yuno', 'نويل': 'Noelle Silva', 'يامي': 'Yami Sukehiro',
  'ناروتو': 'Naruto Uzumaki', 'ساسكي': 'Sasuke Uchiha', 'ساكورا': 'Sakura Haruno',
  'كاكاشي': 'Kakashi Hatake', 'ايتاتشي': 'Itachi Uchiha', 'مادارا': 'Madara Uchiha',
  'هيناتا': 'Hinata Hyuga', 'لوفي': 'Monkey D. Luffy', 'زورو': 'Roronoa Zoro',
  'سانجي': 'Sanji', 'نامي': 'Nami', 'غوكو': 'Son Goku', 'جوكو': 'Son Goku',
  'فيجيتا': 'Vegeta', 'ايرين': 'Eren Yeager', 'ميكاسا': 'Mikasa Ackerman',
  'ليفاي': 'Levi Ackerman', 'تانجيرو': 'Tanjiro Kamado', 'نيزوكو': 'Nezuko Kamado',
  'زينيتسو': 'Zenitsu Agatsuma', 'اينوسكي': 'Inosuke Hashibira', 'غوجو': 'Satoru Gojo',
  'ايتادوري': 'Yuji Itadori', 'سوكونا': 'Ryomen Sukuna', 'ليت': 'Light Yagami',
  'ديكو': 'Izuku Midoriya', 'ميدوريا': 'Izuku Midoriya', 'باكوغو': 'Katsuki Bakugo',
};
// أسماء الأنميات (تساعد بتحديد الشخصية الصح)
const ANIME_ALIASES = {
  'بلاك كلوفر': 'Black Clover', 'ون بيس': 'One Piece', 'ناروتو شيبودن': 'Naruto Shippuden',
  'بليتش': 'Bleach', 'دراغون بول': 'Dragon Ball', 'هجوم العمالقة': 'Attack on Titan',
  'ديمون سلاير': 'Demon Slayer', 'جوجوتسو كايسن': 'Jujutsu Kaisen',
  'ماي هيرو اكاديميا': 'My Hero Academia', 'ديث نوت': 'Death Note',
  'هنتر': 'Hunter x Hunter', 'توكيو غول': 'Tokyo Ghoul', 'فيري تيل': 'Fairy Tail',
  'ون بانش مان': 'One Punch Man',
};
const CHAR_MAP = new Map(Object.entries(CHAR_ALIASES).map(([k, v]) => [arNorm(k), v]));
const ANIME_LIST = [
  ...Object.entries(ANIME_ALIASES).map(([k, v]) => [arNorm(k), v]),
  ...Object.values(ANIME_ALIASES).map((v) => [v.toLowerCase(), v]),
].sort((a, b) => b[0].length - a[0].length);

function parseImageQuery(q) {
  let s = arNorm(q);
  let anime = '';
  for (const [key, en] of ANIME_LIST) {
    if (s.includes(key)) {
      anime = en;
      s = s.replace(key, ' ').replace(/\s+/g, ' ').trim();
      break;
    }
  }
  const tokens = s.split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const two = tokens[i] + ' ' + (tokens[i + 1] || '');
    if (CHAR_MAP.has(two.trim()) && tokens[i + 1]) {
      out.push(CHAR_MAP.get(two.trim()));
      i++;
    } else if (CHAR_MAP.has(tokens[i])) {
      out.push(CHAR_MAP.get(tokens[i]));
    } else {
      out.push(tokens[i]);
    }
  }
  return { term: out.join(' ').trim(), anime };
}

const FETCH_OPTS = () => ({ signal: AbortSignal.timeout(10000) });

async function anilistCharacter(term, anime) {
  const query = `query($s:String){Page(perPage:15){characters(search:$s,sort:[FAVOURITES_DESC]){
    name{full native} image{large}
    media(perPage:5){nodes{isAdult title{romaji english}}}}}}`;
  const r = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { s: term } }),
    ...FETCH_OPTS(),
  });
  const j = await r.json();
  let list = (j?.data?.Page?.characters || []).filter(
    (c) =>
      c.image?.large &&
      !/default/i.test(c.image.large) &&
      c.media?.nodes?.some((n) => !n.isAdult)
  );
  if (anime) {
    const h = anime.toLowerCase();
    const f = list.filter((c) =>
      c.media.nodes.some((n) =>
        [n.title?.romaji, n.title?.english].filter(Boolean).some((t) => t.toLowerCase().includes(h))
      )
    );
    if (f.length) list = f;
  }
  const c = list[0];
  if (!c) return null;
  const n = c.media.nodes.find((x) => !x.isAdult) || c.media.nodes[0];
  return {
    img: c.image.large,
    name: c.name.full,
    native: c.name.native,
    anime: n?.title?.english || n?.title?.romaji || '',
  };
}

async function wikiImage(term, lang) {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search` +
    `&gsrsearch=${encodeURIComponent(term)}&gsrlimit=5&prop=pageimages|extracts` +
    `&piprop=thumbnail&pithumbsize=900&exintro=1&explaintext=1&exsentences=2` +
    `&format=json&origin=*`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'RodoBot/1.0 (WhatsApp bot)' },
    ...FETCH_OPTS(),
  });
  const j = await r.json();
  const pages = Object.values(j?.query?.pages || {}).sort((a, b) => a.index - b.index);
  const p = pages.find((x) => x.thumbnail?.source);
  return p ? { img: p.thumbnail.source, title: p.title, text: (p.extract || '').trim() } : null;
}

const lastImgSearch = new Map();
async function handleImageSearch(sock, m, from, query) {
  const send = (text) => sock.sendMessage(from, { text }, { quoted: m });

  if (Date.now() - (lastImgSearch.get(from) || 0) < 4000) return; // منع السبام
  lastImgSearch.set(from, Date.now());

  try {
    await sock.sendMessage(from, { react: { text: '🔎', key: m.key } });
  } catch {}

  const { term, anime } = parseImageQuery(query);
  if (!term) {
    await send(card('🔎 بحث الصور', ['اكتب: *بحث صورة اسم_الشخصية*', 'مثال: *بحث صورة استا بلاك كلوفر*'], '', false));
    return;
  }
  const hasLatin = /[a-z]/i.test(term);

  try {
    if (hasLatin) {
      const c = await anilistCharacter(term, anime);
      if (c) {
        await sock.sendMessage(
          from,
          {
            image: { url: c.img },
            caption: card(
              '🔎 نتيجة البحث',
              [
                `👤 *الاسم:* ${c.name}`,
                c.native ? `🈶 *بالأصل:* ${c.native}` : '',
                c.anime ? `🎬 *الأنمي:* ${c.anime}` : '',
              ].filter(Boolean),
              'المصدر: AniList'
            ),
          },
          { quoted: m }
        );
        return;
      }
    }

    const w = await wikiImage(anime ? `${term} ${anime}` : term, hasLatin ? 'en' : 'ar');
    if (w) {
      await sock.sendMessage(
        from,
        {
          image: { url: w.img },
          caption: card(
            `🔎 ${w.title}`,
            w.text ? [w.text.slice(0, 250) + (w.text.length > 250 ? '...' : '')] : [],
            'المصدر: ويكيبيديا'
          ),
        },
        { quoted: m }
      );
      return;
    }

    await send(
      card(
        '🔎 ما لقيت نتيجة',
        [`ما لقيت صورة لـ: *${query}*`],
        'لشخصيات الأنمي جرّب تكتب الاسم بالانجليزي\nمثال: بحث صورة Asta Black Clover'
      )
    );
  } catch (e) {
    console.log('image search error:', e?.message || e);
    await send(card('⚠️ فشل البحث', ['صار خطأ أثناء البحث، جرّب مرة ثانية بعد شوي.'], '', false));
  }
}

// ================= نظام النقاط =================
const POINTS_FILE = path.join(__dirname, 'points.json');
const PTS = { bomb: 5, emoji: 4, xo: 3, sxo: 10 }; // نقاط الفوز بكل لعبة
const XO_PAIR_COOLDOWN = 10 * 60 * 1000;           // نفس الخصمين: نقاط مرة كل 10 دقايق

const LEVELS = [
  { min: 0, name: 'مبتدئ', icon: '🌱' },
  { min: 10, name: 'محارب', icon: '⚔️' },
  { min: 30, name: 'فارس', icon: '🛡️' },
  { min: 60, name: 'ملك', icon: '👑' },
  { min: 120, name: 'أسطورة', icon: '🔥' },
  { min: 250, name: 'خرافي', icon: '💎' },
];
const levelOf = (p) => [...LEVELS].reverse().find((l) => p >= l.min);
const nextLevelOf = (p) => LEVELS.find((l) => l.min > p);
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

let pointsDB = {};
try {
  pointsDB = JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8'));
} catch {}
let pointsTimer = null;
function savePoints() {
  clearTimeout(pointsTimer);
  pointsTimer = setTimeout(() => {
    try {
      fs.writeFileSync(POINTS_FILE, JSON.stringify(pointsDB));
    } catch (e) {
      console.log('points save error:', e?.message);
    }
  }, 500);
}

function addPoints(chat, jid, game) {
  if (!chat.endsWith('@g.us') || !jid) return null;
  const db = (pointsDB[chat] = pointsDB[chat] || {});
  const u = (db[jid] = db[jid] || { p: 0, w: 0 });
  const gain = PTS[game];
  u.p += gain;
  u.w += 1;
  savePoints();
  return { gain, total: u.p };
}

const xoPairLast = new Map();
function addXoPoints(chat, winner, loser) {
  const key = chat + '|' + [winner, loser].sort().join('|');
  if (Date.now() - (xoPairLast.get(key) || 0) < XO_PAIR_COOLDOWN) return null;
  xoPairLast.set(key, Date.now());
  return addPoints(chat, winner, 'xo');
}

const pointsLine = (r) =>
  r ? `⭐ *+${r.gain} نقطة* ⟢ مجموعك *${r.total}*` : '';

const BOX_TOP = '┏━━━━━━━━━━━━━━━━━━┓';
const BOX_BOT = '┗━━━━━━━━━━━━━━━━━━┛';

function leaderboardText(chat) {
  const rows = Object.entries(pointsDB[chat] || {})
    .filter(([, u]) => u.p > 0)
    .sort((a, b) => b[1].p - a[1].p || b[1].w - a[1].w)
    .slice(0, 10);

  const head = `${BOX_TOP}\n   🏆 *لوحة الشرف* 🏆\n${BOX_BOT}\n\n`;
  const foot =
    `${LINE}\n` +
    `> 💣 قنبلة +${PTS.bomb} • 🎯 ايموجي +${PTS.emoji}\n` +
    `> ❌⭕ XO +${PTS.xo} • 🏅 بطولة +${PTS.sxo}\n\n` +
    `${LINE2}\n${BRAND}`;

  if (!rows.length) {
    return { text: head + '🌙 *ما في نقاط بعد*\nالعبوا واكسبوا أول نقطة! 🎮\n\n' + foot, mentions: [] };
  }

  const body = rows
    .map(([jid, u], i) => {
      const lv = levelOf(u.p);
      return `${MEDALS[i]} ${tag(jid)}\n      ╰┈➤ *${u.p}* نقطة ‹ ${lv.icon} ${lv.name} ›`;
    })
    .join('\n\n');

  return { text: head + body + '\n\n' + foot, mentions: rows.map(([j]) => j) };
}

function profileText(chat, jid) {
  const db = pointsDB[chat] || {};
  const u = db[jid] || { p: 0, w: 0 };
  const lv = levelOf(u.p);
  const nx = nextLevelOf(u.p);

  const ranked = Object.entries(db)
    .filter(([, x]) => x.p > 0)
    .sort((a, b) => b[1].p - a[1].p || b[1].w - a[1].w)
    .map(([j]) => j);
  const pos = ranked.indexOf(jid);

  let bar = '▰▰▰▰▰▰▰▰▰▰ *أعلى مستوى* 👑';
  if (nx) {
    const span = nx.min - lv.min;
    const done = Math.min(10, Math.floor(((u.p - lv.min) / span) * 10));
    bar =
      '▰'.repeat(done) + '▱'.repeat(10 - done) +
      ` ${Math.floor(((u.p - lv.min) / span) * 100)}%\n> باقي *${nx.min - u.p}* نقطة لـ ${nx.icon} ${nx.name}`;
  }

  return (
    `${BOX_TOP}\n   ⭐ *بطاقة اللاعب* ⭐\n${BOX_BOT}\n\n` +
    `👤 ${tag(jid)}\n` +
    `${lv.icon} المستوى ⟢ *${lv.name}*\n` +
    `💰 النقاط ⟢ *${u.p}*\n` +
    `🏆 الانتصارات ⟢ *${u.w}*\n` +
    `📊 الترتيب ⟢ *${pos >= 0 ? '#' + (pos + 1) + ' من ' + ranked.length : 'بدون ترتيب'}*\n\n` +
    `${bar}\n\n${LINE2}\n${BRAND}`
  );
}

async function handlePoints(sock, m, from, clean, mentioned, ctx) {
  const meta = await sock.groupMetadata(from);
  const norm = makeNorm(meta);
  const self = selfJid(sock, norm, meta);
  const sender = m.key.fromMe ? self : norm(m.key.participant);
  const send = (text, mentions = []) =>
    sock.sendMessage(from, { text, mentions }, { quoted: m });

  if (clean === 'ترتيب') {
    const r = leaderboardText(from);
    await send(r.text, r.mentions);
    return;
  }

  if (clean === 'نقاطي' || clean === 'نقاط') {
    let target = sender;
    if (clean === 'نقاط') {
      if (mentioned.length) target = norm(mentioned[0]);
      else if (ctx?.participant) target = norm(ctx.participant);
    }
    await send(profileText(from, target), [target]);
    return;
  }

  // تصفير (للمشرفين فقط)
  const admins = new Set(meta.participants.filter((p) => p.admin).map((p) => p.id));
  if (!m.key.fromMe && !admins.has(sender)) {
    await send('🚫 تصفير النقاط للمشرفين فقط');
    return;
  }
  if (clean === 'تصفير النقاط تأكيد') {
    delete pointsDB[from];
    savePoints();
    await send(card('🧹 تم التصفير', ['تم مسح كل نقاط هالقروب.'], '', false));
  } else {
    await send(
      card('⚠️ تصفير النقاط', ['هاد بيمسح كل نقاط القروب نهائياً.', 'للتأكيد اكتب:', '*تصفير النقاط تأكيد*'], '', false)
    );
  }
}

// ================= فئة V (النخبة) =================
const ELITE_FILE = path.join(__dirname, 'elite.json');
let eliteDB = [];
try {
  eliteDB = JSON.parse(fs.readFileSync(ELITE_FILE, 'utf8'));
} catch {}
function saveElite() {
  try {
    fs.writeFileSync(ELITE_FILE, JSON.stringify(eliteDB));
  } catch (e) {
    console.log('elite save error:', e?.message);
  }
}
const isElite = (jid) => !!jid && eliteDB.includes(jidNormalizedUser(jid));
function addElite(jid) {
  const n = jidNormalizedUser(jid || '');
  if (!n || eliteDB.includes(n)) return false;
  eliteDB.push(n);
  saveElite();
  return true;
}
// جيب جي-آي-دي المرسل بأي سياق (قروب أو خاص)
const senderOf = (sock, m, from) =>
  jidNormalizedUser(m.key.fromMe ? sock.user?.id || '' : m.key.participant || from);
// جيب الشخص المستهدف: منشن أو رد (بالقروب)، أو طرف المحادثة (بالخاص)
function pickTarget(from, isGroup, mentioned, ctx) {
  if (isGroup) {
    if (mentioned?.length) return jidNormalizedUser(mentioned[0]);
    if (ctx?.participant) return jidNormalizedUser(ctx.participant);
    return null;
  }
  return jidNormalizedUser(from);
}

let copiedGroup = null; // آخر قروب تم نسخ بياناته (نسخ قروب / لصق قروب)

async function handleEliteAdd(sock, m, from, isGroup, mentioned, ctx) {
  if (!m.key.fromMe) return; // لصاحب الرقم فقط
  const target = pickTarget(from, isGroup, mentioned, ctx);
  if (!target) {
    await sock.sendMessage(
      from,
      { text: card('⚠️ ارفع نخبة', ['منشن شخص أو رد على رسالته (بالقروب)، أو اكتب الأمر بالخاص معه.'], '', false) },
      { quoted: m }
    );
    return;
  }
  const ok = addElite(target);
  await sock.sendMessage(
    from,
    {
      text: card(ok ? '✅ تمت الترقية' : 'ℹ️ موجود مسبقاً', [tag(target) + (ok ? ' صار من فئة V 🍷' : ' أصلاً من فئة V')], '', true),
      mentions: [target],
    },
    { quoted: m }
  );
}

async function handleSteal(sock, m, from, isGroup, mentioned, ctx) {
  if (!m.key.fromMe && !isElite(senderOf(sock, m, from))) return;
  const target = pickTarget(from, isGroup, mentioned, ctx);
  if (!target) {
    await sock.sendMessage(from, { text: card('⚠️ سرقة', ['منشن شخص أو رد على رسالته.'], '', false) }, { quoted: m });
    return;
  }
  try {
    const url = await sock.profilePictureUrl(target, 'image');
    await sock.sendMessage(
      from,
      { image: { url }, caption: card('🍷 تم السرقة بنجاح', [tag(target)], '', true), mentions: [target] },
      { quoted: m }
    );
  } catch {
    await sock.sendMessage(
      from,
      { text: card('⚠️ تعذّرت السرقة', ['ما قدرت أجيب صورة البروفايل (ممكن تكون مخفية أو ما في صورة).'], '', false) },
      { quoted: m }
    );
  }
}

async function handleSetGroupPic(sock, m, from, isGroup, ctx) {
  if (!m.key.fromMe && !isElite(senderOf(sock, m, from))) return;
  if (!isGroup) return;
  const imgMsg = ctx?.quotedMessage?.imageMessage;
  if (!imgMsg) {
    await sock.sendMessage(
      from,
      { text: card('⚠️ بروفايل', ['رد على صورة واكتب *بروفايل* عشان أحطها صورة للقروب.'], '', false) },
      { quoted: m }
    );
    return;
  }
  try {
    const buffer = await downloadMediaMessage(
      {
        key: { remoteJid: from, id: ctx.stanzaId, participant: ctx.participant, fromMe: false },
        message: { imageMessage: imgMsg },
      },
      'buffer',
      {},
      { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
    );
    await sock.updateProfilePicture(from, buffer);
    await sock.sendMessage(from, { text: card('✅ تم', ['صارت صورة القروب الجديدة.'], '', true) }, { quoted: m });
  } catch {
    await sock.sendMessage(from, { text: card('⚠️ فشل', ['تأكد إن البوت مشرف بالقروب.'], '', false) }, { quoted: m });
  }
}

async function handleCopyGroup(sock, m, from, isGroup) {
  if (!m.key.fromMe && !isElite(senderOf(sock, m, from))) return;
  if (!isGroup) return;
  try {
    const meta = await sock.groupMetadata(from);
    let picUrl = null;
    try {
      picUrl = await sock.profilePictureUrl(from, 'image');
    } catch {}
    copiedGroup = { subject: meta.subject, desc: meta.desc || '', picUrl };
    await sock.sendMessage(
      from,
      { text: card('📋 تم النسخ', ['اسم + وصف + صورة القروب محفوظين.', 'اكتب *لصق قروب* بأي قروب ثاني.'], '', true) },
      { quoted: m }
    );
  } catch {
    await sock.sendMessage(from, { text: card('⚠️ فشل النسخ', [], '', false) }, { quoted: m });
  }
}

async function handlePasteGroup(sock, m, from, isGroup) {
  if (!m.key.fromMe && !isElite(senderOf(sock, m, from))) return;
  if (!isGroup) return;
  if (!copiedGroup) {
    await sock.sendMessage(
      from,
      { text: card('⚠️ لصق قروب', ['ما في شي منسوخ، اكتب *نسخ قروب* بالقروب المصدر أول.'], '', false) },
      { quoted: m }
    );
    return;
  }
  try {
    await sock.groupUpdateSubject(from, copiedGroup.subject);
    await sock.groupUpdateDescription(from, copiedGroup.desc);
    if (copiedGroup.picUrl) {
      const res = await fetch(copiedGroup.picUrl);
      const buf = Buffer.from(await res.arrayBuffer());
      await sock.updateProfilePicture(from, buf);
    }
    await sock.sendMessage(from, { text: card('✅ تم اللصق', ['اسم + وصف + صورة القروب اتحدّثوا.'], '', true) }, { quoted: m });
  } catch {
    await sock.sendMessage(from, { text: card('⚠️ فشل اللصق', ['تأكد إن البوت مشرف بهالقروب.'], '', false) }, { quoted: m });
  }
}

async function handleId(sock, m, from, isGroup, mentioned, ctx) {
  if (!m.key.fromMe && !isElite(senderOf(sock, m, from))) return;
  const target = pickTarget(from, isGroup, mentioned, ctx);
  if (!target) {
    await sock.sendMessage(from, { text: card('⚠️ id', ['منشن شخص أو رد على رسالته.'], '', false) }, { quoted: m });
    return;
  }
  await sock.sendMessage(
    from,
    { text: card('🆔 الآيدي', ['`' + target + '`'], '', false), mentions: [target] },
    { quoted: m }
  );
}

// ================= معالجة الرسائل =================
async function handle(sock, m) {
  if (!m.message) return;
  const from = m.key.remoteJid;
  const isGroup = from.endsWith('@g.us');

  // ما يرد بالخاص إلا على صاحب الرقم أو فئة V
  if (!isGroup && !m.key.fromMe && !isElite(jidNormalizedUser(from))) return;

  const msg =
    m.message.ephemeralMessage?.message ||
    m.message.viewOnceMessage?.message ||
    m.message;

  // تفاعلات (للمسابقة)
  if (msg.reactionMessage) {
    if (isGroup) handleEmojiReaction(m, from, msg.reactionMessage);
    return;
  }

  // اختيار من قائمة الأزرار
  const nf = msg.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (nf) {
    let id = '';
    try {
      id = JSON.parse(nf.paramsJson || '{}').id || '';
    } catch {}
    if (id === 'sec_games') {
      await sendGamesMenu(sock, from, m);
    } else if (id === 'sec_v') {
      const allowed = m.key.fromMe || isElite(senderOf(sock, m, from));
      await sock.sendMessage(
        from,
        { text: allowed ? PAGES.sec_v : card('🚫 هذا القسم خاص', ['بس أعضاء فئة V 🍷 يقدروا يشوفوا هالقسم.'], '', false) },
        { quoted: m }
      );
    } else if (PAGES[id]) {
      await sock.sendMessage(from, { text: PAGES[id] }, { quoted: m });
    }
    return;
  }

  const text =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    '';
  const ctx = Object.values(msg).find(
    (v) => v && typeof v === 'object' && v.contextInfo
  )?.contextInfo;
  const mentioned = ctx?.mentionedJid || [];

  // متابعة دور اللاعب أثناء لعبة القنبلة
  const g = games.get(from);
  if (g && g.turn && m.key.participant) {
    const sender = g.norm(m.key.participant);
    if (sender === g.turn.holder) {
      const t = mentioned
        .map(g.norm)
        .find((j) => j !== sender && g.alive.has(j));
      if (t) g.turn.target = t;
    }
  }

  const clean = text.trim().toLowerCase().replace(/^[.!]\s*/, '');

  // القائمة: لست❤️‍🩹 (متاحة لأي شخص)
  const flat = clean.replace(/[\uFE0F\u200D\u2764\u{1FA79}]/gu, '').trim();
  if (flat === 'لست') {
    await sendMenuButtons(sock, from, m);
    return;
  }
  if (flat === 'لست نص') {
    await sock.sendMessage(from, { text: textMenu() }, { quoted: m });
    return;
  }

  // فتح صورة/فيديو مرة واحدة
  if (clean === 'فتح') {
    await handleOpen(sock, m, from, ctx);
    return;
  }

  // أوامر فئة V
  if (clean === 'ارفع نخبة') {
    await handleEliteAdd(sock, m, from, isGroup, mentioned, ctx);
    return;
  }
  if (clean === 'سرقة') {
    await handleSteal(sock, m, from, isGroup, mentioned, ctx);
    return;
  }
  if (clean === 'بروفايل') {
    await handleSetGroupPic(sock, m, from, isGroup, ctx);
    return;
  }
  if (clean === 'نسخ قروب') {
    await handleCopyGroup(sock, m, from, isGroup);
    return;
  }
  if (clean === 'لصق قروب') {
    await handlePasteGroup(sock, m, from, isGroup);
    return;
  }
  if (clean === 'id') {
    await handleId(sock, m, from, isGroup, mentioned, ctx);
    return;
  }

  // بحث الصور: بحث صورة <اسم>
  const imgMatch = clean.match(/^(?:بحث|ابحث)\s+(?:صوره|صورة|صور)(?:\s+(.+))?$/);
  if (imgMatch) {
    await handleImageSearch(sock, m, from, imgMatch[1] || '');
    return;
  }

  // نظام النقاط
  if (isGroup && (clean === 'ترتيب' || clean === 'نقاطي' || clean === 'نقاط' || /^تصفير النقاط/.test(clean))) {
    await handlePoints(sock, m, from, clean, mentioned, ctx);
    return;
  }

  // مسابقة الايموجي
  if (isGroup && /^ايموجي(\s|$)/.test(clean)) {
    await handleEmojiCmd(sock, m, from, clean);
    return;
  }

  // بطولة sxo
  if (isGroup && (sxoGames.has(from) || /^sxo(\s|$)/.test(clean))) {
    const consumed = await handleSxo(sock, m, from, clean);
    if (consumed) return;
  }

  // XO تحدي عادي
  if (isGroup && (xoGames.has(from) || /^xo(\s|$)/.test(clean))) {
    const consumed = await handleXO(sock, m, from, clean, mentioned, ctx);
    if (consumed) return;
  }

  // رودو
  if (clean === 'رودو') {
    await sock.sendMessage(
      from,
      { text: '*موجود يحب🌹*\n\n> Rodo' },
      { quoted: m }
    );
    return;
  }

  // إيقاف لعبة القنبلة
  if (clean === 'stop' && g) {
    if (m.key.fromMe || !g.alive.has(g.norm(m.key.participant))) {
      g.stopped = true;
      await sock.sendMessage(from, { text: 'تم إيقاف اللعبة 🛑' });
    }
    return;
  }

  // بدء لعبة القنبلة
  if (clean === 'stg') {
    if (!isGroup) {
      await sock.sendMessage(from, { text: 'اللعبة للمجموعات فقط 💥' });
      return;
    }
    if (games.has(from)) {
      await sock.sendMessage(from, { text: 'في لعبة شغالة أصلاً 💣' });
      return;
    }
    if (emojiGames.has(from)) {
      await sock.sendMessage(from, { text: 'في مسابقة ايموجي شغالة، استنوا تخلص 🚩' });
      return;
    }

    const meta = await sock.groupMetadata(from);
    const norm = makeNorm(meta);
    const sender = norm(m.key.participant);
    const admins = new Set(
      meta.participants.filter((p) => p.admin).map((p) => p.id)
    );
    if (!m.key.fromMe && !admins.has(sender)) return;

    const botIds = [sock.user?.id, sock.user?.lid].filter(Boolean).map(norm);
    const players = meta.participants
      .filter((p) => !p.admin && !botIds.includes(p.id))
      .map((p) => p.id);

    if (players.length < 2) {
      await sock.sendMessage(from, {
        text: 'لازم يكون في لاعبين اثنين على الأقل (غير المشرفين) 🙁',
      });
      return;
    }

    const game = { alive: new Set(players), norm, turn: null, stopped: false };
    games.set(from, game);

    const setup = await sock.sendMessage(
      from,
      { text: '*جاري إعداد اللعبة...💥*\n~\n> Rodo' },
      { quoted: m }
    );
    await sleep(5000);
    try {
      await sock.sendMessage(from, {
        text: '*إكتمل الإعداد* ✅\n~\n\n> Rodo🌹',
        edit: setup.key,
      });
    } catch {}

    playGame(sock, from, game);
    return;
  }

  // الأوامر العادية
  if (!text.startsWith(PREFIX)) return;
  const [cmd, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);

  switch (cmd.toLowerCase()) {
    case 'ping':
      await sock.sendMessage(from, { text: 'pong 🏓' }, { quoted: m });
      break;
    case 'say':
      await sock.sendMessage(from, { text: args.join(' ') || 'اكتب شي بعد الأمر' });
      break;
  }
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('session');
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      const code = await sock.requestPairingCode(NUMBER);
      console.log('كود الاقتران:', code);
    }, 3000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') console.log('البوت شغال ✅');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) start();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        cacheViewOnce(m);
        await handle(sock, m);
      } catch (e) {
        console.log('error:', e);
      }
    }
  });
}

start();

process.on('unhandledRejection', (e) => console.log('unhandled:', e));
