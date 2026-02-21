import { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } from 'discord.js';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running');
});

app.listen(PORT, () => {
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
    // Check if the message contains any of the trigger words
    const isTriggered = TRIGGER_WORDS.some(word => message.content.includes(word));
    
    if (isTriggered) {
        try {
            const channel = message.channel;
            
            // Ensure channel supports permission overwrites
            if (!channel.isTextBased() || channel.isDMBased()) return;

            // Fetch current permissions for the target user in this channel
            const currentPerms = channel.permissionOverwrites.cache.get(TARGET_USER_ID);
            
            // Check if the user is already denied SendMessages
            if (currentPerms && currentPerms.deny.has(PermissionsBitField.Flags.SendMessages)) {
                return; // Already locked
            }

            // Edit channel permissions to disable SendMessages for the target user only
            await channel.permissionOverwrites.edit(TARGET_USER_ID, {
                SendMessages: false
            });

            // Create and send the embed
            const embed = new EmbedBuilder()
                .setTitle('🔒 Spawn Locked')
                .setDescription('This spawn has been locked.\nUse >unlock with Dooh to unlock.')
                .setColor(0xFF0000); // Red

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
