const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { getTokenMetadata, getNFTCollectionData } = require("./api");
// const { formatEther, formatSol } = require('./web3');
const axios = require("axios");
const https = require("https");
// const fetch = require('node-fetch');
// const { validateHeaderName } = require('http');
const { url } = require("inspector");

/**
 * Formats new token alerts for coin tracker
 * @param {Object} tokenData - Raw token data from Pump.fun
 * @returns {Promise<Object>} Discord message payload
 */
const agent = new https.Agent({ keepAlive: true });
let solPriceCache = { value: null, lastUpdated: 0 };

function fetchIPFSMetadata(url) {
  try {
    if (url.startsWith("http://")) {
      url = url.replace("http://", "https://");
    }
    return new Promise((resolve, reject) => {
      const req = https.get(url, { agent }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on("error", reject);
    });
  } catch (error) {}
}
function formatCompactNumber(number) {
  if (number == null || isNaN(number)) return null;
  const num = parseFloat(number);
  if (num < 1000) return num.toFixed(2); // Show decimals for small numbers
  if (num >= 1000 && num < 1000000) return `${(num / 1000).toFixed(1)}k`; // Thousands (1k, 10k, etc.)
  if (num >= 1000000 && num < 1000000000)
    return `${(num / 1000000).toFixed(1)}M`; // Millions (1M, 10M)
  return `${(num / 1000000000).toFixed(1)}B`; // Billions (1B, 10B)
}

async function formatTokenAlert(tokenData) {
  try {
    if (!tokenData?.signature) return;

    // 1. Fetch metadata from IPFS
    // console.log(`tokenData?`, tokenData);
    const metadata = await fetchIPFSMetadata(tokenData?.uri);
    // 2. Get current SOL price
    const solPrice = await getSolPrice();
    // 3. Calculate token metrics
    const metrics = calculateTokenMetrics(tokenData, solPrice);
    // 4. Generate Discord embed
    return generateDiscordEmbed(tokenData, metadata, metrics);
    // return fallbackTokenAlert(tokenData);
  } catch (error) {
    // console.error('Error formatting token alert:', error);
    // return fallbackTokenAlert(tokenData);
  }
}

async function getSolPrice() {
  const now = Date.now();
  // Refresh cache every 5 minutes (300,000 ms)
  if (
    solPriceCache.value === null ||
    now - solPriceCache.lastUpdated > 300000
  ) {
    try {
      const response = await axios.get(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
      );
      if (response)
        solPriceCache = {
          value: response?.data?.solana?.usd,
          lastUpdated: now,
        };
    } catch (error) {
      console.error("CoinGecko API error:", error.message);
    }
  }
  return solPriceCache.value || "N/A"; // Return cached or fallback
}

function calculateTokenMetrics(tokenData, solPrice) {
  const totalSupply = tokenData?.vTokensInBondingCurve || 0;
  const priceSol =
    tokenData?.vSolInBondingCurve / tokenData?.vTokensInBondingCurve || 0;
  const priceUsd = priceSol * solPrice || 0;
  const marketCapUsd = tokenData?.marketCapSol * solPrice || 0;
  const liquidityUsd = tokenData?.solAmount * solPrice || 0;

  return {
    totalSupply,
    marketCapUsd,
    liquidityUsd,
    priceUsd,
    priceSol,
    solPrice: solPrice,
  };
}

// function generateDiscordEmbed(tokenData, metadata, metrics) {
//     // Process social links - only include if they exist
//     const socialLinks = [
//         metadata.website && `[🌐 Website](${metadata.website})`,
//         metadata.twitter && `[🐦 Twitter](${metadata.twitter})`,
//         metadata.telegram && `[📢 Telegram](${metadata.telegram})`
//     ].filter(Boolean).join(' | ') || null;

//     return {
//         content: `🚦 [${tokenData.name}](https://pump.fun/${tokenData.mint}) - $${tokenData.symbol} \`@Pump.fun New Token\``,
//         embeds: [{
//             color: 0x00FF00,
//             image: `https://media.discordapp.net/attachments/1360287959856971928/1361354047168315664/wide_stuff.gif?ex=67fe7341&is=67fd21c1&hm=9fbdb6b8adde3ae809bc16b759d2d75b1089798603905f3965f5c8ec74d0381d&=&width=1170&height=659`,
//             fields: [
//                 // 1. Creator (full address)
//                 {
//                     name: '👷 Creator',
//                     value: `[${tokenData.traderPublicKey}](https://solscan.io/account/${tokenData.traderPublicKey})`,
//                     inline: false
//                 },

//                 // 2. Divided market data sections
//                 {
//                     name: '📊 Token Info',
//                     value: [
//                         `**💵 Market Cap:** $${formatCompactNumber(metrics?.marketCapUsd) || 'N/A'}`,
//                         `**💧 Liquidity:** $${formatCompactNumber(metrics?.liquidityUsd) || 'N/A'}`,
//                     ].join('\n'),
//                     inline: true
//                 },
//                 {
//                     name: '💰 Price Information',
//                     value: [
//                         `**💲 USD Price:** $${metrics?.priceUsd.toFixed(10) || 'N/A'}`,
//                         `**🏦 Exchange:** \`Pump.fun\``
//                     ].join('\n'), // Combine lines into a single string
//                     inline: true
//                 },
//                 // 3. Social links (only if exists)
//                 ...(socialLinks ? [{
//                     name: '🔗 Social Links',
//                     value: socialLinks,
//                     inline: false
//                 }] : []),

//                 // 4. Contract address
//                 {
//                     name: '📜 Contract Address',
//                     value: `\`\`\`${tokenData.mint}\`\`\``, // Clipboard-style formatting
//                     inline: false
//                 }

//             ],
//             image: {
//                 url: `https://media.discordapp.net/attachments/1360287959856971928/1361354047168315664/wide_stuff.gif?ex=67fe7341&is=67fd21c1&hm=9fbdb6b8adde3ae809bc16b759d2d75b1089798603905f3965f5c8ec74d0381d&=&width=1170&height=659`
//             },
//             // 5. Action buttons
//             components: [{
//                 type: 1, // ACTION_ROW
//                 components: [
//                     // First row buttons
//                     {
//                         type: 2, // BUTTON
//                         style: 1, // PRIMARY
//                         label: "📋 Copy Address",
//                         custom_id: "copy_address",
//                         emoji: { id: null, name: "📋" }
//                     },
//                     {
//                         type: 2, // BUTTON
//                         style: 5, // LINK
//                         label: "Pump.fun",
//                         url: `https://pump.fun/${tokenData.mint}`,
//                         emoji: { id: null, name: "🚀" }
//                     }
//                 ]
//             }, {
//                 type: 1, // ACTION_ROW
//                 components: [
//                     // Second row buttons
//                     {
//                         type: 2, // BUTTON
//                         style: 5, // LINK
//                         label: "DexScreener",
//                         url: `https://dexscreener.com/solana/${tokenData.mint}`,
//                         emoji: { id: null, name: "📊" }
//                     },
//                     {
//                         type: 2, // BUTTON
//                         style: 5, // LINK
//                         label: "Solscan",
//                         url: `https://solscan.io/token/${tokenData.mint}`,
//                         emoji: { id: null, name: "🔍" }
//                     },
//                     {
//                         type: 2, // BUTTON
//                         style: 5, // LINK
//                         label: "Dextools",
//                         url: `https://www.dextools.io/app/en/solana/pair-explorer/${tokenData.mint}`,
//                         emoji: { id: null, name: "📈" }
//                     }
//                 ]
//             }],

//             thumbnail: {
//                 url: metadata.image || 'https://pump.fun/favicon.ico'
//             },
//             // footer: {
//             //     text: `Powered by : Solbonobos `,
//             //     iconURL: `https://media.discordapp.net/attachments/1360287959856971928/1361354047168315664/wide_stuff.gif?ex=67fe7341&is=67fd21c1&hm=9fbdb6b8adde3ae809bc16b759d2d75b1089798603905f3965f5c8ec74d0381d&=&width=1170&height=659`
//             // },
//             // timestamp: new Date().toISOString() // Add universal time to the embed
//         }]
//     };
// }
// function generateDiscordEmbed(tokenData, metadata, metrics) {
//   // Process social links - only include if they exist
//   const socialLinks =
//     [
//       metadata.website && `[🌐 Website](${metadata.website})`,
//       metadata.twitter && `[🐦 Twitter](${metadata.twitter})`,
//       metadata.telegram && `[📢 Telegram](${metadata.telegram})`,
//     ]
//       .filter(Boolean)
//       .join(" ") || "Not available";

//   return {
//     content: `🚀 **${tokenData.name} ($${tokenData.symbol})** - Pump.fun New Token`,
//     embeds: [
//       {
//         color: 0x00ff00,
//         thumbnail: {
//           url: metadata.image || "https://pump.fun/favicon.ico",
//         },
//         image: {
//           url: "https://media.discordapp.net/attachments/1360287959856971928/1361354047168315664/wide_stuff.gif",
//         },
//         fields: [
//           // Left Column - Token Info
//         //   {
//         //     name: "",
//         //     value: `\n`
//         //   },
//           {
//             name: "📊 Token Info",
//             value: [
//               `\n`, // Added newline here
//               `**MC:** $${formatCompactNumber(metrics?.marketCapUsd) || "N/A"}`,
//               `**Liq:** $${
//                 formatCompactNumber(metrics?.liquidityUsd) || "N/A"
//               }`,
//             ].join("\n"), // Ensure proper joining with newline
//             inline: true,
//           },
//             //   `**C.A:** [${shortAddress(
//             //     tokenData.mint
//             //   )}](https://solscan.io/token/${tokenData.mint})`,
//             //   `**Dev:** [${shortAddress(
//             //     tokenData.traderPublicKey
//             //   )}](https://solscan.io/account/${tokenData.traderPublicKey})`,
//             //   `**Social:** ${socialLinks}`,
//             //   `\u200B`, // Empty space for alignment
//         //     ].join("\n"),
//         //     inline: true,
//         //   },
//           // Right Column - Price Info
//           {
//             name: "💵 Price Info",
//             value: [
//               `**Price:** $${metrics?.priceUsd?.toFixed(10) || "N/A"}`,
//               `**Dex:** [Pump.fun](https://pump.fun/${tokenData.mint})`,
//             ].join("\n"),
//             inline: true,
//           },
//           {
//             name: "",
//             value: `**C.A:** [${shortAddress(
//                 tokenData.mint, 16
//               )}](https://solscan.io/token/${tokenData.mint})`,
//             inline: false,
//           },
//           {
//             name: "",
//             value: `**Dev:** [${shortAddress(
//                 tokenData.traderPublicKey, 16
//               )}](https://solscan.io/account/${tokenData.traderPublicKey})`,
//             inline: false,
//           },
//           {
//             name: "",
//             value: `**Social:** ${socialLinks}`,
//             inline: false,
//           },
//         ],
//         // footer: {
//         //     text: 'Powered by Solbonobos',
//         //     icon_url: 'https://media.discordapp.net/attachments/1360287959856971928/1361354047168315664/wide_stuff.gif'
//         // },
//         // timestamp: new Date().toISOString(),
//       },
//     ],
//     components: [
//       {
//         type: 1,
//         components: [
//           {
//             type: 2,
//             style: 1,
//             label: "Copy Address",
//             custom_id: "copy_address",
//             emoji: { name: "📋" },
//           },
//           {
//             type: 2,
//             style: 5,
//             label: "View on Pump.fun",
//             url: `https://pump.fun/${tokenData.mint}`,
//             // emoji: { name: "🚀" },
//           },
//         ],
//       },
//       // {
//       //     type: 1,
//       //     components: [
//       //         {
//       //             type: 2,
//       //             style: 5,
//       //             label: "DexScreener",
//       //             url: `https://dexscreener.com/solana/${tokenData.mint}`,
//       //             emoji: { name: "📊" }
//       //         },
//       //         {
//       //             type: 2,
//       //             style: 5,
//       //             label: "Solscan",
//       //             url: `https://solscan.io/token/${tokenData.mint}`,
//       //             emoji: { name: "🔍" }
//       //         },
//       //         {
//       //             type: 2,
//       //             style: 5,
//       //             label: "Dextools",
//       //             url: `https://www.dextools.io/app/en/solana/pair-explorer/${tokenData.mint}`,
//       //             emoji: { name: "📈" }
//       //         }
//       //     ]
//       // }
//     ],
//   };
// }

function generateDiscordEmbed(tokenData, metadata, metrics) {
    // Process social links
    const socialLinks = [
      metadata.website && `[🌐 Website](${metadata.website})`,
      metadata.twitter && `[🐦 Twitter](${metadata.twitter})`,
      metadata.telegram && `[📢 Telegram](${metadata.telegram})`
    ].filter(Boolean).join(' ') || 'Not available';
  
    // Create embed using EmbedBuilder
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
    //   .setTitle(`🚀 ${tokenData.name} ($${tokenData.symbol}) - Pump.fun New Token`)
      .setURL(`https://pump.fun/${tokenData.mint}`)
      .setThumbnail(metadata.image || 'https://pump.fun/favicon.ico')
      .setImage('https://media.discordapp.net/attachments/1360287959856971928/1361354047168315664/wide_stuff.gif')
      .addFields(
        {
          name: '📊 Token Info',
          value: [
            `**MC:** $${formatCompactNumber(metrics?.marketCapUsd) || 'N/A'}`,
            `**Liq:** $${formatCompactNumber(metrics?.liquidityUsd) || 'N/A'}`
          ].join('\n'),
          inline: true
        },
        {
          name: '💵 Price Info',
          value: [
            `**Price:** $${metrics?.priceUsd?.toFixed(10) || 'N/A'}`,
            `**Dex:** [Pump.fun](https://pump.fun/${tokenData.mint})`
          ].join('\n'),
          inline: true
        },
        // Contract Info
        {
            name: '📝 Contract',
            value: `\`\`\`${tokenData.mint}\`\`\``,
            inline: false
        },
        {
          name: '👷 Dev',
          value: `[${shortAddress(tokenData.traderPublicKey, 11)}](https://solscan.io/account/${tokenData.traderPublicKey})`,
          inline: false
        },
        {
          name: '',
          value: `**Social:** ${socialLinks}`,
          inline: false
        }
      )
    //   .setTimestamp();
  
    // Create buttons
    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('copy_address')
          .setLabel('Copy Address')
          .setStyle(ButtonStyle.Primary),
        //   .setEmoji('📋'),
        new ButtonBuilder()
          .setURL(`https://pump.fun/${tokenData.mint}`)
          .setLabel('View on Pump.fun')
          .setStyle(ButtonStyle.Link)
      );
  
    return {
      content: `🚀 **${tokenData.name} ($${tokenData.symbol})** - Pump.fun New Token`,
      embeds: [embed],
      components: [buttons]
    };
  }

// Helper function to shorten addresses
function shortenAddress(address, chars = 4) {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// Helper function to format numbers
function formatCompactNumber(number) {
  if (number == null || isNaN(number)) return "N/A";
  const num = parseFloat(number);
  if (num < 1000) return num.toFixed(2);
  if (num >= 1000 && num < 1000000) return `${(num / 1000).toFixed(1)}K`;
  if (num >= 1000000 && num < 1000000000)
    return `${(num / 1000000).toFixed(1)}M`;
  return `${(num / 1000000000).toFixed(1)}B`;
}

function shortAddress(address, chars = 4) {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function fallbackTokenAlert(tokenData) {
  return {
    content: `⚠️ Failed to fetch complete data for ${
      tokenData?.name || "unknown token"
    }`,
    embeds: [
      {
        color: 0xffa500,
        title: `Basic Token Info`,
        fields: [
          {
            name: "Contract Address",
            value: `\`\`\`${tokenData?.mint}\`\`\``,
          },
        ],
        footer: {
          text: "Some data may be unavailable",
        },
      },
    ],
  };
}

// async function formatTokenAlert(tokenData) {
//     try {

//         // const metadata = await axios.get(tokenData.uri);
//         if(!tokenData) return;
//         const ipfsdata = await fetch(tokenData.uri);

//         if (!ipfsdata.ok) {
//             throw new Error(`HTTP error! status: ${ipfsdata.status}`);
//         }

//         const metadata = await ipfsdata.json();
//         console.log(`Tokendata----------------------------------->`, metadata);

//                             // Fetch data from DexScreener
//                             // const metadataDex = await fetchJson(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenData.mint}`);

//         //            // const metadataDex = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${tokenData.mint}`);
//         //           // console.log(`https://api.dexscreener.com/latest/dex/tokens/${tokenData.mint}`);

//         // console.log(`metadataDex----------------------------------->`, metadataDex);
//         //const metadata = await getTokenMetadata(tokenData.uri);

//         // const embed = new EmbedBuilder()
//         //     .setColor(0x00FF00)
//         //     .setTitle(`🚀 New Token: ${tokenData.name} (${tokenData.symbol})`)
//         //     .setURL(`https://pump.fun/${tokenData.mint}`)
//         //     .addFields(
//         //         { name: '📜 Contract', value: `\`${tokenData.mint}\``, inline: false },
//         //         { name: '👷 Creator', value: `[${shortAddress(tokenData.traderPublicKey)}](https://solscan.io/account/${tokenData.traderPublicKey})`, inline: false },
//         //         { name: '🌐 Website', value: metadata.socials.website || 'Not available', inline: true },
//         //         { name: '🐦 Twitter', value: metadata.socials.twitter ? `[Link](${metadata.socials.twitter})` : 'Not available', inline: true },
//         //         { name: '📢 Telegram', value: metadata.socials.telegram ? `[Link](${metadata.socials.telegram})` : 'Not available', inline: true }
//         //     )
//         //     .setThumbnail(metadata.image)
//         //     .setFooter({ text: 'Powered by Solbonobos', icon_url: 'https://pump.fun/favicon.ico'})
//         //     .setTimestamp();
//         const embed = {
//             color: 0x00FF00,
//             fields: [
//             {
//                 name: '📜 Contract Address',
//                 value: `\`\`\`${tokenData.mint}\`\`\``, // Copyable contract address
//                 inline: false
//             },
//             {
//                 name: '👷 Creator',
//                 value: `[${tokenData.traderPublicKey}](https://solscan.io/account/${tokenData.traderPublicKey})`,
//                 inline: false
//             },
//             {
//                 name: '',
//                 value: metadata.website ? `🌐[Website](${metadata.website})` : '❌No Website',
//                 inline: true
//             },
//             {
//                 name: '',
//                 value: metadata.twitter ? `[🐦Twitter](${metadata.twitter})` : '❌No Twitter',
//                 inline: true
//             },
//             {
//                 name: '',
//                 value: metadata.telegram ? `[📢 Telegram](${metadata.telegram})` : '❌No Telegram',
//                 inline: true
//             },
//             {
//                 name: '🔗Links',
//                 value: `[Pump.Fun](https://pump.fun/${tokenData.mint}) ⋅ \
//                         [BLO](https://t.me/BloomSolana_bot?start=ref_LUNARFANG_ca_${tokenData.mint}) ⋅ \
//                         [NEO](https://neo.bullx.io/terminal?chainId=1399811149&address=${tokenData.mint}) ⋅ \
//                         [PHO](https://photon-sol.tinyastro.io/en/r/@lunarfang/${tokenData.mint}) ⋅ \
//                         [TRO](https://t.me/solana_trojanbot?start=r-lunarfang_416-${tokenData.mint}) ⋅ \
//                         [DEX](https://dexscreener.com/solana/${tokenData.mint}) ⋅ \
//                         [RUG](https://rugcheck.xyz/tokens/${tokenData.mint})`,
//                 inline: true
//             },
//             {
//                 name: '🆕 New',
//                 value: `Boost your trades, frontrun the competition — [Bloom](https://t.me/BloomSolana_bot?start=ref_LUNARFANG)`,
//                 inline: false
//             }
//             ],
//             thumbnail: {
//                 url: metadata.image
//                 // url: 'https://pump.fun/favicon.ico',
//             },
//             timestamp: new Date().toISOString(),
//             footer: {
//             text: 'Pump.fun Token Alert',
//             icon_url: 'https://pump.fun/favicon.ico'
//             }
//         };

//         return {
//             content: `🚦 [${tokenData.name}](https://pump.fun/${tokenData.mint}) - $${tokenData.symbol} \`@Pump.fun New Token Launches\``,
//             embeds: [embed]
//         };
//     } catch (error) {
//         console.error('Error formatting token alert:', error);
//         return fallbackTokenAlert(tokenData);
//     }
// }

/**
 * Formats whale transaction alerts
 * @param {Object} tx - Transaction data
 * @param {string} network - Blockchain network
 * @returns {Object} Discord message payload
 */
function formatWhaleAlert(tx, network) {
  // const value = network === 'Ethereum' ? formatEther(tx.value) : formatSol(tx.value);
  const value = network === "Ethereum";
  const explorerUrl =
    network === "Ethereum"
      ? `https://etherscan.io/tx/${tx.hash}`
      : `https://solscan.io/tx/${tx.hash}`;

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(`🐋 ${network} Whale Alert!`)
    .setURL(explorerUrl)
    .addFields(
      { name: "From", value: shortAddress(tx.from), inline: true },
      { name: "To", value: shortAddress(tx.to), inline: true },
      { name: "Amount", value: `${value} ${network}`, inline: true },
      {
        name: "Value",
        value: `$${(tx.usdValue || 0).toLocaleString()}`,
        inline: true,
      }
    )
    .setTimestamp();

  return {
    content: `🐋 Big ${network} transaction detected!`,
    embeds: [embed],
  };
}

/**
 * Formats NFT floor price alerts
 * @param {Object} collection - NFT collection data
 * @param {Object} listing - The discounted listing
 * @param {number} discount - Discount percentage (0-1)
 * @returns {Promise<Object>} Discord message payload
 */
async function formatFloorAlert(collection, listing, discount) {
  const collectionData = await getNFTCollectionData(collection.slug);

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle(`📉 ${collection.name} Floor Alert`)
    .setDescription(`🚨 **${(discount * 100).toFixed(1)}% BELOW FLOOR** 🚨`)
    .addFields(
      {
        name: "Floor Price",
        value: `${collection.floorPrice} ETH`,
        inline: true,
      },
      { name: "Listing Price", value: `${listing.price} ETH`, inline: true },
      {
        name: "Discount",
        value: `${(discount * 100).toFixed(1)}%`,
        inline: true,
      },
      { name: "Seller", value: shortAddress(listing.seller), inline: false }
    )
    .setImage(collectionData.image)
    .setTimestamp();

  return {
    content: `📉 **${collection.name}** listing ${(discount * 100).toFixed(
      1
    )}% below floor!`,
    embeds: [embed],
  };
}

/**
 * Formats NFT mint alerts
 * @param {Object} mint - Upcoming mint data
 * @returns {Object} Discord message payload
 */
function formatMintAlert(mint) {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🎨 New Mint: ${mint.name}`)
    .setURL(mint.mintUrl)
    .addFields(
      {
        name: "Mint Price",
        value: `${mint.price} ${mint.currency}`,
        inline: true,
      },
      { name: "Mint Date", value: mint.date, inline: true },
      { name: "Supply", value: mint.supply.toString(), inline: true },
      { name: "Platform", value: mint.platform, inline: false }
    )
    .setImage(mint.image)
    .setTimestamp();

  return {
    content: `🎨 New mint alert: ${mint.name}`,
    embeds: [embed],
  };
}

/**
 * Formats snipe execution alerts
 * @param {Object} snipe - Snipe transaction data
 * @param {string} type - 'NFT' or 'Token'
 * @returns {Object} Discord message payload
 */
function formatSnipeAlert(snipe, type) {
  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle(`🎯 ${type} Snipe Executed!`)
    .addFields(
      { name: "Asset", value: snipe.name || snipe.symbol, inline: true },
      { name: "Price", value: snipe.price, inline: true },
      { name: "TX Hash", value: snipe.txHash, inline: false }
    )
    .setTimestamp();

  return {
    content: `🎯 ${type} snipe executed!`,
    embeds: [embed],
  };
}

// Helper functions
function shortAddress(address, chars = 6) {
  if (!address) return "N/A";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function fallbackTokenAlert(tokenData) {
  return {
    content: `🚀 New token detected: ${tokenData.name} (${tokenData.symbol})`,
    embeds: [
      {
        description: `[View on Pump.fun](https://pump.fun/${tokenData.mint})`,
      },
    ],
  };
}

module.exports = {
  formatTokenAlert,
  formatWhaleAlert,
  formatFloorAlert,
  formatMintAlert,
  formatSnipeAlert,
  shortAddress,
};
