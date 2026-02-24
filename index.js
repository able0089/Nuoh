import { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 5000;

let ignoredChannels = new Set();
let isBotOffline = false;

app.get('/', (req, res) => {
    res.send('Bot is running');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const TARGET_USER_ID = '716390085896962058';
const OWNER_ID = '1396815034247806999';
const ADMIN_ROLE_ID = '1458127515280343173';

function isAuthorized(message) {
    if (message.author.id === OWNER_ID) return true;
    if (message.member && message.member.roles.cache.has(ADMIN_ROLE_ID)) return true;
    return false;
}

// Helper to parse time strings like 10s, 5m, 1h, 1d
function parseTime(timeStr) {
    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    const multiplier = {
        's': 1000,
        'm': 60000,
        'h': 3600000,
        'd': 86400000
    };
    return value * multiplier[unit];
}

async function lockChannel(channel, type, pingedUserId = null) {
    try {
        if (!channel.isTextBased() || channel.isDMBased()) return;

        const currentPerms = channel.permissionOverwrites.cache.get(TARGET_USER_ID);
        if (currentPerms && currentPerms.deny.has(PermissionsBitField.Flags.SendMessages)) return;

        await channel.permissionOverwrites.edit(TARGET_USER_ID, { SendMessages: false });

        let title = 'Spawn Detected';
        let description = '';
        if (type === 'shiny') {
            title = 'Shiny Hunt Detected';
            description = `Only pinged hunters can unlock\n<@${pingedUserId}>`;
        } else if (type === 'rare') {
            title = 'Rare Spawn Detected';
            description = 'The one who unlocks gets to catch';
        } else if (type === 'regional') {
            title = 'Regional Spawn Detected';
            description = 'The one who unlocks gets to catch';
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setImage('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUybHFjZnM2a3M2ODgwcDkzN3E5enE4OXJxOXA2MHYwZmIzY3VyZHE2MyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/hadn3KRK7J20hMoC5u/giphy.gif')
            .setFooter({ text: 'click the 🔓 below to unlock' })
            .setColor(0x00FFFF);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`unlock_spawn_${pingedUserId || 'any'}`)
                    .setLabel('Unlock')
                    .setEmoji('🔓')
                    .setStyle(ButtonStyle.Primary),
            );

        const lockMessage = await channel.send({ embeds: [embed], components: [row] });

        // Auto-unlock after 12 hours
        setTimeout(async () => {
            try {
                const fetchedMsg = await channel.messages.fetch(lockMessage.id).catch(() => null);
                if (fetchedMsg && fetchedMsg.components.length > 0 && !fetchedMsg.components[0].components[0].disabled) {
                    await channel.permissionOverwrites.edit(TARGET_USER_ID, { SendMessages: null });
                    const disabledRow = new ActionRowBuilder()
                        .addComponents(ButtonBuilder.from(fetchedMsg.components[0].components[0]).setDisabled(true));
                    await fetchedMsg.edit({ components: [disabledRow] });
                    await channel.send('The spawn has been automatically unlocked after 12 hours.');
                }
            } catch (err) {
                console.error('Auto-unlock error:', err);
            }
        }, 12 * 3600000);

        // Reminder for shiny hunt after 11 hours
        if (type === 'shiny' && pingedUserId) {
            setTimeout(async () => {
                try {
                    const fetchedMsg = await channel.messages.fetch(lockMessage.id).catch(() => null);
                    if (fetchedMsg && fetchedMsg.components.length > 0 && !fetchedMsg.components[0].components[0].disabled) {
                        await channel.send(`reminder <@${pingedUserId}>`);
                    }
                } catch (err) {
                    console.error('Shiny reminder error:', err);
                }
            }, 11 * 3600000);
        }

    } catch (error) {
        console.error('Error locking channel:', error);
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.id === client.user.id) return;

    const botMention = `<@${client.user.id}>`;
    const botMentionNick = `<@!${client.user.id}>`;
    const startsWithMention = message.content.startsWith(botMention) || message.content.startsWith(botMentionNick);

    if (startsWithMention) {
        const mentionLength = message.content.startsWith(botMention) ? botMention.length : botMentionNick.length;
        const commandBody = message.content.slice(mentionLength).trim();
        const args = commandBody.split(/\s+/);
        const command = args[0].toLowerCase();

        if (command === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setTitle('Bot Commands Help')
                .setDescription('List of available commands (mention the bot to use):')
                .addFields(
                    { name: 'monitor #channels', value: 'Start monitoring spawns in these channels.' },
                    { name: 'ignore #channels', value: 'Stop monitoring spawns in these channels.' },
                    { name: 'setbotoffline', value: 'Stop automatic locking (Owner only).' },
                    { name: 'setbotonline', value: 'Resume automatic locking (Owner only).' },
                    { name: 'lock channel | Rare ping', value: 'Manually trigger a Rare lock.' },
                    { name: 'lock channel | Regional Spawn', value: 'Manually trigger a Regional lock.' },
                    { name: 'lock channel | shinyhunt @user', value: 'Manually trigger a Shiny Hunt lock.' },
                    { name: 'remind <time> <reason>', value: 'Set a reminder (e.g., 10s, 5m, 1h).' }
                )
                .setColor(0x00FFFF);
            return message.reply({ embeds: [helpEmbed] });
        }

        if (command === 'remind') {
            const timeStr = args[1];
            const reason = args.slice(2).join(' ');
            if (!timeStr || !reason) return message.reply('Usage: @bot remind <time> <reason> (e.g., 10s, 5m)');
            const ms = parseTime(timeStr);
            if (!ms) return message.reply('Invalid time format. Use 10s, 5m, 1h, etc.');
            
            message.reply(`Got it! I will remind you about "${reason}" in ${timeStr}.`);
            setTimeout(() => {
                message.reply(`<@${message.author.id}> reminder from ${timeStr} ago reason: ${reason}`);
            }, ms);
            return;
        }

        if (command === 'setbotoffline') {
            if (message.author.id !== OWNER_ID) return;
            isBotOffline = true;
            return message.reply('Bot is now **OFFLINE**.');
        }
        if (command === 'setbotonline') {
            if (message.author.id !== OWNER_ID) return;
            isBotOffline = false;
            return message.reply('Bot is now **ONLINE**.');
        }

        if (command === 'monitor') {
            if (!isAuthorized(message)) return;
            const mentions = message.mentions.channels;
            if (mentions.size === 0) return message.reply('Please mention at least one channel.');
            mentions.forEach(channel => ignoredChannels.delete(channel.id));
            return message.reply(`Now monitoring: ${mentions.map(c => `<#${c.id}>`).join(', ')}`);
        }
        if (command === 'ignore') {
            if (!isAuthorized(message)) return;
            const mentions = message.mentions.channels;
            if (mentions.size === 0) return message.reply('Please mention at least one channel.');
            mentions.forEach(channel => ignoredChannels.add(channel.id));
            return message.reply(`Now ignoring: ${mentions.map(c => `<#${c.id}>`).join(', ')}`);
        }

        if (commandBody.toLowerCase().startsWith('lock channel')) {
            if (!isAuthorized(message)) return;
            const parts = commandBody.split('|').map(p => p.trim());
            const typeStr = parts[1]?.toLowerCase() || '';
            if (typeStr.includes('rare')) {
                await lockChannel(message.channel, 'rare');
            } else if (typeStr.includes('regional')) {
                await lockChannel(message.channel, 'regional');
            } else if (typeStr.includes('shinyhunt')) {
                const mention = message.mentions.users.first();
                await lockChannel(message.channel, 'shiny', mention?.id);
            }
            return;
        }
    }

    if (!isBotOffline && message.author.bot && !ignoredChannels.has(message.channel.id)) {
        // Prioritize shiny hunt if both present
        if (message.content.includes('Shiny hunt pings:')) {
            const mention = message.mentions.users.first();
            await lockChannel(message.channel, 'shiny', mention?.id);
        } else if (message.content.includes('Rare ping:')) {
            await lockChannel(message.channel, 'rare');
        } else if (message.content.includes('Regional ping:')) {
            await lockChannel(message.channel, 'regional');
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('unlock_spawn_')) {
        const restrictedTo = interaction.customId.replace('unlock_spawn_', '');
        const isOwner = interaction.user.id === OWNER_ID;
        const isAdmin = interaction.member && interaction.member.roles.cache.has(ADMIN_ROLE_ID);
        const isTargetUser = restrictedTo === 'any' || interaction.user.id === restrictedTo;

        if (!isOwner && !isAdmin && !isTargetUser) {
            return interaction.reply({ content: 'Only pinged hunters can unlock', ephemeral: true });
        }

        try {
            const channel = interaction.channel;
            await channel.permissionOverwrites.edit(TARGET_USER_ID, { SendMessages: null });
            
            const disabledRow = new ActionRowBuilder()
                .addComponents(ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true));

            await interaction.update({ components: [disabledRow] });
            await channel.send(`The spawn has been unlocked by <@${interaction.user.id}>`);
        } catch (error) {
            console.error('Error unlocking spawn:', error);
            await interaction.reply({ content: 'Failed to unlock the spawn.', ephemeral: true });
        }
    }
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN).catch(console.error);
} else {
    console.log("No DISCORD_TOKEN provided.");
}
