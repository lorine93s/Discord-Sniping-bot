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
    name: 'getTokenInfoByDollarv1',
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
            const topResults = searchResponse.data.coins.slice(0, 10);
            console.log(`top10results`, topResults);
            // Create embed with search results
            // const searchEmbed = new EmbedBuilder()
            //     .setColor('#3498DB')
            //     .setAuthor({
            //         name: `Search Results for "${tokenName}"`,
            //         iconURL: 'https://static.coingecko.com/s/thumbnail-007177f3eca19695592f0b8b0eabbdae282b54154e1be912285c9034ea6cbaf2.png'
            //     })
            //     .setDescription('Please select a token from the list below:');
            
            // // Add fields for each result
            // topResults.forEach((coin, index) => {
            //     topResults.forEach((coin, index) => {
            //     row.addComponents(
            //         new ButtonBuilder()
            //             .setCustomId(`token_select_${coin.id}`)
            //             .setLabel(`${index + 1}. ${coin.symbol.toUpperCase()}`)
            //             .setStyle(ButtonStyle.Primary)
            //     );
            // });

            const searchEmbed = new EmbedBuilder()
                .setColor('#3498DB')
                .setAuthor({
                    name: `Search Results for "${tokenName}"`,
                    // iconURL: 'https://static.coingecko.com/s/thumbnail-007177f3eca19695592f0b8b0eabbdae282b54154e1be912285c9034ea6cbaf2.png'
                })
                .setDescription('Please select a token from the list below:');
            
            const seachButtons = new ActionRowBuilder()
                .addComponents(
                    topResults.map((coin, index) => 
                        new ButtonBuilder()
                            .setCustomId(`token_select_${coin.id}`)
                            .setLabel(`${index + 1}. ${coin.symbol.toUpperCase()}`)
                            .setStyle(ButtonStyle.Primary)
                    )
            );
            
            // Send the search results
            const searchMessage = message.reply({ 
                embeds: [searchEmbed], 
                components: [seachButtons] 
            });
            
            // Create a collector for button interactions
            const collector = searchMessage.createMessageComponentCollector({ 
                time: 60000 // 1 minute to respond
            });
            
        // searchEmbed.addFields({
        //             name: `${index + 1}. ${coin.name} (${coin.symbol.toUpperCase()})`,
        //             value: `Market Cap Rank: ${coin.market_cap_rank || 'N/A'}`,
        //             inline: false
        //         });
        //     });
            
            // Create buttons for each result
            const row = new ActionRowBuilder();
                collector.on('collect', async interaction => {
                if (!interaction.isButton()) return;
                console.log(`------------------------------`);
                // Get the coin ID from the button custom ID
                const coinId = interaction.customId.replace('token_select_', '');
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
                    // console.log(`token`, tokenData);
                    // Format market data
                    const marketData = tokenData.market_data || {};
                    const currentPrice = marketData.current_price?.usd || 0;
                    const marketCap = marketData.market_cap?.usd || 0;
                    const volume = marketData.total_volume?.usd || 0;
                    const priceChange24h = marketData.price_change_percentage_24h || 0;
                    const priceChangeColor = priceChange24h >= 0 ? '#00FF00' : '#FF0000';
                    console.log('Name:', tokenData.name);
                    console.log('Current Price:', currentPrice);
                    console.log('Market Cap:', marketCap);
                    console.log('Volume:', volume);
                    console.log('Price Change (24h):', priceChange24h);
                    console.log('Platform:', platform);
                    console.log('Chain Name:', chainName);
                    
                    // Get platform/chain info
                    const platform = tokenData.platforms ? Object.keys(tokenData.platforms)[0] : null;
                    const chainName = platform ? platform.split('-').join(' ').toUpperCase() : 'N/A';
                    const chainIcon = CHAIN_ICONS[platform] || CHAIN_ICONS.ethereum;
                    
                    // Create detail embed
                    const detailEmbed = new EmbedBuilder()
                        .setColor(priceChangeColor)
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
                    console.error(error);
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
                            .setCustomId(`token_select_${coin.id}`)
                            .setLabel(`${index + 1}. ${coin.symbol.toUpperCase()}`)
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true)
                    );
                });
                
                searchMessage.edit({ components: [disabledRow] }).catch(console.error);
            });
            
        } catch (err) {
            console.error(err);
            await message.reply("**ERROR:** Failed to search for tokens on CoinGecko");
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