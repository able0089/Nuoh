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

async function lockChannel(channel, type, targetUserId = null) {
    try {
        if (!channel.isTextBased() || channel.isDMBased()) return;

        const currentPerms = channel.permissionOverwrites.cache.get(TARGET_USER_ID);
        if (currentPerms && currentPerms.deny.has(PermissionsBitField.Flags.SendMessages)) return;

        await channel.permissionOverwrites.edit(TARGET_USER_ID, { SendMessages: false });

        let title = 'Spawn Detected';
        if (type === 'rare') title = 'Rare Spawn Detected';
        else if (type === 'regional') title = 'Regional Spawn Detected';
        else if (type === 'shiny') title = 'Shiny Hunt Detected';

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription('Please use >unlock @Pokétwo to unlock the spawn (:')
            .setImage('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUybHFjZnM2a3M2ODgwcDkzN3E5enE4OXJxOXA2MHYwZmIzY3VyZHE2MyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/hadn3KRK7J20hMoC5u/giphy.gif')
            .setFooter({ text: 'click the 🔓 below to unlock' })
            .setColor(0x00FFFF);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`unlock_spawn_${targetUserId || 'any'}`)
                    .setLabel('Unlock')
                    .setEmoji('🔓')
                    .setStyle(ButtonStyle.Primary),
            );

        await channel.send({ embeds: [embed], components: [row] });
    } catch (error) {
        console.error('Error locking channel:', error);
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.id === client.user.id) return;

    const botMention = `<@${client.user.id}>`;
    const botMentionNick = `<@!${client.user.id}>`;
    const isMentioned = message.content.startsWith(botMention) || message.content.startsWith(botMentionNick);

    if (isMentioned) {
        const commandBody = message.content.slice(isMentioned ? (message.content.startsWith(botMention) ? botMention.length : botMentionNick.length) : 0).trim();
        
        // Help command
        if (commandBody.toLowerCase() === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setTitle('Bot Commands Help')
                .setDescription('List of available commands for admins and owner:')
                .addFields(
                    { name: '@bot monitor #channels', value: 'Start monitoring spawns in these channels.' },
                    { name: '@bot ignore #channels', value: 'Stop monitoring spawns in these channels.' },
                    { name: '@bot setbotoffline', value: 'Stop the bot from automatically locking spawns (Owner only).' },
                    { name: '@bot setbotonline', value: 'Resume automatic spawn locking (Owner only).' },
                    { name: '@bot lock channel | Rare ping', value: 'Manually trigger a Rare lock.' },
                    { name: '@bot lock channel | Regional Spawn', value: 'Manually trigger a Regional lock.' },
                    { name: '@bot lock channel | shinyhunt @user', value: 'Manually trigger a Shiny Hunt lock.' }
                )
                .setColor(0x00FFFF);
            return message.reply({ embeds: [helpEmbed] });
        }

        // Offline/Online commands
        if (commandBody.toLowerCase() === 'setbotoffline') {
            if (message.author.id !== OWNER_ID) return;
            isBotOffline = true;
            return message.reply('Bot is now **OFFLINE**. Automatic locking is disabled.');
        }
        if (commandBody.toLowerCase() === 'setbotonline') {
            if (message.author.id !== OWNER_ID) return;
            isBotOffline = false;
            return message.reply('Bot is now **ONLINE**. Automatic locking is enabled.');
        }

        // Monitor/Ignore commands
        if (commandBody.toLowerCase().startsWith('monitor')) {
            if (!isAuthorized(message)) return;
            const mentions = message.mentions.channels;
            if (mentions.size === 0) return message.reply('Please mention at least one channel.');
            mentions.forEach(channel => ignoredChannels.delete(channel.id));
            return message.reply(`Now monitoring: ${mentions.map(c => `<#${c.id}>`).join(', ')}`);
        }
        if (commandBody.toLowerCase().startsWith('ignore')) {
            if (!isAuthorized(message)) return;
            const mentions = message.mentions.channels;
            if (mentions.size === 0) return message.reply('Please mention at least one channel.');
            mentions.forEach(channel => ignoredChannels.add(channel.id));
            return message.reply(`Now ignoring: ${mentions.map(c => `<#${c.id}>`).join(', ')}`);
        }

        // Manual lock command
        if (commandBody.toLowerCase().startsWith('lock channel')) {
            if (!isAuthorized(message)) return;
            const parts = commandBody.split('|').map(p => p.trim());
            if (parts.length < 2) return message.reply('Usage: @bot lock channel | [Rare ping / Regional Spawn / shinyhunt @user]');
            
            const typeStr = parts[1].toLowerCase();
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

    // Automatic detection - ONLY for bots
    if (!isBotOffline && message.author.bot && !ignoredChannels.has(message.channel.id)) {
        if (message.content.includes('Rare ping:')) {
            await lockChannel(message.channel, 'rare');
        } else if (message.content.includes('Regional ping:')) {
            await lockChannel(message.channel, 'regional');
        } else if (message.content.includes('Shiny hunt pings:')) {
            const mention = message.mentions.users.first();
            await lockChannel(message.channel, 'shiny', mention?.id);
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
            return interaction.reply({ content: 'You are not authorized to unlock this spawn.', ephemeral: true });
        }

        try {
            const channel = interaction.channel;
            await channel.permissionOverwrites.edit(TARGET_USER_ID, { SendMessages: null });
            
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    ButtonBuilder.from(interaction.message.components[0].components[0])
                        .setDisabled(true)
                );

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
    console.log("No DISCORD_TOKEN provided. Please set the DISCORD_TOKEN environment variable.");
}
