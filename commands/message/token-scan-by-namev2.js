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

// Helper function to validate URLs
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

// Helper function to clean URLs
function cleanUrl(url) {
    if (!url) return null;
    try {
        const decoded = decodeURIComponent(url);
        return isValidUrl(decoded) ? decoded : null;
    } catch {
        return null;
    }
}

module.exports = {
    name: 'getTokenInfoByDollar',
    description: 'Fetches token info when message starts with $',
    type: 'message',
    triggers: ['$'],
    async execute(message, client, trackers) {
        if (message.author.bot) return;
        
        const rawInput = message.content.trim();
        
        // Check if message starts with $ and has content after it
        if (!rawInput.startsWith('$') || rawInput.length < 2) return;
        
        const tokenName = rawInput.slice(1).trim(); // Remove the $ and trim whitespace
        if (!tokenName) {
            return message.reply("Please provide a token name after the $ (e.g., `$SOL` or `$BTC`)");
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
            
            // Limit to top 5 results
            const topResults = searchResponse.data.coins.slice(0, 5);
            
            // Create embed with search results
            const searchEmbed = new EmbedBuilder()
                .setColor('#3498DB')
                .setAuthor({
                    name: `Search Results for "$${tokenName}"`,
                    iconURL: 'https://cdn-icons-png.flaticon.com/512/622/622669.png', // Search icon URL
                })
                .setDescription('Please select a token from the list below:');
            
            // Add fields for each result
            topResults.forEach((coin, index) => {
                searchEmbed.addFields({
                    name: `${index + 1}. ${coin.name} (${coin.symbol.toUpperCase()})`,
                    value: `Market Cap Rank: ${coin.market_cap_rank || 'N/A'}`,
                    inline: false
                });
            });
            
            // Create buttons for each result
            const row = new ActionRowBuilder();
            topResults.forEach((coin, index) => {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`token_select_${coin.id}_${message.id}`)
                        .setLabel(`${index + 1}. ${coin.symbol.toUpperCase()}`)
                        .setStyle(ButtonStyle.Primary)
                );
            });
            
            // Send the search results and set up collector
            const searchMessage = await message.reply({ 
                embeds: [searchEmbed], 
                components: [row] 
            });

            // Create collector for button interactions
            const collector = searchMessage.createMessageComponentCollector({ 
                filter: i => i.user.id === message.author.id,
                time: 60000 // 1 minute to respond
            });
            
            collector.on('collect', async interaction => {
                if (!interaction.isButton()) return;
                
                // Get the coin ID from the button custom ID
                const [coinId, originalMessageId] = interaction.customId.replace('token_select_', '').split('_');
                const selectedCoin = topResults.find(coin => coin.id === coinId);
                
                if (!selectedCoin) {
                    await interaction.reply({ content: 'Token not found.', ephemeral: true });
                    return;
                }
                
                // Defer the reply while we fetch data
                await interaction.deferReply();
                
                try {
                    // Step 2: Get detailed token info for the selected coin
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
                    
                    // Clean thumbnail URL
                    const thumbnailUrl = cleanUrl(tokenData.image?.large) || 
                                       cleanUrl(tokenData.image?.small) || 
                                       cleanUrl(tokenData.image?.thumb);
                    
                    // Create detail embed
                    const detailEmbed = new EmbedBuilder()
                        .setColor(priceChangeColor)
                        .setAuthor({
                            name: `${tokenData.name} (${tokenData.symbol.toUpperCase()})`,
                            iconURL: chainIcon,
                            url: tokenData.links?.homepage?.[0] || `https://www.coingecko.com/en/coins/${coinId}`
                        });
                    
                    // Only add thumbnail if we have a valid URL
                    if (thumbnailUrl) {
                        detailEmbed.setThumbnail(thumbnailUrl);
                    }
                    
                    detailEmbed.setDescription(tokenData.description?.en ? 
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
                    .setImage(`https://media.discordapp.net/attachments/1360287959856971928/1361354047168315664/wide_stuff.gif?ex=67fe7341&is=67fd21c1&hm=9fbdb6b8adde3ae809bc16b759d2d75b1089798603905f3965f5c8ec74d0381d&=&width=1170&height=659`) // Add image to the embed
                    // .setFooter({ 
                    //     text: 'Powered by Solbonobos ', 
                    //     iconURL: `https://media.discordapp.net/attachments/1360287959856971928/1361354047168315664/wide_stuff.gif?ex=67fe7341&is=67fd21c1&hm=9fbdb6b8adde3ae809bc16b759d2d75b1089798603905f3965f5c8ec74d0381d&=&width=1170&height=659`
                    //     })
                    .setTimestamp();
                    
                    // Create action rows with buttons for detail view
                    const detailRow = new ActionRowBuilder()
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
                    
                    // Edit the original reply with the detailed information
                    await interaction.editReply({ 
                        embeds: [detailEmbed], 
                        components: [detailRow] 
                    });
                    
                } catch (error) {
                    console.error('Error fetching token details:', error);
                    await interaction.editReply({ 
                        content: 'Failed to fetch detailed information for this token.', 
                        ephemeral: true 
                    });
                }
            });
            
            collector.on('end', collected => {
                // Disable buttons after timeout
                const disabledRow = new ActionRowBuilder();
                topResults.forEach((coin, index) => {
                    disabledRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`token_select_${coin.id}_${message.id}`)
                            .setLabel(`${index + 1}. ${coin.symbol.toUpperCase()}`)
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true)
                    );
                });
                
                searchMessage.edit({ components: [disabledRow] }).catch(console.error);
            });
            
        } catch (err) {
            console.error('Error in token search command:', err);
            await message.reply("**ERROR:** Failed to search for tokens. Please try again later.");
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