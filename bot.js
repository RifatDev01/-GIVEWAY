require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const express = require('express');
const app = express();

// Satisfy Render's port requirement
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;

// Helper function to create progress bar
function createProgressBar(count, max) {
    const size = 10;
    const progress = Math.min(Math.floor((count / max) * size), size);
    const emptyProgress = size - progress;
    const progressText = '█'.repeat(progress);
    const emptyProgressText = '░'.repeat(emptyProgress);
    return `[${progressText}${emptyProgressText}] ${count}`;
}

// Helper function to check if user is in channel
async function checkSub(userId) {
    try {
        const member = await bot.telegram.getChatMember(CHANNEL_ID, userId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (e) {
        console.error("CheckSub API Error:", e.message);
        return false;
    }
}

// Generate leaderboard text
async function generateLeaderboardText() {
    // Show top 10 users who have at least 1 referral OR are participants
    const topUsers = db.getTopReferrers(10);
    if (topUsers.length === 0) return "এখনো কেউ অংশগ্রহণ করেনি!";

    const maxReferrals = Math.max(...topUsers.map(u => u.referral_count), 1);

    let text = "<b>🏆 রিয়েল-টাইম গিভঅ্যাওয়ে প্রগ্রেস 🏆</b>\n\n";
    text += "শীর্ষ ৩ জন উইনার আইডি (ID) পাবেন!\n\n";

    topUsers.forEach((user, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "👤";
        const username = user.username ? `@${user.username}` : `ইউজার ${user.telegram_id}`;
        text += `${medal} <b>${username}</b>\n`;
        text += `${createProgressBar(user.referral_count, maxReferrals)}\n\n`;
    });

    text += `\n<i>সর্বশেষ আপডেট: ${new Date().toLocaleTimeString()}</i>`;
    return text;
}

// Update the message in the channel
async function updateChannelPost() {
    try {
        const lastMessageId = db.getSetting('leaderboard_msg_id');
        const text = await generateLeaderboardText();

        if (lastMessageId) {
            try {
                await bot.telegram.deleteMessage(CHANNEL_ID, lastMessageId);
            } catch (err) { }
        }

        const botUsername = bot.botInfo ? bot.botInfo.username : 'Bot';
        const newMsg = await bot.telegram.sendMessage(CHANNEL_ID, text, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🎁 গিভঅ্যাওয়ে-তে অংশ নিন', `https://t.me/${botUsername}`)]
            ])
        });
        db.setSetting('leaderboard_msg_id', newMsg.message_id.toString());
    } catch (error) {
        console.error("Error updating channel post:", error);
    }
}

async function showStartMenu(ctx) {
    const userId = ctx.from.id;
    const user = db.getUser(userId);
    const isMember = await checkSub(userId);

    // If they joined the channel but referral wasn't claimed yet (e.g. they joined after starting)
    if (isMember && user && !user.referral_claimed && user.referred_by) {
        const referrer = db.claimReferral(userId);
        if (referrer) {
            try {
                await bot.telegram.sendMessage(referrer.telegram_id, `🎉 আপনার লিঙ্কে একজন নতুন সদস্য জয়েন করেছেন! আপনার মোট রেফারেল: ${referrer.referral_count}`);
                await updateChannelPost();
            } catch (e) { }
        }
    }

    if (!isMember) {
        let msg = "⚠️ <b>চ্যানেলে জয়েন করা বাধ্যতামূলক!</b> ⚠️\n\n";
        if (user && user.referred_by) {
            const referrer = db.getUser(user.referred_by);
            const referrerName = referrer ? (referrer.username ? `@${referrer.username}` : `ইউজার ${referrer.telegram_id}`) : "একজনের";
            msg += `আপনি <b>${referrerName}</b>-এর রেফারেল লিঙ্কে এসেছেন।\n\n`;
        }
        msg += "রেফারেল পয়েন্ট যোগ করতে এবং গিভঅ্যাওয়ে-তে অংশ নিতে নিচের চ্যানেলে জয়েন করুন।\n\n";
        msg += "<i>জয়েন করার পর এই বটের চ্যাটে ফিরে আসুন।</i>";

        return ctx.reply(msg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('📢 চ্যানেলে জয়েন করুন', process.env.CHANNEL_LINK)]
            ])
        });
    }

    if (!user.is_participant) {
        return ctx.reply("✅ আপনি চ্যানেলে জয়েন করেছেন\n\n",
            Markup.inlineKeyboard([
                [Markup.button.callback('🎁 গিভঅ্যাওয়ে-তে অংশ নিন', 'participate')]
            ])
        );
    }

    const refLink = `https://t.me/${ctx.botInfo.username}?start=ref${userId}`;
    ctx.reply(`অভিনন্দন! আপনি গিভঅ্যাওয়ে-তে অংশগ্রহণ করছেন। 🎉\n\nআপনার রেফারেল লিঙ্ক:\n${refLink}\n\nএটি বন্ধুদের শেয়ার করুন। প্রতি সফল রেফারেলের জন্য আপনি পয়েন্ট পাবেন!`,
        Markup.inlineKeyboard([
            [Markup.button.url('🏆 লিডারবোর্ড দেখুন', process.env.CHANNEL_LINK)]
        ])
    );
}

bot.start(async (ctx) => {
    if (db.getSetting('giveaway_status') === 'ended') {
        return ctx.reply("দুঃখিত, গিভঅ্যাওয়ে ইতিপূর্বে শেষ হয়ে গেছে। এখন আর নতুন করে অংশগ্রহণ করা সম্ভব নয়।");
    }

    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const startPayload = ctx.startPayload;

    let user = db.getUser(userId);
    if (!user) {
        let referredBy = null;
        if (startPayload && startPayload.startsWith('ref')) {
            referredBy = parseInt(startPayload.replace('ref', ''));
            if (referredBy === userId) referredBy = null;
        }
        db.createUser(userId, username, referredBy);
    }

    await showStartMenu(ctx);
});

// Auto-check when user joins or leaves the channel
bot.on('chat_member', async (ctx) => {
    const userId = ctx.chatMember.new_chat_member.user.id;
    const status = ctx.chatMember.new_chat_member.status;
    const oldStatus = ctx.chatMember.old_chat_member.status;

    console.log(`Chat member update: User ${userId} status changed from ${oldStatus} to ${status}`);

    // When someone joins
    if (['member', 'administrator', 'creator'].includes(status)) {
        const user = db.getUser(userId);
        if (user) {
            // Claim referral immediately upon join
            if (!user.referral_claimed && user.referred_by) {
                const referrer = db.claimReferral(userId);
                if (referrer) {
                    try {
                        await bot.telegram.sendMessage(referrer.telegram_id, `🎉 আপনার লিঙ্কে একজন নতুন সদস্য জয়েন করেছেন! আপনার মোট রেফারেল: ${referrer.referral_count}`);
                        await updateChannelPost();
                    } catch (e) { }
                }
            }

            if (!user.is_participant) {
                try {
                    await bot.telegram.sendMessage(userId, "✅ আমি দেখেছি আপনি আমাদের চ্যানেলে জয়েন করেছেন এবং রেফারেল সফল হয়েছে!\n\nএখন গিভঅ্যাওয়ে-তে অংশগ্রহণ নিশ্চিত করতে নিচের বাটনে ক্লিক করুন।",
                        Markup.inlineKeyboard([
                            [Markup.button.callback('🎁 গিভঅ্যাওয়ে-তে অংশ নিন', 'participate')]
                        ])
                    );
                } catch (e) { }
            }
        }
    }
    // When someone leaves
    else if (['left', 'kicked'].includes(status)) {
        const referrer = db.removeReferral(userId);
        if (referrer) {
            try {
                await bot.telegram.sendMessage(referrer.telegram_id, `⚠️ আপনার একজন রেফার করা ইউজার চ্যানেল থেকে লিভ নিয়েছেন। আপনার ১ পয়েন্ট মাইনাস করা হয়েছে। বর্তমান রেফারেল: ${referrer.referral_count}`);
                await updateChannelPost();
            } catch (e) { }
        }
    }
});

// Handle Participation
bot.action('participate', async (ctx) => {
    const userId = ctx.from.id;
    const isMember = await checkSub(userId);

    if (!isMember) {
        await ctx.answerCbQuery("⚠️ আগে চ্যানেলে জয়েন করুন!", { show_alert: true });
        return showStartMenu(ctx);
    }

    db.setParticipant(userId);
    await ctx.answerCbQuery("অভিনন্দন! আপনি গিভঅ্যাওয়ে-তে অংশ নিয়েছেন।");
    await ctx.deleteMessage();

    const refLink = `https://t.me/${ctx.botInfo.username}?start=ref${userId}`;
    await ctx.reply(`অভিনন্দন! আপনি গিভঅ্যাওয়ে-তে অংশগ্রহণ করছেন। 🎉\n\nআপনার রেফারেল লিঙ্ক:\n${refLink}\n\nএটি বন্ধুদের শেয়ার করুন। প্রতি সফল রেফারেলের জন্য আপনি পয়েন্ট পাবেন!`,
        Markup.inlineKeyboard([
            [Markup.button.url('🏆 লিডারবোর্ড দেখুন', process.env.CHANNEL_LINK)]
        ])
    );

    await updateChannelPost();
});

bot.command('status', async (ctx) => {
    const user = db.getUser(ctx.from.id);
    if (!user) return ctx.reply("আপনি এখনো অংশগ্রহণ করেননি। শুরু করতে /start লিখুন।");

    const topUsers = db.getTopReferrers(100);
    const rank = topUsers.findIndex(u => u.telegram_id === ctx.from.id) + 1;

    ctx.reply(`📊 <b>আপনার বর্তমান অবস্থা</b>\n\nমোট রেফারেল: ${user.referral_count}\nআপনার র‍্যাঙ্ক: ${rank > 0 ? rank : 'তালিকায় নেই'}\n\nউইনার হতে আরও রেফার করুন!`, { parse_mode: 'HTML' });
});

// Admin command to trigger initial post
bot.command('init', async (ctx) => {
    if (ctx.from.id.toString() === process.env.ADMIN_ID) {
        await updateChannelPost();
        ctx.reply("চ্যানেলে লিডারবোর্ড চালু করা হয়েছে!");
    } else {
        ctx.reply("আপনার এই কমান্ড ব্যবহারের অনুমতি নেই।");
    }
});

// Admin command to manually add referrals
bot.command('addrefer', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return ctx.reply("Unauthorized.");

    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        return ctx.reply("সঠিকভাবে লিখুন: /addrefer [User_ID] [Amount]\nউদাহরণ: /addrefer 12345678 10");
    }

    const userId = parseInt(args[1]);
    const amount = parseInt(args[2]);

    if (isNaN(userId) || isNaN(amount)) {
        return ctx.reply("ভুল আইডি বা সংখ্যা দিয়েছেন।");
    }

    const updatedUser = db.manualAddReferral(userId, amount);
    if (updatedUser) {
        ctx.reply(`সফল হয়েছে! ইউজার ${userId}-এর সাথে ${amount} রেফারেল যোগ করা হয়েছে। বর্তমানে তার মোট রেফারেল: ${updatedUser.referral_count}`);
        await updateChannelPost();
    } else {
        ctx.reply("ইউজার খুঁজে পাওয়া যায়নি! ইউজারকে অন্তত একবার বটের সাথে যোগাযোগ করতে হবে।");
    }
});

// Admin command to end giveaway
bot.command('end', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return ctx.reply("Unauthorized.");

    if (db.getSetting('giveaway_status') === 'ended') {
        return ctx.reply("গিভঅ্যাওয়ে ইতিপূর্বে শেষ করা হয়েছে।");
    }

    db.setSetting('giveaway_status', 'ended');
    const topUsers = db.getTopReferrers(3);

    let winnerText = "<b>🎊 গিভঅ্যাওয়ে শেষ হয়েছে! 🎊</b>\n\n";
    winnerText += "অভিনন্দন আমাদের বিজয়ী বন্ধুদের! চূড়ান্ত ফলাফল নিচে দেওয়া হলো:\n\n";

    if (topUsers.length === 0) {
        winnerText += "দুঃখিত, কোনো অংশগ্রহণকারী পাওয়া যায়নি।";
    } else {
        topUsers.forEach((user, index) => {
            const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
            const username = user.username ? `@${user.username}` : `ইউজার ${user.telegram_id}`;
            winnerText += `${medal} <b>${username}</b> — ${user.referral_count} রেফারেল\n`;
        });
    }

    winnerText += "\n\nবিজয়ী বন্ধুদের আইডির জন্য এডমিন নিজে আপনাদের সাথে যোগাযোগ করবেন। সাথে থাকার জন্য ধন্যবাদ! ❤️";

    // Delete last leaderboard and post final announcement
    const lastMsgId = db.getSetting('leaderboard_msg_id');
    if (lastMsgId) {
        try { await bot.telegram.deleteMessage(CHANNEL_ID, lastMsgId); } catch (e) { }
    }

    await bot.telegram.sendMessage(CHANNEL_ID, winnerText, { parse_mode: 'HTML' });
    ctx.reply("গিভঅ্যাওয়ে সফলভাবে শেষ করা হয়েছে এবং চ্যানেলে ফলাফল জানানো হয়েছে।");
});

bot.launch({
    allowedUpdates: ['message', 'callback_query', 'chat_member']
}).then(() => {
    console.log("Bot is running...");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
