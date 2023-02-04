import { config } from 'dotenv';
import Bot from './client';
import 'advanced-logs';

config();
const bot = new Bot();
bot.init();