require('dotenv').config();
const WebSocket = require('ws');
const { TextChannel } = require('discord.js');
const axios = require('axios');

class CoinTracker {
    constructor(client, channelName) {
        this.client = client;
        this.channelName = channelName;
        this.ws = null;
        this.seenTokens = new Set();
    }

    start() {
        this.ws = new WebSocket('wss://pumpportal.fun/api/data');

        this.ws.on('open', () => {
            console.log('Connected to Pump.fun WebSocket');
            this.ws.send(JSON.stringify({ method: "subscribeNewToken" }));
        });

        this.ws.on('message', async (data) => {
            try {
                const tokenData = JSON.parse(data.toString());

                if (this.seenTokens.has(tokenData.mint)) return;
                this.seenTokens.add(tokenData.mint);

                console.log(`New token detected: ${tokenData.name} (${tokenData.symbol})`);

                const metadata
::contentReference[oaicite:0]{index=0}
 
