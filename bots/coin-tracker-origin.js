require('dotenv').config();
const WebSocket = require('ws');
const { WebhookClient } = require('discord.js');
const axios = require('axios');
const https = require('https');

// Initialize webhook client
if (!process.env.DISCORD_WEBHOOK_URL) {
    console.error('ERROR: DISCORD_WEBHOOK_URL is not defined in .env file');
    process.exit(1);
}

const webhookClient = new WebhookClient({ 
    url: process.env.DISCORD_WEBHOOK_URL
});

// Connect to Pump.fun WebSocket
const ws = new WebSocket('wss://pumpportal.fun/api/data');

// Caches
const seenTokens = new Set();
const metadataCache = new Map();

// Helper functions
function shortAddress(address, chars = 6) {
    if (!address) return 'N/A';
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getFallbackMetadata() {
    return {
        name: '',
        description: 'Metadata unavailable',
        image: 'https://solana.com/src/img/branding/solanaLogoMark.svg',
        attributes: [],
        socials: {}
    };
}

function extractSocialLinks(metadata) {
    const socials = {};
    
    // Check for standard social links in attributes
    if (metadata.attributes) {
        for (const attr of metadata.attributes) {
            if (attr.trait_type && attr.value) {
                const lowerType = attr.trait_type.toLowerCase();
                if (lowerType.includes('twitter')) {
                    socials.twitter = attr.value.startsWith('http') ? attr.value : `https://twitter.com/${attr.value.replace('@', '')}`;
                } else if (lowerType.includes('website') || lowerType.includes('url')) {
                    socials.website = attr.value.startsWith('http') ? attr.value : `https://${attr.value}`;
                } else if (lowerType.includes('telegram')) {
                    socials.telegram = attr.value.startsWith('http') ? attr.value : `https://t.me/${attr.value.replace('@', '')}`;
                }
            }
        }
    }
    
    // Check description for social links
    if (metadata.description) {
        const desc = metadata.description.toLowerCase();
        const twitterMatch = desc.match(/(twitter\.com\/[a-z0-9_]+|@[a-z0-9_]+)/i);
        const telegramMatch = desc.match(/(t\.me\/[a-z0-9_]+|@[a-z0-9_]+)/i);
        const websiteMatch = desc.match(/(https?:\/\/[^\s]+)/i);
        
        if (twitterMatch && !socials.twitter) {
            socials.twitter = twitterMatch[0].startsWith('@') 
                ? `https://twitter.com/${twitterMatch[0].replace('@', '')}`
                : `https://${twitterMatch[0]}`;
        }
        if (telegramMatch && !socials.telegram) {
            socials.telegram = telegramMatch[0].startsWith('@')
                ? `https://t.me/${telegramMatch[0].replace('@', '')}`
                : `https://${telegramMatch[0]}`;
        }
        if (websiteMatch && !socials.website) {
            socials.website = websiteMatch[0];
        }
    }
    
    return socials;
}

async function fetchWithRetry(uri, retries = 3) {
    try {
        const response = await axios.get(uri, {
            timeout: 5000,
            httpsAgent: new https.Agent({  
                rejectUnauthorized: false
            }),
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        const metadata = {
            name: response.data.name || '',
            description: response.data.description,
            image: response.data.image || response.data.image_url || 'https://solana.com/src/img/branding/solanaLogoMark.svg',
            attributes: response.data.attributes || [],
            socials: extractSocialLinks(response.data)
        };

        return metadata;
    } catch (error) {
        if (retries > 0) {
            await sleep(1000);
            return fetchWithRetry(uri, retries - 1);
        }
        console.error(`Failed to fetch metadata after ${retries} retries (${uri}):`, error.message);
        return getFallbackMetadata();
    }
}

async function getMetadata(uri) {
    if (!uri || !uri.startsWith('http')) {
        return getFallbackMetadata();
    }

    if (metadataCache.has(uri)) {
        return metadataCache.get(uri);
    }

    const metadata = await fetchWithRetry(uri);
    metadataCache.set(uri, metadata);
    return metadata;
}

async function getAlternativeMetadata(mintAddress) {
    try {
        const response = await axios.get(`https://api-mainnet.magiceden.io/v2/tokens/${mintAddress}`, {
            timeout: 3000
        });
        
        return {
            image: response.data.image,
            description: response.data.description || 'No description available',
            socials: extractSocialLinks(response.data)
        };
    } catch (error) {
        return null;
    }
}

function formatSocialLinks(socials) {
    const links = [];
    if (socials.twitter) links.push(`[Twitter](${socials.twitter})`);
    if (socials.telegram) links.push(`[Telegram](${socials.telegram})`);
    if (socials.website) links.push(`[Website](${socials.website})`);
    
    return links.length > 0 ? links.join(' • ') : 'No social links found';
}

async function sendTokenAlert(tokenData, metadata) {
    try {
        // Try alternative metadata source if primary failed
        if (!metadata.image.includes('solanaLogoMark')) {
            const altMetadata = await getAlternativeMetadata(tokenData.mint);
            if (altMetadata) {
                metadata = { ...metadata, ...altMetadata };
            }
        }

        const embed = {
            color: 0x00FF00,
            fields: [
            {
                name: '📜 Contract Address',
                value: `\`\`\`${tokenData.mint}\`\`\``, // Copyable contract address
                inline: false
            },
            {
                name: '👷 Creator',
                value: `[${tokenData.traderPublicKey}](https://solscan.io/account/${tokenData.traderPublicKey})`,
                inline: false
            },
            {
                name: '',
                value: metadata.socials.website ? `🌐[Website](${metadata.socials.website})` : '❌No Website',
                inline: true
            },
            {
                name: '',
                value: metadata.socials.twitter ? `[🐦Twitter](${metadata.socials.twitter})` : '❌No Twitter',
                inline: true
            },
            {
                name: '',
                value: metadata.socials.telegram ? `[📢 Telegram](${metadata.socials.telegram})` : '❌No Telegram',
                inline: true
            },
            {
                name: '🔗Links',
                value: `[DEV](https://magiceden.io/marketplace/${tokenData.mint}) ⋅ \
                        [PF](https://pump.fun/${tokenData.mint}) ⋅ \
                        [BLO](https://t.me/BloomSolana_bot?start=ref_LUNARFANG_ca_${tokenData.mint}) ⋅ \
                        [NEO](https://neo.bullx.io/terminal?chainId=1399811149&address=${tokenData.mint}) ⋅ \
                        [PHO](https://photon-sol.tinyastro.io/en/r/@lunarfang/${tokenData.mint}) ⋅ \
                        [TRO](https://t.me/solana_trojanbot?start=r-lunarfang_416-${tokenData.mint}) ⋅ \
                        [DEX](https://dexscreener.com/solana/${tokenData.mint}) ⋅ \
                        [RUG](https://rugcheck.xyz/tokens/${tokenData.mint})`,
                inline: true
            },
            {
                name: '🆕 New',
                value: `Boost your trades, frontrun the competition — [Bloom](https://t.me/BloomSolana_bot?start=ref_LUNARFANG)`,
                inline: false
            }
            ],
            thumbnail: {
            url: metadata.image
            },
            timestamp: new Date().toISOString(),
            footer: {
            text: 'Pump.fun Token Alert',
            icon_url: 'https://pump.fun/favicon.ico'
            }
        };

        await webhookClient.send({
            content: `🚦 [${tokenData.name}](https://pump.fun/${tokenData.mint}) - $${tokenData.symbol} \`@ALL PF Launches\``,
            embeds: [embed]
        });
    } catch (error) {
        console.error('Failed to send Discord alert:', error);
    }
}

// WebSocket event handlers
ws.on('open', () => {
    console.log('Connected to Pump.fun WebSocket');
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));
});

ws.on('message', async (data) => {
    try {
        const tokenData = JSON.parse(data.toString());
        
        if (seenTokens.has(tokenData.mint)) return;
        seenTokens.add(tokenData.mint);
        
        console.log(`New token detected: ${tokenData.name} (${tokenData.symbol})`);
        
        const metadata = await getMetadata(tokenData.uri);
        await sendTokenAlert(tokenData, metadata);
    } catch (error) {
        console.error('Error processing token:', error);
    }
});

ws.on('error', (error) => {
    console.error('WebSocket error:', error);
});

ws.on('close', () => {
    console.log('WebSocket disconnected - attempting to reconnect in 5 seconds...');
    setTimeout(() => {
        new WebSocket('wss://pumpportal.fun/api/data');
    }, 5000);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});