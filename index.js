import { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } from 'discord.js';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 5000;

// simple in-memory storage for ignored channels
// In a production environment, you'd want to use a database
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

client.on('messageCreate', async (message) => {
    if (message.author.bot && message.author.id === client.user.id) return;

    // Command to ignore channels: d!ignorechannels #channel1 #channel2
    if (message.content.startsWith('d!ignorechannels')) {
        const mentions = message.mentions.channels;
        if (mentions.size === 0) return message.reply('Please mention at least one channel.');
        
        mentions.forEach(channel => ignoredChannels.add(channel.id));
        return message.reply(`Now ignoring: ${mentions.map(c => `<#${c.id}>`).join(', ')}`);
    }

    // Command to add channels back: d!addchannels #channel1 #channel2
    if (message.content.startsWith('d!addchannels')) {
        const mentions = message.mentions.channels;
        if (mentions.size === 0) return message.reply('Please mention at least one channel.');
        
        mentions.forEach(channel => ignoredChannels.delete(channel.id));
        return message.reply(`Now monitoring: ${mentions.map(c => `<#${c.id}>`).join(', ')}`);
    }

    // Don't trigger if the channel is ignored
    if (ignoredChannels.has(message.channel.id)) return;

    // Check if the message contains any of the trigger words
    const isTriggered = TRIGGER_WORDS.some(word => message.content.includes(word));
    
    if (isTriggered) {
        try {
            const channel = message.channel;
            
            if (!channel.isTextBased() || channel.isDMBased()) return;

            const currentPerms = channel.permissionOverwrites.cache.get(TARGET_USER_ID);
            
            if (currentPerms && currentPerms.deny.has(PermissionsBitField.Flags.SendMessages)) {
                return; 
            }

            await channel.permissionOverwrites.edit(TARGET_USER_ID, {
                SendMessages: false
            });

            const embed = new EmbedBuilder()
                .setTitle('The spawn has been locked 🔒')
                .setDescription('Please use >unlock @Pokétwo to unlock the spawn (:')
                .setImage('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUybHFjZnM2a3M2ODgwcDkzN3E5enE4OXJxOXA2MHYwZmIzY3VyZHE2MyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/hadn3KRK7J20hMoC5u/giphy.gif')
                .setFooter({ text: 'Iam sure Dooh will help you with unlocking (:' })
                .setColor(0x00FFFF); // Cyan Blue

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error locking spawn:', error);
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
