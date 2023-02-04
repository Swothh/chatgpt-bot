import { Client, IntentsBitField, Collection, REST, Routes } from 'discord.js';
import { ICommand, IEvent } from '../interfaces';
import { ChatGPTAPI } from '../lib';
import { glob } from 'glob';
import { join } from 'path';

export default class Bot extends Client {
    public readonly api = new ChatGPTAPI({ apiKey: process.env.OPENAI_API_KEY });
    public readonly chats = new Collection<string, [ string, string ]>();
    public readonly commands = new Collection<string, ICommand>();
    public readonly waiting = new Collection<string, boolean>();

    constructor() {
        super({
            intents: [
                IntentsBitField.Flags.Guilds,
                IntentsBitField.Flags.GuildMembers
            ]
        });
    };

    public async init(): Promise<void> {
        this.loadCommands().loadEvents().login(process.env.DISCORD_TOKEN).then(() => {
            console.success(`Connected to Discord as ${this.user?.tag}.`);
            this.postCommands();
        });
    };

    public postCommands(): Bot {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        console.info('Started loading application (/) commands...');

        rest.put(Routes.applicationCommands(this.user.id), {
            body: this.commands.toJSON()
        }).then(() => {
            console.success(`Successfully loaded [${this.commands.size}] application (/) commands.`);
        }).catch(err => {
            console.error(err);
            process.exit(1);
        });

        return this;
    };

    public loadCommands(): Bot {
        glob('**/*.ts', { cwd: join(__dirname, '../commands') }, (err, files) => {
            if (err) {
                console.error(err);
                process.exit(1);
            } else {
                files.forEach(async file => {
                    try {
                        const { Command }: { Command: ICommand } = await import(`../commands/${file}`);
                        if (this.commands.get(Command.name)) console.error(`Repeated command name. (name: ${Command.name}, file: ${file})`);
                        else this.commands.set(Command.name, Command);
                    } catch(err) {
                        console.error(err);
                    };
                });
            };
        });

        return this;
    };

    public loadEvents(): Bot {
        glob('**/*.ts', { cwd: join(__dirname, '../events') }, (err, files) => {
            if (err) {
                console.error(err);
                process.exit(1);
            } else {
                files.forEach(async file => {
                    try {
                        const { Event }: { Event: IEvent } = await import(`../events/${file}`);
                        this[Event.type](Event.name, Event.run.bind(null, this));
                    } catch(err) {
                        console.error(err);
                    };
                });
            };
        });

        return this;
    };
};