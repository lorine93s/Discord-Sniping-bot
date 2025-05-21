const { Client, GatewayIntentBits } = require('discord.js');
const WebSocket = require('ws');
const { formatTokenAlert } = require('../utils/alerts');

class CoinTracker {
    constructor() {
        this.active = false;
        this.discordClient = new Client({ 
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
        });
        this.targetChannelId = process.env.PUMP_FUN_NEW_TOKEN_CHANNEL_ID; // Replace with your channel ID
        this.ws = null;
        this.seenTokens = new Set();
    }

    async start() {
        if (this.active) return;
        this.active = true;
        // Login Discord bot
        await this.discordClient.login(process.env.BOT_TOKEN);
        console.log('Discord bot logged in!');

        this.connect();
    }

    stop() {
        if (!this.active) return;
        this.active = false;
        if (this.ws) this.ws.close();
        this.discordClient.destroy(); // Logout bot
    }

    connect() {
        this.ws = new WebSocket('wss://pumpportal.fun/api/data');
        
        this.ws.on('open', () => {
            this.ws.send(JSON.stringify({ method: "subscribeNewToken" }));
        });

        this.ws.on('message', async (data) => {
            const token = JSON.parse(data.toString());
            if (this.seenTokens.has(token.mint)) return;

            this.seenTokens.add(token.mint);

            // Send alert to Discord channel
            const alert = await formatTokenAlert(token);
            const channel = await this.discordClient.channels.fetch(this.targetChannelId);
            if(alert) channel.send(alert);
        });

        this.ws.on('close', () => {
            if (this.active) setTimeout(() => this.connect(), 5000);
        });
    }
}

module.exports = CoinTracker;