# Crypto Bot - Discord Bot for Crypto and NFT Tracking  

## Project Structure  

```plaintext  
crypto-bot/  
├── main/  
│   ├── bot.js               # Main bot controller  
│   └── commands/            # All command types  
│       ├── slash/           # Slash commands  
│       ├── prefix/          # Prefix commands  
│       ├── message/         # Message triggers  
│       └── hybrid/          # Hybrid commands  
├── trackers/                # All tracker bots  
│   ├── coin-tracker.js      # Pump.fun new coins  
│   ├── whale-tracker.js     # ETH/SOL whale tracking  
│   ├── nft-sniper.js        # NFT sniper  
│   ├── coin-sniper.js       # Coin sniper  
│   ├── nft-floor-scanner.js # NFT floor price alerts  
│   └── nft-mint-scanner.js  # Upcoming NFT mints  
├── utils/                   # Shared utilities  
│   ├── web3.js              # Blockchain helpers  
│   ├── alerts.js            # Alert formatting  
│   └── api.js               # API helpers  
├── .env                     # Environment config  
└── package.json  
```  

## Key Features  

### Modular Architecture  
- Each tracker operates independently.  
- Shared utilities for common functions.  
- Easy to add new trackers.  

### Complete Command Support  
- **Slash commands**: `/tracker start coins`.  
- **Prefix commands**: `!tracker stop whale`.  
- **Message triggers**: `"start floor tracking"`.  

### Automatic Operation  
- Trackers start automatically with the main bot.  
- Can be individually controlled.  
- Dedicated webhook channels for each service.  

### Extensible Design  
- Add new trackers without modifying the core.  
- Configurable thresholds and settings.  
- Shared alert formatting for consistency.  

### Robust Error Handling  
- Automatic reconnection for WebSockets.  
- Error reporting to admin channels.  
- Graceful shutdown handling.  

## Adding New Trackers  
To implement additional trackers (e.g., NFT sniper, coin sniper, mint scanner):  
1. Follow the existing tracker patterns.  
2. Connect to the appropriate APIs.  
3. Format alerts for the specific purpose of the tracker.  

## Environment Configuration  
Ensure to configure the `.env` file with the required API keys and settings for seamless operation.  

## Installation  
1. Clone the repository:  
    ```bash  
    git clone <repository-url>  
    cd crypto-bot  
    ```  
2. Install dependencies:  
    ```bash  
    npm install  
    ```  
3. Configure the `.env` file.  

4. Start the bot:  
    ```bash  
    node main/bot.js  
    ```  

## License  
This project is licensed under the MIT License.  # Profile

## Contact
Email : kaycee69braungeu@hotmail.com
Telegram : https://t.me/@naruto9554



