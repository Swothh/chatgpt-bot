import { ClientEvents } from 'discord.js';
import Bot from '../client';

export interface IEvent {
    name: keyof ClientEvents;
    type: 'on' | 'once';
    run: (client: Bot, ...args: any) => Promise<any> | any;
};