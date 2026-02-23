import { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 5000;

let ignoredChannels = new Set();

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
const TRIGGER_WORDS = ['Rare ping:', 'Regional ping:', 'Shiny hunt pings:'];
const OWNER_ID = '1396815034247806999';
const ADMIN_ROLE_ID = '1458127515280343173';

function isAuthorized(message) {
    if (message.author.id === OWNER_ID) return true;
    if (message.member && message.member.roles.cache.has(ADMIN_ROLE_ID)) return true;
    return false;
}

client.on('messageCreate', async (message) => {
    if (message.author.bot && message.author.id === client.user.id) return;

    if (message.content.startsWith('d!ignorechannels')) {
        if (!isAuthorized(message)) return;
        const mentions = message.mentions.channels;
        if (mentions.size === 0) return message.reply('Please mention at least one channel.');
        mentions.forEach(channel => ignoredChannels.add(channel.id));
        return message.reply(`Now ignoring: ${mentions.map(c => `<#${c.id}>`).join(', ')}`);
    }

    if (message.content.startsWith('d!addchannels')) {
        if (!isAuthorized(message)) return;
        const mentions = message.mentions.channels;
        if (mentions.size === 0) return message.reply('Please mention at least one channel.');
        mentions.forEach(channel => ignoredChannels.delete(channel.id));
        return message.reply(`Now monitoring: ${mentions.map(c => `<#${c.id}>`).join(', ')}`);
    }

    if (ignoredChannels.has(message.channel.id)) return;

    const isTriggered = TRIGGER_WORDS.some(word => message.content.includes(word));
    
    if (isTriggered) {
        try {
            const channel = message.channel;
            if (!channel.isTextBased() || channel.isDMBased()) return;

            const currentPerms = channel.permissionOverwrites.cache.get(TARGET_USER_ID);
            if (currentPerms && currentPerms.deny.has(PermissionsBitField.Flags.SendMessages)) return;

            await channel.permissionOverwrites.edit(TARGET_USER_ID, { SendMessages: false });

            // Detect if it's a shiny hunt ping and get the mentioned user
            let restrictedUserId = null;
            if (message.content.includes('Shiny hunt pings:')) {
                const mention = message.mentions.users.first();
                if (mention) restrictedUserId = mention.id;
            }

            const embed = new EmbedBuilder()
                .setTitle('The spawn has been locked 🔒')
                .setDescription('Please use >unlock @Pokétwo to unlock the spawn (:')
                .setImage('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUybHFjZnM2a3M2ODgwcDkzN3E5enE4OXJxOXA2MHYwZmIzY3VyZHE2MyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/hadn3KRK7J20hMoC5u/giphy.gif')
                .setFooter({ text: 'click the 🔓 below to unlock' })
                .setColor(0x00FFFF);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`unlock_spawn_${restrictedUserId || 'any'}`)
                        .setLabel('Unlock')
                        .setEmoji('🔓')
                        .setStyle(ButtonStyle.Primary),
                );

            await channel.send({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error locking spawn:', error);
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
            
            // Disable the button after click
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    ButtonBuilder.from(interaction.message.components[0].components[0])
                        .setDisabled(true)
                );

            await interaction.update({ components: [disabledRow] });
            await channel.send(`The spawn has been unlocked by <@${interaction.user.id}>`);
        } catch (error) {
            console.error('Error unlocking spawn:', error);
            await interaction.reply({ content: 'Failed to unlock the spawn. Check permissions.', ephemeral: true });
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
