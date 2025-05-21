const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const https = require('https');

// Chain ID to icon mapping
const CHAIN_ICONS = {
  'ethereum': 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
  'solana': 'https://cryptologos.cc/logos/solana-sol-logo.png',
  'binance-smart-chain': 'https://cryptologos.cc/logos/bnb-bnb-logo.png',
  'polygon': 'https://cryptologos.cc/logos/polygon-matic-logo.png',
  'arbitrum': 'https://cryptologos.cc/logos/arbitrum-arb-logo.png',
  'avalanche': 'https://cryptologos.cc/logos/avalanche-avax-logo.png'
};

// Create an agent with modern TLS settings
const httpsAgent = new https.Agent({
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    rejectUnauthorized: true
});

module.exports = {
    name: 'getTokenInfo',
    description: 'Fetches token info by name from CoinGecko',
    type: 'prefix',
    triggers: ['!token', '!coin'],
    async execute(message, client, trackers) {
        if (message.author.bot) return;
        
        const rawInput = message.content.trim();
        const args = rawInput.split(' ');
        const command = args.shift().toLowerCase();
        
        // Check if the message starts with our trigger
        if (!this.triggers.includes(command)) return;
        
        const tokenName = args.join(' ').trim();
        if (!tokenName) {
            return message.reply("Please provide a token name (e.g., `!token solana` or `!coin bitcoin`)");
        }

        try {
            // Step 1: Search for the token on CoinGecko
            const searchResponse = await axios.get(
                `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(tokenName)}`,
                { httpsAgent }
            );
            
            if (!searchResponse.data.coins || searchResponse.data.coins.length === 0) {
                return message.reply("No tokens found with that name.");
            }
            
            // Get the first result (most relevant)
            const coinId = searchResponse.data.coins[0].id;
            
            // Step 2: Get detailed token info
            const detailResponse = await axios.get(
                `https://api.coingecko.com/api/v3/coins/${coinId}`,
                { httpsAgent }
            );
            
            const tokenData = detailResponse.data;
            
            // Format market data
            const marketData = tokenData.market_data || {};
            const currentPrice = marketData.current_price?.usd || 0;
            const marketCap = marketData.market_cap?.usd || 0;
            const volume = marketData.total_volume?.usd || 0;
            const priceChange24h = marketData.price_change_percentage_24h || 0;
            const priceChangeColor = priceChange24h >= 0 ? '#00FF00' : '#FF0000';
            
            // Get platform/chain info
            const platform = tokenData.platforms ? Object.keys(tokenData.platforms)[0] : null;
            const chainName = platform ? platform.split('-').join(' ').toUpperCase() : 'N/A';
            const chainIcon = CHAIN_ICONS[platform] || CHAIN_ICONS.ethereum;
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setAuthor({
                    name: `${tokenData.name} (${tokenData.symbol.toUpperCase()})`,
                    iconURL: chainIcon,
                    url: tokenData.links?.homepage?.[0] || `https://www.coingecko.com/en/coins/${coinId}`
                })
                .setThumbnail(tokenData.image?.large || tokenData.image?.small || tokenData.image?.thumb)
                .setDescription(tokenData.description?.en ? 
                    tokenData.description.en.substring(0, 200) + '...' : 
                    'No description available')
                .addFields(
                    {
                        name: '📊 Market Data',
                        value: [
                            `**💰 Market Cap:** $${this.formatCompactNumber(marketCap)}`,
                            `**💲 Price:** $${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`,
                            `**📈 24h Change:** ${priceChange24h.toFixed(2)}%`,
                            `**💧 24h Volume:** $${this.formatCompactNumber(volume)}`,
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: '🔗 Chain Info',
                        value: [
                            `**⛓️ Chain:** ${chainName}`,
                            `**🪙 Rank:** #${tokenData.market_cap_rank || 'N/A'}`,
                            `**🔄 Circulating Supply:** ${this.formatCompactNumber(marketData.circulating_supply || 0)} ${tokenData.symbol.toUpperCase()}`,
                            `**💰 Fully Diluted Valuation:** $${this.formatCompactNumber(marketData.fully_diluted_valuation?.usd || 0)}`,
                        ].join('\n'),
                        inline: true
                    }
                )
                .setFooter({ 
                    text: 'Data provided by CoinGecko', 
                    iconURL: 'https://static.coingecko.com/s/thumbnail-007177f3eca19695592f0b8b0eabbdae282b54154e1be912285c9034ea6cbaf2.png'
                })
                .setTimestamp();
            
            // Create action rows with buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setURL(`https://www.coingecko.com/en/coins/${coinId}`)
                        .setLabel('CoinGecko')
                        .setStyle(ButtonStyle.Link),
                    new ButtonBuilder()
                        .setURL(`https://www.coingecko.com/en/coins/${coinId}/historical_data#panel`)
                        .setLabel('Price Chart')
                        .setStyle(ButtonStyle.Link),
                    new ButtonBuilder()
                        .setURL(tokenData.links?.homepage?.[0] || `https://www.coingecko.com/en/coins/${coinId}`)
                        .setLabel('Website')
                        .setStyle(ButtonStyle.Link)
                );
                
            await message.reply({ 
                embeds: [embed], 
                components: [row] 
            });
            
        } catch (err) {
            console.error(err);
            await message.reply("**ERROR:** Failed to fetch token data from CoinGecko");
        }
    },

    formatCompactNumber(number) {
        if (number == null || isNaN(number)) return 'N/A';
        const num = parseFloat(number);
        if (num < 1000) return num.toLocaleString('en-US');
        if (num >= 1000 && num < 1000000) return `${(num / 1000).toFixed(1)}k`;
        if (num >= 1000000 && num < 1000000000) return `${(num / 1000000).toFixed(1)}M`;
        return `${(num / 1000000000).toFixed(1)}B`;
    }
};