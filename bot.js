require("dotenv").config();
const {
  Client,
  Collection,
  GatewayIntentBits,
  REST,
  MessageFlags,
  Routes,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// Import all tracker bots
const CoinTracker = require("./trackers/coin-tracker");
const getInfobyCA = require("./commands/message/getInfobyCA");
const WhaleTracker = require('../trackers/whale-tracker');
const NFTSniper = require('../trackers/nft-sniper');
const CoinSniper = require('../trackers/coin-sniper');
const NFTFloorScanner = require('../trackers/nft-floor-scanner');
const NFTMintScanner = require('../trackers/nft-mint-scanner');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// Command collections
// Initialize collections
client.commands = {
  slash: new Collection(),
  prefix: new Collection(),
  message: new Collection(),
  hybrid: new Collection(),
};

const loadCommands = (type, directory) => {
  try {
    const commandsPath = path.join(__dirname, "commands", directory);
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".js"));

    console.log(`Loading ${type} commands from: ${commandsPath}`); // Debug log

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);

      // Validate the command
      if (!command) {
        console.error(`⚠️ Command file ${file} didn't export anything`);
        continue;
      }

      if (!command.name) {
        console.error(`⚠️ Command ${file} is missing 'name' property`);
        continue;
      }

      // Ensure the collection exists
      if (!client.commands[type]) {
        throw new Error(`❌ client.commands.${type} is not a Collection`);
      }

      console.log(`✓ Loading command: ${command.name}`); // Debug log
      client.commands[type].set(command.name, command);
    }
  } catch (error) {
    console.error(`‼️ Failed to load ${type} commands:`, error);
  }
};

// Initialize all trackers
const trackers = {
  coin: new CoinTracker(),
  whale: new WhaleTracker(),
  nftSniper: new NFTSniper(),
  coinSniper: new CoinSniper(),
  floorScanner: new NFTFloorScanner(),
  mintScanner: new NFTMintScanner()
};

// Deploy slash commands
const deploySlashCommands = async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  const slashCommands = [];
  // Load commands
  loadCommands("slash", "slash");
  loadCommands("prefix", "prefix");
  loadCommands("message", "message");
  loadCommands("hybrid", "hybrid");

  console.log(`commands------->`, client.commands);
  for (const [_, command] of client.commands.slash) {
    slashCommands.push(command.data.toJSON());
  }
  for (const [_, command] of client.commands.hybrid) {
    if (command.slashData) slashCommands.push(command.slashData.toJSON());
  }

  await rest
    .put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: slashCommands,
    })
    .then((data) =>
      console.log(
        `Successfully registered ${data.length} application commands.`
      )
    );
};

// Bot startup
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await deploySlashCommands();

  // Start all trackers
  Object.values(trackers).forEach((tracker) => tracker.start());
  console.log("All trackers initialized");
});

// Command handlers
client.on("interactionCreate", handleSlashCommand);
client.on("messageCreate", handleMessage);
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "copy_contract") {
    const contractAddress = interaction.message.embeds[0].fields
      .find((f) => f.name === "📝 Contract")
      .value.replace(/`/g, "");

    await interaction.reply({
      content: `Copied to clipboard: \`${contractAddress}\``,
      flags: MessageFlags.Ephemeral,
      // ephemeral: true,
    });
  } else if (interaction.customId === "copy_address") {
    const contractAddress = interaction.message.embeds[0].fields
      .find((f) => f.name === "📝 Contract")
      .value.replace(/`/g, "");
      // .value.match(/\*\*C\.A:\*\*\s\[([^\]]+)\]/)[1];

    await interaction.reply({
      content: `Copied to clipboard: \`${contractAddress}\``,
      flags: MessageFlags.Ephemeral,
      // ephemeral: true,
    });
  }
});

client.login(process.env.BOT_TOKEN);

async function handleSlashCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const command =
    client.commands.slash.get(interaction.commandName) ||
    client.commands.hybrid.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction, client, trackers);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "Command error!",
      ephemeral: true,
    });
  }
}

async function handleMessage(message) {
  // console.log(`message added--------------`, message.content);
  if (message.author.bot) return;
  // Handle prefix commands
  if (message.content.startsWith(process.env.PREFIX)) {
    const args = message.content
      .slice(process.env.PREFIX.length)
      .trim()
      .split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command =
      client.commands.prefix.get(commandName) ||
      client.commands.hybrid.get(commandName);

    if (command) {
      try {
        await command.execute(message, args, client, trackers);
      } catch (error) {
        console.error(error);
        message.reply("Command error!");
      }
      return;
    }
  }

  // Handle message triggers
  // for (const [_, command] of [...client.commands.message, ...client.commands.hybrid]) {
  //     const triggers = command.triggers || command.messageTriggers || [];
  //     if (triggers.some(t => message.content.toLowerCase().includes(t.toLowerCase()))) {
  //         try {

  console.log(`message----`, client.commands.message);
  let command;
  if (message.content.startsWith("$"))
    command = client.commands.message.get(`getTokenInfoByDollar`);
  else command = client.commands.message.get(`getInfobyCAfromRugcheck`);

  console.log(
    `commandMessage------------------------------------`,
    message.content
  );
  if (command) {
    try {
      await command.execute(message, client, trackers);
    } catch (error) {
      console.error(error);

      message.reply("Command error!");
    }
    return;
  }
}
