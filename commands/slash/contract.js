const { SlashCommandBuilder } = require("discord.js");
const { PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const { Interface } = require("readline");

module.exports = {
    name: 'contract',
    type: 'slash',
    data: new SlashCommandBuilder()
        .setName("contract")
        .setDescription("Fetch comprehensive token information")
        .addStringOption(option => option
            .setName('contract')
            .setDescription('Contract address of the token')
            .setRequired(true))
        .setDMPermission(false),
    async execute(interaction, client, connection) {
        await interaction.deferReply();
        
        try {
            const contractAddress = interaction.options.getString('contract');
            
            // Validate contract address
            try {
                new PublicKey(contractAddress);
            } catch (err) {
                await interaction.editReply({content: "**ERROR:** Invalid contract address"});
                return;
            }
            
            // Fetch token data from DexScreener API
            const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`);
            const tokenData = response.data;
            console.log(`tokenData`, tokenData);
            if (!tokenData.pairs || tokenData.pairs.length === 0) {
                await interaction.editReply({content: "**ERROR:** Token not found on supported exchanges"});
                return;
            }
            
            // Get the most liquid pair (highest volume)
            const mostLiquidPair = tokenData.pairs.reduce((prev, current) => 
                (prev.volume.h24 > current.volume.h24) ? prev : current
            );
            // console.log("mostLiquidPair", mostLiquidPair.priceUsd);
            // Calculate FDV (Fully Diluted Valuation)
            const fdv = mostLiquidPair.fdv ? mostLiquidPair.fdv : 
                        mostLiquidPair.priceUsd * mostLiquidPair.totalSupply;
            
            // Calculate age since launch
            const createdAt = new Date(mostLiquidPair.pairCreatedAt);
            const ageDays = Math.floor((new Date() - createdAt) / (1000 * 60 * 60));
            console.log(createdAt, ageDays);
            console.log(mostLiquidPair);
            console.log(mostLiquidPair.priceUsd);
            console.log(mostLiquidPair.fdv);
            // Prepare response
            const responseMessage = `
            🔹 **:sol: Solana @ Orca Wp **
            `;
            // 🔹 **💎 FDV : **: $${fdv.toLocaleString()}
            // 🔹 **Contract**: \`${contractAddress}\`
// 🔹 **💰 USD : **: $${mostLiquidPair.priceUsd}
// 🔹 **💦 Liq : **: $${mostLiquidPair.liquidity.usd.toLocaleString()}
// 🔹 **📊 Vol : **: $${mostLiquidPair.volume.h24.toLocaleString()}
// 🔹 **🕰️ Age : **: ${ageDays} days
// 🔹 **📉 1H : **: ${mostLiquidPair.priceChange.h1.toFixed(2)}%
// 🔹 **🅑 Buy/Sell (1h)**: $${mostLiquidPair.txns.h1.buys.toLocaleString()} / $${mostLiquidPair.txns.h1.sells.toLocaleString()}
// 🔹 **Creator**: ${mostLiquidPair.info?.creatorUsername || 'Unknown'}
            

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

await interaction.editReply({
    content: ``,
    embeds: [embed]
});
        
            // await interaction.editReply({content: responseMessage});
            
        } catch (err) {
            console.error(err);
            await interaction.editReply({content: "**ERROR:**\n```" + err.message + "```"});
        }
    },
};