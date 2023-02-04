import { ChatInputCommandInteraction } from 'discord.js';
import Bot from '../client';

interface IOption {
    type: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
    name: string;
    description: string;
    required?: boolean;
    options?: IOption[];
};

export interface ICommand {
    name: string;
    description: string;
    options?: IOption[],
    run: (client: Bot, interaction: ChatInputCommandInteraction) => Promise<any> | any;
};