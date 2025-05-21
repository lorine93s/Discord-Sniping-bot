const axios = require('axios');
const https = require('https');
const { Connection, PublicKey } = require('@solana/web3.js');

// Configuration
const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-api.projectserum.com'
];
const PUMP_FUN_API = 'https://api.pump.fun';
const GOPLUS_API = 'https://api.gopluslabs.io/api/v1/token_security/56'; // Solana chain ID = 56

let activeConnection = null;

// ========================
// Enhanced API Functions
// ========================

async function initializeConnection() {
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const connection = new Connection(endpoint, 'confirmed');
      await connection.getSlot();
      console.log(`Connected to RPC: ${endpoint}`);
      activeConnection = connection;
      return connection;
    } catch (error) {
      console.error(`RPC connection failed (${endpoint}):`, error.message);
    }
  }
  throw new Error('All RPC endpoints failed');
}

async function fetchTokenData(mintAddress) {
  try {
    const [pumpFunData, onChainData, holders, goplusCheck] = await Promise.all([
      fetchFromPumpFun(mintAddress),
      fetchOnChainData(mintAddress),
      fetchHoldersAnalysis(mintAddress),
      checkRugRisk(mintAddress)
    ]);

    return {
      ...pumpFunData,
      ...onChainData,
      holders,
      security: goplusCheck
    };
  } catch (error) {
    console.error('Error fetching token data:', error.message);
    throw error;
  }
}

// ========================
// Holder Analysis (Enhanced)
// ========================
function calculateHolderDistributionRugCheck(tokenData) {
  // Extract top holders array or default to empty array

  const topHolders = tokenData.topHolders || [];
  if(topHolders.length === 0) return null; // No holders data available
  const totalSupply = tokenData.token?.supply || 0;
  const decimals = tokenData.token?.decimals || 0;
  
  // Calculate percentages for different groups
  const top5 = topHolders.slice(0, 5).reduce((sum, holder) => sum + (holder.pct || 0), 0.00);
  const top10 = topHolders.slice(0, 10).reduce((sum, holder) => sum + (holder.pct || 0), 0.00);
  const top20 = topHolders.slice(0, 20).reduce((sum, holder) => sum + (holder.pct || 0), 0.00);
  const top50 = topHolders.slice(0, 50).reduce((sum, holder) => sum + (holder.pct || 0), 0.00);
  
  // Get top 5 individual holders with their details
  const top5HoldersDetails = topHolders.slice(0, 5).map(holder => ({
      address: holder.address,
      owner: holder.owner,
      percentage: holder.pct || 0,
      amount: holder.amount / Math.pow(10, decimals),
      isInsider: holder.insider || false
  }));
  
  return {
      totalHolders: tokenData.totalHolders || 0,
      top5Percentage: top5 === 100.0000 ? 100 : top5.toFixed(4),
      top10Percentage: top10 === 100.0000 ? 100 : top10.toFixed(4),
      top20Percentage: top20 === 100.0000 ? 100 : top20.toFixed(4),
      top50Percentage: top50 === 100.0000 ? 100 : top50.toFixed(4),
      top5Holders: top5HoldersDetails,
      supplyConcentration: {
          // Measures how concentrated the supply is (1 = completely concentrated)
          giniCoefficient: calculateGiniCoefficient(topHolders),
          // Percentage held by single largest holder
          largestHolder: topHolders.length > 0 ? topHolders[0].pct || 0 : 0
      }
  };
}

// Helper function to calculate Gini coefficient (measure of inequality)
function calculateGiniCoefficient(holders) {
  if (!holders || holders.length === 0) return 0;
  
  // Sort holders by amount ascending
  const sorted = [...holders].sort((a, b) => (a.pct || 0) - (b.pct || 0));
  const n = sorted.length;
  let sum = 0;
  
  for (let i = 0; i < n; i++) {
      sum += (i + 1) * (sorted[i].pct || 0);
  }
  
  const gini = (2 * sum) / (n * sorted.reduce((a, b) => a + (b.pct || 0), 0)) - (n + 1) / n;
  return gini.toFixed(4);
}

async function fetchHoldersAnalysis(mintAddress) {
  try {
    const response = await axios.get(`${PUMP_FUN_API}/tokens/${mintAddress}/holders`);
    const holders = response.data.holders;
    const totalSupply = response.data.totalSupply;

    // Calculate holder concentration
    const top10 = holders.slice(0, 10).reduce((sum, h) => sum + h.amount, 0);
    const top50 = holders.slice(0, 50).reduce((sum, h) => sum + h.amount, 0);

    return {
      total: holders.length,
      top10Percent: ((top10 / totalSupply) * 100).toFixed(2),
      top50Percent: ((top50 / totalSupply) * 100).toFixed(2),
      concentrationRisk: calculateConcentrationRisk(top50 / totalSupply)
    };
  } catch (error) {
    console.error('Holder analysis failed:', error.message);
    return null;
  }
}

function calculateConcentrationRisk(top50Ratio) {
  if (top50Ratio > 0.8) return 'VERY HIGH';
  if (top50Ratio > 0.6) return 'HIGH';
  if (top50Ratio > 0.4) return 'MEDIUM';
  return 'LOW';
}

// ========================
// Rug Check (GoPlusLab Integration)
// ========================

async function checkRugRisk(mintAddress) {
  try {
    const response = await axios.get(`${GOPLUS_API}?contract_addresses=${mintAddress}`);
    const data = response.data.result[mintAddress.toLowerCase()];
    
    return {
      isProxy: data.is_proxy,
      mintable: data.is_mintable,
      antiWhale: data.anti_whale,
      canTakeBackOwnership: data.can_take_back_ownership,
      hiddenOwner: data.hidden_owner,
      tradingCooldown: data.trading_cooldown,
      riskScore: calculateRiskScore(data)
    };
  } catch (error) {
    console.error('GoPlusLab check failed:', error.message);
    return null;
  }
}

function calculateRiskScore(goplusData) {
  let score = 0;
  if (goplusData.is_proxy) score += 30;
  if (goplusData.is_mintable) score += 25;
  if (goplusData.hidden_owner) score += 20;
  if (goplusData.can_take_back_ownership) score += 15;
  return Math.min(score, 100);
}

// ========================
// URI Data Fetching (Fixed)
// ========================

async function fetchUriData(uri) {
  try {
    if (!uri) return null;
    
    // Handle IPFS URIs
    if (uri.startsWith('ipfs://')) {
      const cid = uri.replace('ipfs://', '');
      uri = `https://ipfs.io/ipfs/${cid}`;
    }

    const response = await axios.get(uri, { timeout: 10000 });
    return response.data;
  } catch (error) {
    console.error('URI fetch failed:', error.message);
    return null;
  }
}

// ========================
// Core Data Fetching
// ========================

async function fetchFromPumpFun(mintAddress) {
  const response = await axios.get(`${PUMP_FUN_API}/tokens/${mintAddress}`);
  return {
    name: response.data.name,
    symbol: response.data.symbol,
    price: response.data.price,
    liquidity: response.data.liquidity,
    marketCap: response.data.marketCap,
    creator: response.data.creator
  };
}

async function fetchOnChainData(mintAddress) {
  if (!activeConnection) await initializeConnection();
  
  const publicKey = new PublicKey(mintAddress);
  const [accountInfo, metadata, uriData] = await Promise.all([
    activeConnection.getAccountInfo(publicKey),
    fetchTokenMetadata(mintAddress),
    fetchUriData(metadata?.uri) // Fetch URI data if metadata exists
  ]);

  return {
    supply: await getTokenSupply(mintAddress),
    metadata,
    uriData
  };
}

// ========================
// Helper Functions
// ========================

async function getTokenSupply(mintAddress) {
  try {
    if (!activeConnection) await initializeConnection();
    const supply = await activeConnection.getTokenSupply(new PublicKey(mintAddress));
    return supply.value.amount;
  } catch (error) {
    console.error('Supply check failed:', error.message);
    return null;
  }
}

async function fetchTokenMetadata(mintAddress) {
  try {
    const metadataPDA = await PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
        new PublicKey(mintAddress).toBuffer()
      ],
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
    );

    const accountInfo = await activeConnection.getAccountInfo(metadataPDA[0]);
    if (!accountInfo) return null;

    const metadata = parseMetadata(accountInfo.data);
    return {
      ...metadata,
      uri: metadata.uri // Include URI for external data fetching
    };
  } catch (error) {
    console.error('Metadata fetch failed:', error.message);
    return null;
  }
}

function parseMetadata(buffer) {
  try {
    const data = buffer.toString('utf8');
    const jsonStart = data.indexOf('{');
    const jsonEnd = data.lastIndexOf('}') + 1;
    return JSON.parse(data.slice(jsonStart, jsonEnd));
  } catch {
    return {};
  }
}

module.exports = {
  initializeConnection,
  fetchTokenData,
  fetchHoldersAnalysis,
  calculateHolderDistributionRugCheck,
  checkRugRisk,
  fetchUriData
};

