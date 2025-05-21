const { MessageEmbed } = require('discord.js');
const axios = require('axios');
const { PublicKey } = require('@solana/web3.js');

module.exports = {
    name: 'getInfobyCA',
    description: 'Fetches token or account information by contract address',
    type: 'message',
    triggers: [], // Empty array means it will process all messages
    async execute(message, client, trackers) {
        if (message.author.bot) return;
        
        const rawInput = message.content.trim();
        console.log(`rawInput`, rawInput);
        // Strict contract address validation
        // if (!/[a-fA-F0-9]$/.test(rawInput)) return;
        console.log(`stric`);
        try {
            console.log(`trycat`);
            // Validate Solana address
            try {
                new PublicKey(rawInput);
            } catch (err) {
                return message.reply("**ERROR:** Invalid contract address format");
            }
            
            // Fetch token data
            const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${rawInput}`);
            const tokenData = response.data;
            
            if (!tokenData.pairs || tokenData.pairs.length === 0) {
                return message.reply("**ERROR:** Token not found on supported exchanges");
            }
            
            const mostLiquidPair = tokenData.pairs.reduce((prev, current) => 
                (prev.volume?.h24 || 0) > (current.volume?.h24 || 0) ? prev : current
            );
            
            const ageHours = mostLiquidPair.pairCreatedAt 
                ? Math.floor((Date.now() - new Date(mostLiquidPair.pairCreatedAt).getTime()) / (1000 * 60 * 60))
                : null;
            
            // const embed = new MessageEmbed()
            //     .setColor('#00FF00')
            //     .addField('\u200B', `**:sol: Solana @ Orca Wp**`, false)
            //     .addField('\u200B', `**💰 USD:** $${mostLiquidPair.priceUsd || 'N/A'}`, false)
            //     .addField('\u200B', `**💦 Liq:** $${mostLiquidPair.liquidity?.usd?.toLocaleString() || 'N/A'}`, false)
            //     .addField('\u200B', `**📊 Vol:** $${mostLiquidPair.volume?.h24?.toLocaleString() || 'N/A'} | **🕰️ Age:** ${ageHours ? `${ageHours.toFixed(1)}h` : 'N/A'}`, false)
            //     .addField('\u200B', `**📉 1H:** ${mostLiquidPair.priceChange?.h1 ? `${mostLiquidPair.priceChange.h1.toFixed(2)}%` : 'N/A'}`, false)
            //     .setFooter('Pump.fun Token Alert', 'https://pump.fun/favicon.ico')
            //     .setTimestamp();

            const embed = {
                color: 0x00FF00,
                fields: [
                    {
                        name: '',
                        value: `**:sol: Solana @ Orca Wp **`, // Copyable contract address
                        inline: false
                    },
                    {
                        name: '',
                        value: `**💰 USD : **: $${mostLiquidPair.priceUsd}`, 
                        inline: false
                    },
                    {
                        name: '',
                        value: `**💦 Liq : **: $mostLiquidPair.liquidity.usd.toLocaleString()}`, // Copyable contract address
                        inline: false
                    },
                    {
                        name: '',
                        value: `**📊 Vol : **:  \`$xxx\` **🕰️ Age : **: \`22h\`  }`, // Copyable contract address
                        inline: false
                    },
                    {
                        name: '',
                        value: `**📉 1H : **: `, // Copyable contract address
                        inline: false
                    },
                    {
                        name: '',
                        value: `**💦 Liq : **: $mostLiquidPair.liquidity.usd.toLocaleString()}`, // Copyable contract address
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                text: 'Pump.fun Token Alert',
                icon_url: 'https://pump.fun/favicon.ico'
                }
            };
            
            await message.reply({ embeds: [embed] });
            
        } catch (err) {
            console.error(err);
            await message.reply("**ERROR:** Failed to fetch token data");
        }
    }
};