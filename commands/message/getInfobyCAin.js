const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { PublicKey } = require('@solana/web3.js');


// Chain ID to icon mapping
const CHAIN_ICONS = {
  'ethereum': 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
  'solana': 'https://cryptologos.cc/logos/solana-sol-logo.png',
  'bsc': 'https://cryptologos.cc/logos/bnb-bnb-logo.png',
  // Add more chains as needed
};

module.exports = {
    name: 'getInfobyCAin',
    description: 'Fetches token info by contract address',
    type: 'message',
    triggers: [],
    async execute(message, client, trackers) {
        if (message.author.bot) return;
        
        const rawInput = message.content.trim();
        console.log(`before validation`);
        // Improved contract address validation
        if (!this.isValidContractAddress(rawInput)) return;
        console.log(`after validation`, rawInput);
        try {
            // Validate address format
            //const normalizedAddress = this.normalizeAddress(rawInput);
            try {
                new PublicKey(rawInput);
            } catch (err) {
                return message.reply("**ERROR:** Invalid contract address format");
            }
            
            // Fetch token data
            const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${rawInput}`);
            const tokenData = response.data;
            console.log(`tokendata--------------------`, tokenData);
            if (!tokenData.pairs || tokenData.pairs.length === 0) {
                return message.reply("**ERROR:** Token not found on supported exchanges");
            }
            
            const pair = tokenData.pairs[0];
            const baseToken = pair.baseToken;
            const quoteToken = pair.quoteToken;
            
            // Calculate time since launch
            const launchDate = pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : null;
            const timeDiff = launchDate ? Date.now() - launchDate.getTime() : null;
            const ageString = timeDiff ? this.formatTimeDifference(timeDiff) : 'Unknown';
            
            // Calculate FDV if not provided
            const fdv = pair.fdv ? pair.fdv : 
                       pair.priceUsd && pair.totalSupply ? pair.priceUsd * pair.totalSupply : 
                       'N/A';
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(this.getChainColor(pair.chainId))
                .setAuthor({
                    name: `${baseToken.name} (${baseToken.symbol})`,
                    iconURL: CHAIN_ICONS[pair.chainId] || CHAIN_ICONS.ethereum,
                    url: pair.url
                })
                .setDescription(`$${baseToken.symbol} | ${pair.dexId}`)
                .addFields(
                    // Token Info Section
                    {
                        name: '📊 Token Info',
                        value: [
                            `**Market Cap:** $${this.formatCompactNumber(fdv) || 'N/A'}`,
                            `**Liquidity:** $${this.formatCompactNumber(pair.liquidity?.usd) || 'N/A'}`,
                            `**Price:** $${pair.priceUsd || 'N/A'}`,
                            `**Age:** ${ageString}`
                        ].join('\n'),
                        inline: true
                    },
                    // Trading Activity
                    {
                        name: '🔄 Trading Activity',
                        value: [
                            `**24h Volume:** $${this.formatCompactNumber(pair.volume?.h24).toLocaleString() || 'N/A'}`,
                            `**1h  Volume:** $${this.formatCompactNumber(pair.volume?.h1).toLocaleString() || 'N/A'}`,
                            `**24h Trades(B/S):** ${pair.txns?.h24?.buys || 0}/${pair.txns?.h24?.sells || 0}`,
                            `**1h  Trades(B/S):** ${pair.txns?.h1?.buys || 0}/${pair.txns?.h1?.sells || 0}`
                        ].join('\n'),
                        inline: true
                    },
                    // Price Changes
                    {
                        name: '📈 Price Changes',
                        value: [
                            `**1h:** ${pair.priceChange?.h1 ? `${pair.priceChange.h1.toFixed(2)}%` : 'N/A'}`,
                            `**6h:** ${pair.priceChange?.h6 ? `${pair.priceChange.h6.toFixed(2)}%` : 'N/A'}`,
                            `**24h:** ${pair.priceChange?.h24 ? `${pair.priceChange.h24.toFixed(2)}%` : 'N/A'}`,
                        ].join('\n'),
                        inline: true
                    },
                    // Contract Info
                    {
                        name: '📝 Contract',
                        value: `\`${rawInput}\``,
                        inline: false
                    }
                )
                .setFooter({ 
                    text: 'Powered by Solbonobos ', 
                    iconURL: 'https://dexscreener.com/favicon.ico' 
                })
                .setTimestamp();
            
            // Create action row with buttons
            // const row = new ActionRowBuilder()
            //     .addComponents(
            //         new ButtonBuilder()
            //             .setCustomId('copy_contract')
            //             .setLabel('Copy Address')
            //             .setStyle(ButtonStyle.Secondary)
            //             .setEmoji('📋'),
            //         new ButtonBuilder()
            //             .setURL(pair.url)
            //             .setLabel('View on DexScreener')
            //             .setStyle(ButtonStyle.Link),
            //         ...this.getSocialButtons(baseToken)
            //     );


// First Row (Copy Address + DexScreener - 50% width each)
const row1 = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
            .setCustomId('copy_contract')
            .setLabel('Copy Address')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary), // Force 50% width (works with Link buttons too)
        
        new ButtonBuilder()
            .setURL(pair.url) // Replace with your DexScreener URL
            .setLabel('DexScreener')
            .setStyle(ButtonStyle.Link)
            .setEmoji('📊')
    );

// Second Row (Dextools + Solscan - 50% width each)
const row2 = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
            .setURL(`https://dextools.io/app/solana/pair-explorer/${rawInput}`) // Replace with Dextools URL
            .setLabel('Dextools')
            .setStyle(ButtonStyle.Link)
            .setEmoji('🔧'),
            
        new ButtonBuilder()
            .setURL(`https://solscan.io/token/${rawInput}`) // Replace with Solscan URL
            .setLabel('Solscan')
            .setStyle(ButtonStyle.Link)
            .setEmoji('🔍')
    );

            // Add social buttons if needed (optional)
            // const socialButtons = this.getSocialButtons(baseToken); 
            // const rows = [row1, row2, ...(socialButtons ? [socialButtons] : [])];
            // const rows = [row1, row2ons ? [socialButtons] : [])];

            
            await message.reply({ 
                embeds: [embed], 
                components: [row1,row2] 
            });
            
        } catch (err) {
            console.error(err);
            await message.reply("**ERROR:** Failed to fetch token data");
        }
    },

    formatCompactNumber(number) {
        if (number == null || isNaN(number)) return null;
        const num = parseFloat(number);
        if (num < 1000) return num.toFixed(2); // Show decimals for small numbers
        if (num >= 1000 && num < 1000000) return `${(num / 1000).toFixed(1)}k`; // Thousands (1k, 10k, etc.)
        if (num >= 1000000 && num < 1000000000) return `${(num / 1000000).toFixed(1)}M`; // Millions (1M, 10M)
        return `${(num / 1000000000).toFixed(1)}B`; // Billions (1B, 10B)
    },
    
    // Improved contract address validation
    isValidContractAddress(address) {
        // Trim whitespace
        const rawInput = address.trim();
        
        // Check for Solana-style addresses (32-44 base58 chars)
        const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        
        // Check for EVM addresses (0x + 40 hex chars)
        const evmRegex = /^0x[a-fA-F0-9]{40}$/;
        
        // Special case for "pump" and "moon" tokens
        const memeRegex = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})(pump|moon)$/i;
        
        return (
            solanaRegex.test(rawInput) || 
            evmRegex.test(rawInput) || 
            memeRegex.test(rawInput)
        );
    },
    
    // Normalize address by removing pump/moon suffixes
    // normalizeAddress(address) {
    //     return address.trim().replace(/pump|moon/gi, '');
    // },
    
    // Helper function to format time difference
    formatTimeDifference(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);
        
        if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
        if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    },
    
    // Helper function to get chain-specific color
    getChainColor(chainId) {
        const colors = {
            'ethereum': 0x627EEA,
            'solana': 0x00FFA3,
            'bsc': 0xF0B90B,
            'arbitrum': 0x28A0F0,
            'polygon': 0x8247E5
        };
        return colors[chainId] || 0x00FF00;
    },
    
    // Helper function to create social media buttons
    getSocialButtons(token) {
        const buttons = [];
        if (token.links?.website) {
            buttons.push(
                new ButtonBuilder()
                    .setURL(this.ensureHttp(token.links.website))
                    .setLabel('Website')
                    .setStyle(ButtonStyle.Link)
            );
        }
        if (token.links?.twitter) {
            buttons.push(
                new ButtonBuilder()
                    .setURL(`https://twitter.com/${token.links.twitter}`)
                    .setLabel('Twitter')
                    .setStyle(ButtonStyle.Link)
            );
        }
        if (token.links?.telegram) {
            buttons.push(
                new ButtonBuilder()
                    .setURL(`https://t.me/${token.links.telegram}`)
                    .setLabel('Telegram')
                    .setStyle(ButtonStyle.Link)
            );
        }
        return buttons;
    },
    
    ensureHttp(url) {
        return url.startsWith('http') ? url : `https://${url}`;
    }
};