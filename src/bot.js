import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  time,
} from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID; // optional for faster dev command sync

// --- Simple JSON storage for warnings
const dataDir = path.resolve('data');
const infFile = path.join(dataDir, 'infractions.json');
function loadInfractions() {
  try { return JSON.parse(fs.readFileSync(infFile, 'utf8')); }
  catch { return {}; }
}
function saveInfractions(obj) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(infFile, JSON.stringify(obj, null, 2));
}

// --- Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,  // required for moderation actions
    GatewayIntentBits.GuildMessages,
  ],
});

// --- Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is alive.'),

  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete recent messages in this channel.')
    .addIntegerOption(o =>
      o.setName('amount')
       .setDescription('How many messages to delete (1-200)')
       .setRequired(true)
       .setMinValue(1)
       .setMaxValue(200)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member.')
    .addUserOption(o => o.setName('member').setDescription('Member to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member.')
    .addUserOption(o => o.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member for X minutes (max 10080 = 7 days).')
    .addUserOption(o => o.setName('member').setDescription('Member to timeout').setRequired(true))
    .addIntegerOption(o =>
      o.setName('minutes').setDescription('Duration (1-10080)').setRequired(true).setMinValue(1).setMaxValue(10080)
    )
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('role_add')
    .setDescription('Add a role to a member.')
    .addUserOption(o => o.setName('member').setDescription('Member').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('role_remove')
    .setDescription('Remove a role from a member.')
    .addUserOption(o => o.setName('member').setDescription('Member').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member (saved).')
    .addUserOption(o => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('infractions')
    .setDescription("Show a member's last 10 warnings.")
    .addUserOption(o => o.setName('member').setDescription('Member').setRequired(true))
].map(c => c.toJSON());

// --- Register commands (guild if provided, otherwise global)
async function registerCommands() {
  const appId = client.application.id;
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  if (GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(appId, GUILD_ID),
      { body: commands }
    );
    console.log(`🔁 Registered guild commands for ${GUILD_ID}`);
  } else {
    await rest.put(
      Routes.applicationCommands(appId),
      { body: commands }
    );
    console.log('🌐 Registered global commands (can take up to ~1 hour to appear).');
  }
}

// --- Ready
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag} (${client.user.id})`);
  try {
    // Ensure application is fetched so client.application.id exists
    if (!client.application?.id) await client.application?.fetch();
    await registerCommands();
  } catch (err) {
    console.error('Command registration failed:', err);
  }
});

// --- Interaction handling
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const name = interaction.commandName;

  try {
    if (name === 'ping') {
      return interaction.reply({ content: `Pong! ${Math.round(client.ws.ping)}ms` });
    }

    if (name === 'purge') {
      const amount = interaction.options.getInteger('amount', true);
      await interaction.deferReply({ ephemeral: true });
      const deleted = await interaction.channel.bulkDelete(amount, true);
      return interaction.editReply(`🧹 Deleted ${deleted.size} message(s).`);
    }

    if (name === 'kick') {
      const member = await interaction.guild.members.fetch(interaction.options.getUser('member', true).id);
      const reason = interaction.options.getString('reason') ?? `Kicked by ${interaction.user.tag}`;
      await member.kick(reason);
      return interaction.reply(`👢 Kicked ${member.user.tag}. Reason: ${reason}`);
    }

    if (name === 'ban') {
      const member = await interaction.guild.members.fetch(interaction.options.getUser('member', true).id);
      const reason = interaction.options.getString('reason') ?? `Banned by ${interaction.user.tag}`;
      await member.ban({ reason });
      return interaction.reply(`⛔ Banned ${member.user.tag}. Reason: ${reason}`);
    }

    if (name === 'timeout') {
      const member = await interaction.guild.members.fetch(interaction.options.getUser('member', true).id);
      const minutes = interaction.options.getInteger('minutes', true);
      const reason = interaction.options.getString('reason') ?? `Timeout by ${interaction.user.tag}`;
      const ms = minutes * 60 * 1000;
      if (!member.moderatable)
        return interaction.reply({ content: "I can't timeout that member (role hierarchy).", ephemeral: true });
      await member.timeout(ms, reason);
      const until = new Date(Date.now() + ms);
      return interaction.reply(`⏱️ Timed out <@${member.id}> for ${minutes} minute(s) (until ${time(until, 'R')}).`);
    }

    if (name === 'role_add' || name === 'role_remove') {
      const member = await interaction.guild.members.fetch(interaction.options.getUser('member', true).id);
      const role = interaction.options.getRole('role', true);

      if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return interaction.reply({ content: 'I need **Manage Roles** permission.', ephemeral: true });

      if (name === 'role_add') {
        await member.roles.add(role, `Role add by ${interaction.user.tag}`);
        return interaction.reply(`✅ Added ${role} to ${member}.`);
      } else {
        await member.roles.remove(role, `Role remove by ${interaction.user.tag}`);
        return interaction.reply(`♻️ Removed ${role} from ${member}.`);
      }
    }

    if (name === 'warn') {
      const user = interaction.options.getUser('member', true);
      const reason = interaction.options.getString('reason', true);
      const store = loadInfractions();
      const key = user.id;
      store[key] = store[key] || [];
      store[key].push({ reason, mod: interaction.user.id, ts: Date.now() });
      saveInfractions(store);
      return interaction.reply(`⚠️ Warned <@${user.id}>: ${reason}`);
    }

    if (name === 'infractions') {
      const user = interaction.options.getUser('member', true);
      const store = loadInfractions();
      const list = (store[user.id] || []).slice(-10);
      if (!list.length) return interaction.reply(`✅ <@${user.id}> has no recorded warnings.`);
      const lines = list.map((w, i) => {
        const when = time(new Date(w.ts), 'F');
        return `${i + 1}. ${w.reason} — <@${w.mod}> on ${when}`;
      });
      return interaction.reply(`📒 Last ${lines.length} infractions for <@${user.id}>:\n${lines.join('\n')}`);
    }
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content: `Error: ${err.message}`, ephemeral: true });
    } else {
      return interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    }
  }
});

// --- Start
if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in environment.');
  process.exit(1);
}
client.login(TOKEN);

