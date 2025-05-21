const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'tracker',
    type: 'hybrid',
    slashData: new SlashCommandBuilder()
        .setName('tracker')
        .setDescription('Control tracking services')
        .addSubcommand(sub => 
            sub.setName('start')
               .setDescription('Start a tracker')
               .addStringOption(opt =>
                   opt.setName('service')
                      .setDescription('Tracker to start')
                      .addChoices(
                          { name: 'Coins', value: 'coin' },
                          { name: 'Whales', value: 'whale' },
                          { name: 'NFT Floor', value: 'floor' }
                      )))
        .addSubcommand(sub =>
            sub.setName('stop')
               .setDescription('Stop a tracker')),
    prefix: 'tracker',
    messageTriggers: ['start tracker', 'stop tracker'],
    permissions: ['ADMINISTRATOR'],
    async execute(context, args, client, trackers) {
        // Implementation handles both slash and prefix commands
        let service, action;
        
        if (context.isChatInputCommand()) {
            action = context.options.getSubcommand();
            service = context.options.getString('service');
        } else {
            action = args[0]?.toLowerCase();
            service = args[1]?.toLowerCase();
        }
        
        console.log('service, action', service, action);
        if (!trackers[service]) {
            return context.reply({ 
                content: 'Invalid tracker service!', 
                ephemeral: true 
            });
        }

        
        if (action === 'start') {
            trackers[service].start();
            context.reply(`Started ${service} tracker`);
        } else {
            trackers[service].stop();
            context.reply(`Stopped ${service} tracker`);
        }
    }
};