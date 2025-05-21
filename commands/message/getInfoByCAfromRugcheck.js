const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const https = require('https');
const { PublicKey } = require('@solana/web3.js');
const { calculateHolderDistributionRugCheck } = require('../../utils/api'); // Adjust the path as needed

// Chain ID to icon mapping
const CHAIN_ICONS = {
  'ethereum': 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
  'solana': 'https://cryptologos.cc/logos/solana-sol-logo.png',
  'bsc': 'https://cryptologos.cc/logos/bnb-bnb-logo.png',
};

// Risk level colors and emojis
const RISK_LEVELS = {
    danger: { color: 0xFF0000, emoji: '🔴', result: 'Danger -> High Risk' },
    warn: { color: 0xFFA500, emoji: '🟠', result: 'Warning -> Medium Risk' },
    good: { color: 0x00FF00, emoji: '🟢', result: 'Good -> Low Risk' },
    info: { color: 0x3498DB, emoji: '🔵', result: 'Info -> Neutral' },
};
// Create an agent with modern TLS settings
const httpsAgent = new https.Agent({
    minVersion: 'TLSv1.2', // Force TLS 1.2 or higher
    maxVersion: 'TLSv1.3',
    rejectUnauthorized: true // Keep security validation
});

module.exports = {
    name: 'getInfobyCAfromRugcheck',
    description: 'Fetches token info by contract address from Rugcheck',
    type: 'message',
    triggers: [],
    async execute(message, client, trackers) {
        if (message.author.bot) return;
        
        const rawInput = message.content.trim();
        if (!this.isValidContractAddress(rawInput)) return;

        try {
            // Validate address format
            try {
                new PublicKey(rawInput);
            } catch (err) {
                return message.reply("**ERROR:** Invalid contract address format");
            }
            
            // Fetch token data from Rugcheck
            // const tokenData = await fetchHolderData(rawInput);
            // const response = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${rawInput}/report`);
            // const tokenData = response.data;
            const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${rawInput}/report`, {
                httpsAgent: httpsAgent,  // Use our custom agent
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'YourBot/1.0'
                }
              });
            
            const tokenData = res.data;

            if (!tokenData) {
                return message.reply("**ERROR:** Token not found on Rugcheck");
            }

            // Calculate time since launch
            const detectedAt = tokenData?.detectedAt ? new Date(tokenData?.detectedAt) : null;
            const timeDiff = detectedAt ? Date.now() - detectedAt.getTime() : null;
            const ageString = timeDiff ? this.formatTimeDifference(timeDiff) : 'Unknown';
            
            // Process holder distribution
            const holderInfo = calculateHolderDistributionRugCheck(tokenData);
            console.log(`holderInfo`, holderInfo);
            // Process risk assessment
            const riskAssessment = this.getRiskAssessment(tokenData);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(this.getRiskColor(tokenData))
                .setAuthor({
                    name: `${tokenData.tokenMeta?.name || 'Unknown Token'} (${tokenData.tokenMeta?.symbol || '?'})`,
                    
                    iconURL: CHAIN_ICONS.solana,
                    url: `https://solscan.io/token/${rawInput}`
                })
                .setDescription(`$${tokenData?.tokenMeta?.symbol || '?'} | ${tokenData.markets[0].marketType}`)
                .addFields(
                    // Token Info Section
                    {
                        name: '📊 Token Info',
                        value: [
                            `**💰 Market Cap:** $${this.formatCompactNumber(tokenData?.price * tokenData?.token.supply / Math.pow(10, tokenData?.token?.decimals)) || 'N/A'}`,
                            `**💧 Liquidity:** $${this.formatCompactNumber(tokenData?.totalMarketLiquidity) || 'N/A'}`,
                            `**💲 Price:** $${tokenData.price?.toFixed(10) || 'N/A'}`,
                            `**⏰ Age:** ${ageString}`,
                        ].join('\n'),
                        inline: true
                    },
                    // Holder Distribution
                    {
                        name: '👥 Holder Distribution',
                        value: [
                            `**#️⃣ Total Holders:** ${holderInfo?.totalHolders || 0}`,
                            `** Top 5:** ${holderInfo?.top5Percentage || "0"}%`,
                            `** Top 20:** ${holderInfo?.top20Percentage || "0"}%`,
                            `** Top 50:** ${holderInfo?.top50Percentage || "0"}%`,
                            `[${holderInfo?.top5Holders?.[0]?.percentage.toFixed(2) || "0"}](${`https://solscan.io/account/${rawInput}`})`+`|`+
                            `[${holderInfo?.top5Holders?.[1]?.percentage.toFixed(2) || "0"}](${`https://solscan.io/account/${rawInput}`})`+`|`+
                            `[${holderInfo?.top5Holders?.[2]?.percentage.toFixed(2) || "0"}](${`https://solscan.io/account/${rawInput}`})`+`|`+
                            `[${holderInfo?.top5Holders?.[3]?.percentage.toFixed(2) || "0"}](${`https://solscan.io/account/${rawInput}`})`+`|`+
                            `[${holderInfo?.top5Holders?.[4]?.percentage.toFixed(2) || "0"}](${`https://solscan.io/account/${rawInput}`})`,

                            // ...(holderInfo.top5Holders?.slice(0, 5)?.map((holder, i) => 
                            //     `**${i + 1}.** [${shortenAddress(holder.address)}](${`https://solscan.io/account/${holder.address}`}) - ${holder.percentage || "0"}%`
                            // ) || [])
                        ].join('\n'),
                        inline: true
                    },
                    // Risk Assessment
                    {
                        name: `ℹ️ Rug Check `,
                        value: [
                            `**${riskAssessment.emoji}  Risk Score: ** ${riskAssessment.score}/100(${riskAssessment.result})`,                            
                            riskAssessment.risks.length > 0 ? 
                            riskAssessment.risks.map(r => ` -  **${r.name}** - ${r.description}`).join('\n') :
                            'No significant risks detected',].join('\n'),
                        inline: false
                    },
                    // Contract Info
                    {
                        name: '📝 Contract',
                        value: `\`\`\`${rawInput}\`\`\``,
                        inline: false
                    }
                )
                .setImage(`https://media.discordapp.net/attachments/1360287959856971928/1361354047168315664/wide_stuff.gif?ex=67fe7341&is=67fd21c1&hm=9fbdb6b8adde3ae809bc16b759d2d75b1089798603905f3965f5c8ec74d0381d&=&width=1170&height=659`) // Add image to the embed

                // .setFooter({ 
                    //     text: ' Powered by Solbonobos ', 
                    //     // iconURL: '../../public/Bonobot.png' 
                    //     iconURL: `https://media.discordapp.net/attachments/1360287959856971928/1361354047168315664/wide_stuff.gif?ex=67fe7341&is=67fd21c1&hm=9fbdb6b8adde3ae809bc16b759d2d75b1089798603905f3965f5c8ec74d0381d&=&width=1170&height=659`
                    // })
                    // .setTimestamp();
                    
                    // Create action rows with buttons
                    const row1 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('copy_contract')
                            .setLabel('C.A')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📋'),
                        new ButtonBuilder()
                        .setURL(`https://solscan.io/token/${rawInput}`)
                        .setLabel('Solscan')
                        .setStyle(ButtonStyle.Link),
                        //     .setEmoji('🔍'),
                        new ButtonBuilder()
                        .setURL(`https://dexscreener.com/solana/${rawInput}`)
                        .setLabel('Dex')
                        .setStyle(ButtonStyle.Link),
                        //     .setEmoji('📈'),
                        new ButtonBuilder()
                        .setURL(`https://dextools.io/app/solana/pair-explorer/${rawInput}`)
                        .setLabel('Dextool')
                        .setStyle(ButtonStyle.Link),
                        //     .setEmoji('🔧'),
                    );
                    // Add a button to copy the contract address
                    // const row2 = new ActionRowBuilder()
                    //     .addComponents(
                    //         new ButtonBuilder()
                    //             .setCustomId('copy_contract')
                    //             .setLabel('Copy C.A')
                    //             .setStyle(ButtonStyle.Secondary)
                    //             .setEmoji('📋')
                    //     );
    
                    await message.reply({ 
                        embeds: [embed], 
                        components: [row1] 
                    });
                    
                    // const row2 = new ActionRowBuilder()
                    // .addComponents(
                    //     new ButtonBuilder()
                    //     .setURL(`https://rugcheck.xyz/tokens/${rawInput}`)
                    //     .setLabel('Rugcheck')
                    //     .setStyle(ButtonStyle.Link)
                    //     .setEmoji('⚠️'),
                    // );
                
                // await message.reply({ 
                //     embeds: [embed], 
                //     components: [row1] 
                // });
            
        } catch (err) {
            console.error(err);
            await message.reply("**ERROR:** Failed to fetch token data from RPC");
        }
    },

    // fetchHolderData(contractAddress) {
    //     try {
    //       const response = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${contractAddress}/report`, {
    //         httpsAgent: httpsAgent,  // Use our custom agent
    //         headers: {
    //           'Accept': 'application/json',
    //           'User-Agent': 'YourBot/1.0'
    //         }
    //       });
    //       return response.data;
    //     } catch (error) {
    //       console.error('API Error:', error);
    //       return null;
    //     }
    //   },

    // Calculate holder distribution percentages
    getHolderDistribution(tokenData) {
        if (!tokenData.topHolders || tokenData.topHolders.length === 0) {
            return { top10: 0, top20: 0, top50: 0 };
        }

        const top10 = tokenData.topHolders.slice(0, 10).reduce((sum, h) => sum + (h.pct || 0), 0);
        const top20 = tokenData.topHolders.slice(0, 20).reduce((sum, h) => sum + (h.pct || 0), 0);
        const top50 = tokenData.topHolders.slice(0, 50).reduce((sum, h) => sum + (h.pct || 0), 0);

        return {
            top10: top10.toFixed(2),
            top20: top20.toFixed(2),
            top50: top50.toFixed(2)
        };
    },

    // Process risk assessment
    getRiskAssessment(tokenData) {
        const risks = (tokenData.risks || []).map(risk => ({
            ...risk,
            emoji: RISK_LEVELS[risk.level]?.emoji || '❓'
        }));

        // Determine overall risk level
        let overallLevel = 'good';
        if (tokenData.score_normalised >= 70) overallLevel = 'danger';
        else if (tokenData.score_normalised >= 40) overallLevel = 'warn';

        return {
            score: tokenData.score_normalised || 0,
            level: overallLevel,
            result: RISK_LEVELS[overallLevel]?.result || 'Unknown',
            emoji: RISK_LEVELS[overallLevel]?.emoji || '❓',
            risks: risks
        };
    },

    // Get color based on risk level
    getRiskColor(tokenData) {
        if (tokenData.score_normalised >= 70) return RISK_LEVELS.danger.color;
        if (tokenData.score_normalised >= 40) return RISK_LEVELS.warn.color;
        return RISK_LEVELS.good.color;
    },

    formatCompactNumber(number) {
        if (number == null || isNaN(number)) return null;
        const num = parseFloat(number);
        if (num < 1000) return num.toFixed(2);
        if (num >= 1000 && num < 1000000) return `${(num / 1000).toFixed(1)}k`;
        if (num >= 1000000 && num < 1000000000) return `${(num / 1000000).toFixed(1)}M`;
        return `${(num / 1000000000).toFixed(1)}B`;
    },
    
    isValidContractAddress(address) {
        const rawInput = address.trim();
        const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        const evmRegex = /^0x[a-fA-F0-9]{40}$/;
        const memeRegex = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})(pump|moon)$/i;
        
        return (
            solanaRegex.test(rawInput) || 
            evmRegex.test(rawInput) || 
            memeRegex.test(rawInput)
        );
    },
    
    formatTimeDifference(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    }
};