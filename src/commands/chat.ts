import { ICommand } from '@/interfaces';

export const Command: ICommand = {
    name: 'chat',
    description: 'Chat with ChatGPT bot in discord.',
    options: [
        {
            type: 3,
            name: 'message',
            description: 'The message to send to ChatGPT bot.',
            required: true
        },
        {
            type: 5,
            name: 'clear',
            description: 'Clear the chat history.'
        }
    ],
    run: async (client, interaction) => {
        await interaction.deferReply();
        const message = interaction.options.getString('message');
        const clear = interaction.options.getBoolean('clear');
        let timed_out = false;
        
        if (clear === true) client.chats.delete(interaction.user.id);
        if (client.waiting.has(interaction.user.id)) return interaction.followUp('You already send a message. Please wait for the response.');
        const [ conversationId, parentMessageId ] = client.chats.get(interaction.user.id) ?? [];
        client.waiting.set(interaction.user.id, true);

        const timeout = setTimeout(() => {
            timed_out = true;
            client.waiting.delete(interaction.user.id);
            interaction.followUp('Request timed out.').catch(() => {});
        }, 60000);

        const response = await client.api.sendMessage(message, {
            conversationId,
            parentMessageId
        });

        if (!timed_out) {
            client.waiting.delete(interaction.user.id);
            clearTimeout(timeout);

            client.chats.set(interaction.user.id, [
                response.conversationId, 
                response.id
            ]);
    
            interaction.followUp(response.text ?? 'N/A');
        };
    }
};