const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const Web3 = require('web3');
const axios = require('axios');

// Initialize connections with Ankr RPC endpoints
const solanaConnection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://rpc.ankr.com/solana',
  { commitment: 'confirmed' }
);

const web3 = new Web3(
  process.env.ETHEREUM_RPC_URL || 'https://rpc.ankr.com/eth'
);

// Configure Ankr endpoints for different chains
const ANKR_RPC_ENDPOINTS = {
  ethereum: 'https://rpc.ankr.com/eth',
  polygon: 'https://rpc.ankr.com/polygon',
  bsc: 'https://rpc.ankr.com/bsc',
  arbitrum: 'https://rpc.ankr.com/arbitrum',
  optimism: 'https://rpc.ankr.com/optimism',
  solana: 'https://rpc.ankr.com/solana'
};

// Initialize Web3 instances for different EVM chains
const evmProviders = {
  ethereum: new Web3(ANKR_RPC_ENDPOINTS.ethereum),
  polygon: new Web3(ANKR_RPC_ENDPOINTS.polygon),
  bsc: new Web3(ANKR_RPC_ENDPOINTS.bsc),
  arbitrum: new Web3(ANKR_RPC_ENDPOINTS.arbitrum),
  optimism: new Web3(ANKR_RPC_ENDPOINTS.optimism)
};

// ERC20 ABI for token interactions
const ERC20_ABI = [
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "symbol",
    "outputs": [{"name": "", "type": "string"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "name",
    "outputs": [{"name": "", "type": "string"}],
    "type": "function"
  }
];

// Solana Utilities
const solanaUtils = {
  /**
   * Monitor Solana transactions in real-time using Ankr
   * @param {function} callback - Function to call when new transactions are detected
   * @param {number} valueThreshold - Minimum value in SOL to trigger alerts
   * @returns {function} Unsubscribe function
   */
  monitorTransactions: (callback, valueThreshold = 10) => {
    let subscriptionId;

    const subscribe = async () => {
      subscriptionId = solanaConnection.onProgramAccountChange(
        new PublicKey('11111111111111111111111111111111'), // System program
        async (accountInfo) => {
          try {
            const tx = await solanaConnection.getTransaction(accountInfo.txId);
            const value = tx.meta?.postBalances[1] - tx.meta?.preBalances[1];
            const solAmount = value / LAMPORTS_PER_SOL;

            if (solAmount >= valueThreshold) {
              callback({
                hash: accountInfo.txId,
                from: tx.transaction.message.accountKeys[0].toString(),
                to: tx.transaction.message.accountKeys[1].toString(),
                value: solAmount,
                timestamp: new Date(),
              });
            }
          } catch (error) {
            console.error('Error processing Solana transaction:', error);
          }
        },
        'confirmed'
      );
    };

    subscribe();
    return () => solanaConnection.removeProgramAccountChangeListener(subscriptionId);
  },

  /**
   * Get SOL balance for an address using Ankr
   * @param {string} publicKey - Solana public key
   * @returns {Promise<number>} Balance in SOL
   */
  getBalance: async (publicKey) => {
    try {
      const balance = await solanaConnection.getBalance(new PublicKey(publicKey));
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error getting Solana balance:', error);
      return 0;
    }
  },

  /**
   * Get token accounts for an address using Ankr
   * @param {string} publicKey - Solana public key
   * @returns {Promise<Array>} Token accounts
   */
  getTokenAccounts: async (publicKey) => {
    try {
      const accounts = await solanaConnection.getParsedTokenAccountsByOwner(
        new PublicKey(publicKey),
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );
      return accounts.value.map(account => ({
        mint: account.account.data.parsed.info.mint,
        amount: account.account.data.parsed.info.tokenAmount.uiAmount,
      }));
    } catch (error) {
      console.error('Error getting token accounts:', error);
      return [];
    }
  },
};

// Ethereum Utilities with Ankr
const ethereumUtils = {
  /**
   * Monitor Ethereum transactions in real-time using Ankr
   * @param {function} callback - Function to call when new transactions are detected
   * @param {number} valueThreshold - Minimum value in ETH to trigger alerts
   * @returns {function} Unsubscribe function
   */
  monitorTransactions: async (callback, valueThreshold = 1) => {
    const subscription = web3.eth.subscribe('pendingTransactions', (error) => {
      if (error) console.error('Error subscribing to pending transactions:', error);
    });

    subscription.on('data', async (txHash) => {
      try {
        const tx = await web3.eth.getTransaction(txHash);
        if (tx && tx.value) {
          const ethValue = web3.utils.fromWei(tx.value, 'ether');
          if (parseFloat(ethValue) >= valueThreshold) {
            const receipt = await web3.eth.getTransactionReceipt(txHash);
            callback({
              hash: txHash,
              from: tx.from,
              to: tx.to || receipt.contractAddress || 'Contract Creation',
              value: ethValue,
              timestamp: new Date(),
            });
          }
        }
      } catch (error) {
        console.error('Error processing Ethereum transaction:', error);
      }
    });

    return () => subscription.unsubscribe();
  },

  /**
   * Get ETH balance for an address using Ankr
   * @param {string} address - Ethereum address
   * @returns {Promise<number>} Balance in ETH
   */
  getBalance: async (address) => {
    try {
      const balance = await web3.eth.getBalance(address);
      return web3.utils.fromWei(balance, 'ether');
    } catch (error) {
      console.error('Error getting Ethereum balance:', error);
      return 0;
    }
  },

  /**
   * Get token balances for an address using Ankr
   * @param {string} address - Ethereum address
   * @param {string} chain - Chain identifier (ethereum, polygon, bsc, etc.)
   * @returns {Promise<Array>} Token balances
   */
  getTokenBalances: async (address, chain = 'ethereum') => {
    try {
      const provider = evmProviders[chain] || web3;
      const response = await axios.post(ANKR_RPC_ENDPOINTS[chain] || ANKR_RPC_ENDPOINTS.ethereum, {
        jsonrpc: "2.0",
        method: "ankr_getAccountBalance",
        params: {
          walletAddress: address,
          blockchain: chain === 'bsc' ? 'bsc' : chain,
          onlyWhitelisted: false
        },
        id: 1
      });

      const tokens = response.data.result.assets;
      return tokens.map(token => ({
        contractAddress: token.contractAddress,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        balance: token.balance,
        balanceUsd: token.balanceUsd
      }));
    } catch (error) {
      console.error('Error getting token balances:', error);
      return [];
    }
  },

  /**
   * Get current gas prices using Ankr
   * @param {string} chain - Chain identifier (ethereum, polygon, bsc, etc.)
   * @returns {Promise<Object>} Gas price data
   */
  getGasPrices: async (chain = 'ethereum') => {
    try {
      const provider = evmProviders[chain] || web3;
      const [block, feeHistory] = await Promise.all([
        provider.eth.getBlock('latest'),
        provider.eth.getFeeHistory(4, 'latest', [25, 50, 75]),
      ]);

      const baseFee = block.baseFeePerGas;
      const priorityFees = {
        low: provider.utils.fromWei(feeHistory.reward[0][0], 'gwei'),
        medium: provider.utils.fromWei(feeHistory.reward[0][1], 'gwei'),
        high: provider.utils.fromWei(feeHistory.reward[0][2], 'gwei'),
      };

      return {
        baseFee: provider.utils.fromWei(baseFee, 'gwei'),
        priorityFees,
        estimated: {
          low: Math.round(parseFloat(baseFee) + parseFloat(priorityFees.low)),
          medium: Math.round(parseFloat(baseFee) + parseFloat(priorityFees.medium)),
          high: Math.round(parseFloat(baseFee) + parseFloat(priorityFees.high)),
        },
      };
    } catch (error) {
      console.error('Error getting gas prices:', error);
      return null;
    }
  },

  /**
   * Get token metadata using Ankr
   * @param {string} contractAddress - Token contract address
   * @param {string} chain - Chain identifier (ethereum, polygon, bsc, etc.)
   * @returns {Promise<Object>} Token metadata
   */
  getTokenMetadata: async (contractAddress, chain = 'ethereum') => {
    try {
      const response = await axios.post(ANKR_RPC_ENDPOINTS[chain] || ANKR_RPC_ENDPOINTS.ethereum, {
        jsonrpc: "2.0",
        method: "ankr_getTokenMetadata",
        params: {
          contractAddress,
          blockchain: chain === 'bsc' ? 'bsc' : chain
        },
        id: 1
      });

      return response.data.result;
    } catch (error) {
      console.error('Error getting token metadata:', error);
      return null;
    }
  }
};

// NFT Utilities with Ankr
const nftUtils = {
  /**
   * Monitor NFT floor prices using Ankr
   * @param {string} collection - Collection contract address or slug
   * @param {function} callback - Function to call when floor price changes
   * @param {number} interval - Polling interval in seconds
   * @returns {function} Clear interval function
   */
  monitorFloorPrice: (collection, callback, interval = 60) => {
    let lastFloor = 0;

    const checkFloor = async () => {
      try {
        const response = await axios.get(
          `https://api.ankr.com/api/v1/nft/collections/${collection}/stats`,
          {
            headers: { 'Authorization': `Bearer ${process.env.ANKR_API_KEY || ''}` },
          }
        );

        const currentFloor = parseFloat(response.data.floorPrice);
        if (currentFloor !== lastFloor) {
          callback({
            collection: response.data.collectionName,
            floorPrice: currentFloor,
            change: lastFloor ? ((currentFloor - lastFloor) / lastFloor) * 100 : 0,
          });
          lastFloor = currentFloor;
        }
      } catch (error) {
        console.error('Error checking floor price:', error);
      }
    };

    checkFloor();
    const intervalId = setInterval(checkFloor, interval * 1000);
    return () => clearInterval(intervalId);
  },

  /**
   * Get NFT transactions for a collection using Ankr
   * @param {string} contractAddress - NFT contract address
   * @param {number} limit - Maximum number of transactions to return
   * @param {string} chain - Chain identifier (ethereum, polygon, bsc, etc.)
   * @returns {Promise<Array>} NFT transactions
   */
  getNFTTransactions: async (contractAddress, limit = 10, chain = 'ethereum') => {
    try {
      const response = await axios.post(ANKR_RPC_ENDPOINTS[chain] || ANKR_RPC_ENDPOINTS.ethereum, {
        jsonrpc: "2.0",
        method: "ankr_getNFTTransfers",
        params: {
          contractAddress,
          blockchain: chain === 'bsc' ? 'bsc' : chain,
          limit
        },
        id: 1
      });

      return response.data.result.transfers;
    } catch (error) {
      console.error('Error getting NFT transactions:', error);
      return [];
    }
  },

  /**
   * Get NFT metadata using Ankr
   * @param {string} contractAddress - NFT contract address
   * @param {string} tokenId - NFT token ID
   * @param {string} chain - Chain identifier (ethereum, polygon, bsc, etc.)
   * @returns {Promise<Object>} NFT metadata
   */
  getNFTMetadata: async (contractAddress, tokenId, chain = 'ethereum') => {
    try {
      const response = await axios.post(ANKR_RPC_ENDPOINTS[chain] || ANKR_RPC_ENDPOINTS.ethereum, {
        jsonrpc: "2.0",
        method: "ankr_getNFTMetadata",
        params: {
          contractAddress,
          tokenId,
          blockchain: chain === 'bsc' ? 'bsc' : chain
        },
        id: 1
      });

      return response.data.result;
    } catch (error) {
      console.error('Error getting NFT metadata:', error);
      return null;
    }
  }
};

// Token Sniper Utilities with Ankr
const sniperUtils = {
  /**
   * Execute a token buy on Ethereum using Ankr
   * @param {Object} params - Transaction parameters
   * @param {string} chain - Chain identifier (ethereum, polygon, bsc, etc.)
   * @returns {Promise<string>} Transaction hash
   */
  executeEthereumBuy: async (params, chain = 'ethereum') => {
    try {
      const { privateKey, routerAddress, amountIn, amountOutMin, path, to, deadline } = params;
      const provider = evmProviders[chain] || web3;
      const account = provider.eth.accounts.privateKeyToAccount(privateKey);
      provider.eth.accounts.wallet.add(account);

      const routerContract = new provider.eth.Contract(
        [
          {
            inputs: [
              { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
              { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
              { internalType: 'address[]', name: 'path', type: 'address[]' },
              { internalType: 'address', name: 'to', type: 'address' },
              { internalType: 'uint256', name: 'deadline', type: 'uint256' },
            ],
            name: 'swapExactTokensForTokens',
            outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ],
        routerAddress
      );

      const tx = routerContract.methods.swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        to,
        deadline
      );

      const gas = await tx.estimateGas({ from: account.address });
      const gasPrice = await provider.eth.getGasPrice();
      const data = tx.encodeABI();

      const signedTx = await provider.eth.accounts.signTransaction(
        {
          to: routerAddress,
          data,
          gas,
          gasPrice,
        },
        privateKey
      );

      const receipt = await provider.eth.sendSignedTransaction(signedTx.rawTransaction);
      return receipt.transactionHash;
    } catch (error) {
      console.error('Error executing Ethereum buy:', error);
      throw error;
    }
  },

  /**
   * Execute a token buy on Solana using Ankr
   * @param {Object} params - Transaction parameters
   * @returns {Promise<string>} Transaction signature
   */
  executeSolanaBuy: async (params) => {
    try {
      const { payer, mintAddress, amount } = params;
      // Implementation would use @solana/web3.js and Ankr RPC
      // This is a placeholder for actual implementation
      return 'simulated-tx-signature';
    } catch (error) {
      console.error('Error executing Solana buy:', error);
      throw error;
    }
  }
};

module.exports = {
  solana: solanaUtils,
  ethereum: ethereumUtils,
  nft: nftUtils,
  sniper: sniperUtils,
  connections: {
    solana: solanaConnection,
    web3,
    evmProviders
  },
  ANKR_RPC_ENDPOINTS
};