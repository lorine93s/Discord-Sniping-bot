const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const Web3 = require('web3');
const axios = require('axios');
const { Alchemy, Network } = require('alchemy-sdk');

// Initialize connections
const solanaConnection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  { commitment: 'confirmed' }
);

const web3 = new Web3(
  process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com'
);

const alchemy = new Alchemy({
  apiKey: process.env.ALCHEMY_API_KEY,
  network: Network.ETH_MAINNET,
});

// Solana Utilities
const solanaUtils = {
  /**
   * Monitor Solana transactions in real-time
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
   * Get SOL balance for an address
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
   * Get token accounts for an address
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

// Ethereum Utilities
const ethereumUtils = {
  /**
   * Monitor Ethereum transactions in real-time
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
   * Get ETH balance for an address
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
   * Get token balances for an address
   * @param {string} address - Ethereum address
   * @returns {Promise<Array>} Token balances
   */
  getTokenBalances: async (address) => {
    try {
      const { tokens } = await alchemy.core.getTokenBalances(address);
      const withMetadata = await Promise.all(
        tokens.map(async (token) => {
          const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);
          return {
            ...token,
            name: metadata.name,
            symbol: metadata.symbol,
            decimals: metadata.decimals,
          };
        })
      );
      return withMetadata;
    } catch (error) {
      console.error('Error getting token balances:', error);
      return [];
    }
  },

  /**
   * Get current gas prices
   * @returns {Promise<Object>} Gas price data
   */
  getGasPrices: async () => {
    try {
      const [block, feeHistory] = await Promise.all([
        web3.eth.getBlock('latest'),
        web3.eth.getFeeHistory(4, 'latest', [25, 50, 75]),
      ]);

      const baseFee = block.baseFeePerGas;
      const priorityFees = {
        low: web3.utils.fromWei(feeHistory.reward[0][0], 'gwei'),
        medium: web3.utils.fromWei(feeHistory.reward[0][1], 'gwei'),
        high: web3.utils.fromWei(feeHistory.reward[0][2], 'gwei'),
      };

      return {
        baseFee: web3.utils.fromWei(baseFee, 'gwei'),
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
};

// NFT Utilities
const nftUtils = {
  /**
   * Monitor NFT floor prices
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
          `https://api.opensea.io/api/v1/collection/${collection}/stats`,
          {
            headers: { 'X-API-KEY': process.env.OPENSEA_API_KEY || '' },
          }
        );

        const currentFloor = parseFloat(response.data.stats.floor_price);
        if (currentFloor !== lastFloor) {
          callback({
            collection: response.data.collection.name,
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
   * Get NFT transactions for a collection
   * @param {string} contractAddress - NFT contract address
   * @param {number} limit - Maximum number of transactions to return
   * @returns {Promise<Array>} NFT transactions
   */
  getNFTTransactions: async (contractAddress, limit = 10) => {
    try {
      const response = await alchemy.nft.getNftSales({
        contractAddress,
        limit,
      });
      return response.nftSales;
    } catch (error) {
      console.error('Error getting NFT transactions:', error);
      return [];
    }
  },

  /**
   * Get NFT metadata
   * @param {string} contractAddress - NFT contract address
   * @param {string} tokenId - NFT token ID
   * @returns {Promise<Object>} NFT metadata
   */
  getNFTMetadata: async (contractAddress, tokenId) => {
    try {
      const response = await alchemy.nft.getNftMetadata(contractAddress, tokenId);
      return {
        name: response.title,
        image: response.media[0]?.gateway || '',
        attributes: response.metadata?.attributes || [],
        owner: response.owners[0] || '',
      };
    } catch (error) {
      console.error('Error getting NFT metadata:', error);
      return null;
    }
  },
};

// Token Sniper Utilities
const sniperUtils = {
  /**
   * Execute a token buy on Ethereum
   * @param {Object} params - Transaction parameters
   * @returns {Promise<string>} Transaction hash
   */
  executeEthereumBuy: async (params) => {
    try {
      const { privateKey, routerAddress, amountIn, amountOutMin, path, to, deadline } = params;
      const account = web3.eth.accounts.privateKeyToAccount(privateKey);
      web3.eth.accounts.wallet.add(account);

      const routerContract = new web3.eth.Contract(
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
      const gasPrice = await web3.eth.getGasPrice();
      const data = tx.encodeABI();

      const signedTx = await web3.eth.accounts.signTransaction(
        {
          to: routerAddress,
          data,
          gas,
          gasPrice,
        },
        privateKey
      );

      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      return receipt.transactionHash;
    } catch (error) {
      console.error('Error executing Ethereum buy:', error);
      throw error;
    }
  },

  /**
   * Execute a token buy on Solana
   * @param {Object} params - Transaction parameters
   * @returns {Promise<string>} Transaction signature
   */
  executeSolanaBuy: async (params) => {
    try {
      const { payer, mintAddress, amount } = params;
      // Implementation would use @solana/web3.js and appropriate DEX SDK
      // This is a placeholder for actual implementation
      return 'simulated-tx-signature';
    } catch (error) {
      console.error('Error executing Solana buy:', error);
      throw error;
    }
  },
};

module.exports = {
  solana: solanaUtils,
  ethereum: ethereumUtils,
  nft: nftUtils,
  sniper: sniperUtils,
  connections: {
    solana: solanaConnection,
    web3,
    alchemy,
  },
};
