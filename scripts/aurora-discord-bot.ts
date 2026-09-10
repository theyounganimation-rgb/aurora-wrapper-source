import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Attachment,
  type Message,
  type MessageCreateOptions
} from "discord.js";
import { recordConversationEvent } from "../lib/auroraCognition";
import { SendMessageError, sendMessage } from "../lib/auroraClient";

type ReplyMode = "dms_and_mentions" | "mentions_only" | "all_messages";

interface SessionStateRecord {
  previousResponseId?: string;
  sessionId: string;
  updatedAt: string;
}

interface SessionStateFile {
  conversations: Record<string, SessionStateRecord>;
}

interface ConversationScope {
  conversationKey: string;
  sessionId: string;
  ownerContinuity: boolean;
  partnerId?: string;
  speakerName?: string;
}

const DISCORD_MESSAGE_LIMIT = 2000;
const OWNER_UNIFIED_CONTINUITY_SESSION_ID = "agent:main:owner:continuity";
const DEFAULT_PROXY_URL = "http://127.0.0.1:3000/api/openclaw/send";
const DEFAULT_SESSION_PREFIX = "agent:main:discord";
const DEFAULT_STATE_PATH = ".aurora/discord-session-state.json";
const DEFAULT_REPLY_MODE: ReplyMode = "dms_and_mentions";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvConfig(projectRoot);

function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function parseCsvSet(value: string | undefined): Set<string> {
  return new Set(
    (value || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function asSingleLine(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function normalizeReplyMode(value: string | undefined): ReplyMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "mentions_only" || normalized === "all_messages" || normalized === "dms_and_mentions") {
    return normalized;
  }
  return DEFAULT_REPLY_MODE;
}

function buildBotConfig() {
  const token = envOrDefault(process.env.DISCORD_BOT_TOKEN, "");
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required.");
  }

  const proxyUrlText = envOrDefault(process.env.AURORA_DISCORD_PROXY_URL, DEFAULT_PROXY_URL);
  const proxyUrl = new URL(proxyUrlText).toString();
  return {
    token,
    proxyUrl,
    sessionPrefix: envOrDefault(process.env.AURORA_DISCORD_SESSION_PREFIX, DEFAULT_SESSION_PREFIX),
    statePath: path.resolve(projectRoot, envOrDefault(process.env.AURORA_DISCORD_STATE_PATH, DEFAULT_STATE_PATH)),
    replyMode: normalizeReplyMode(process.env.AURORA_DISCORD_REPLY_MODE),
    ownerUserId: envOrDefault(process.env.AURORA_DISCORD_OWNER_USER_ID, ""),
    allowedGuildIds: parseCsvSet(process.env.AURORA_DISCORD_ALLOWED_GUILD_IDS),
    allowedChannelIds: parseCsvSet(process.env.AURORA_DISCORD_ALLOWED_CHANNEL_IDS)
  };
}

function attachmentLine(attachment: Attachment, index: number): string {
  const name = attachment.name?.trim() || `attachment-${index + 1}`;
  return `Attachment ${index + 1} (${name}): ${attachment.url}`;
}

function splitDiscordMessage(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > DISCORD_MESSAGE_LIMIT) {
    const window = remaining.slice(0, DISCORD_MESSAGE_LIMIT);
    let cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(" "));

    if (cut < Math.floor(DISCORD_MESSAGE_LIMIT * 0.6)) {
      cut = DISCORD_MESSAGE_LIMIT;
    }

    const chunk = remaining.slice(0, cut).trimEnd();
    if (!chunk) {
      break;
    }

    chunks.push(chunk);
    remaining = remaining.slice(chunk.length).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

type SendCapableChannel = {
  send: (options: MessageCreateOptions) => Promise<unknown>;
};

type TypingCapableChannel = {
  sendTyping: () => Promise<unknown>;
};

function canSendMessages(channel: unknown): channel is SendCapableChannel {
  if (!channel || typeof channel !== "object" || !("send" in channel)) {
    return false;
  }
  const candidate = channel as { send?: unknown };
  return typeof candidate.send === "function";
}

function canSendTyping(channel: unknown): channel is TypingCapableChannel {
  if (!channel || typeof channel !== "object" || !("sendTyping" in channel)) {
    return false;
  }
  const candidate = channel as { sendTyping?: unknown };
  return typeof candidate.sendTyping === "function";
}

async function isReplyToBot(message: Message, botUserId: string): Promise<boolean> {
  if (!message.reference?.messageId) {
    return false;
  }

  try {
    const referenced = await message.fetchReference();
    return referenced.author.id === botUserId;
  } catch {
    return false;
  }
}

function stripBotMentions(text: string, botUserId: string): string {
  return text.replace(new RegExp(`<@!?${botUserId}>`, "g"), " ").replace(/\s+/g, " ").trim();
}

function speakerNameForMessage(message: Message): string | undefined {
  const guildDisplayName = "member" in message && message.member?.displayName ? message.member.displayName.trim() : "";
  const globalName = message.author.globalName?.trim() || "";
  const username = message.author.username.trim();
  return guildDisplayName || globalName || username || undefined;
}

function buildConversationScope(
  message: Message,
  ownerUserId: string,
  sessionPrefix: string
): ConversationScope {
  const ownerContinuity = Boolean(
    ownerUserId &&
      message.author.id === ownerUserId &&
      message.channel.isDMBased()
  );

  if (ownerContinuity) {
    return {
      conversationKey: `owner-dm:${message.channel.id}`,
      sessionId: OWNER_UNIFIED_CONTINUITY_SESSION_ID,
      ownerContinuity: true,
      speakerName: speakerNameForMessage(message)
    };
  }

  const speakerName = speakerNameForMessage(message);
  const partnerId = `discord:user:${message.author.id}`;

  if (message.channel.isDMBased()) {
    return {
      conversationKey: `dm:${message.channel.id}`,
      sessionId: `${sessionPrefix}:dm:${message.channel.id}`,
      ownerContinuity: false,
      partnerId,
      speakerName
    };
  }

  return {
    conversationKey: `guild:${message.guildId || "unknown"}:channel:${message.channel.id}`,
    sessionId: `${sessionPrefix}:guild:${message.guildId || "unknown"}:channel:${message.channel.id}`,
    ownerContinuity: false,
    partnerId,
    speakerName
  };
}

async function shouldHandleMessage(
  message: Message,
  botUserId: string,
  replyMode: ReplyMode,
  allowedGuildIds: Set<string>,
  allowedChannelIds: Set<string>
): Promise<boolean> {
  if (message.author.bot) {
    return false;
  }

  if (!message.content.trim() && message.attachments.size === 0) {
    return false;
  }

  if (!message.channel.isDMBased() && allowedGuildIds.size > 0) {
    if (!message.guildId || !allowedGuildIds.has(message.guildId)) {
      return false;
    }
  }

  if (!message.channel.isDMBased() && allowedChannelIds.size > 0 && !allowedChannelIds.has(message.channel.id)) {
    return false;
  }

  if (message.channel.isDMBased()) {
    return replyMode === "dms_and_mentions" || replyMode === "all_messages";
  }

  if (replyMode === "all_messages") {
    return true;
  }

  if (message.mentions.users.has(botUserId)) {
    return true;
  }

  return isReplyToBot(message, botUserId);
}

function buildPrompt(message: Message, botUserId: string): string {
  const baseText = stripBotMentions(message.content, botUserId);
  const attachmentLines = [...message.attachments.values()].map(attachmentLine);
  const parts = [baseText, attachmentLines.join("\n")].filter(Boolean);
  return parts.join("\n\n").trim();
}

async function sendDiscordReply(message: Message, text: string): Promise<void> {
  const chunks = splitDiscordMessage(text);
  if (chunks.length === 0) {
    return;
  }

  if (!canSendMessages(message.channel)) {
    return;
  }

  let first = true;
  for (const chunk of chunks) {
    const payload: MessageCreateOptions = {
      content: chunk,
      allowedMentions: {
        repliedUser: false
      }
    };

    if (first) {
      await message.reply(payload);
      first = false;
      continue;
    }

    await message.channel.send(payload);
  }
}

class DiscordSessionStore {
  private readonly state: SessionStateFile = { conversations: {} };
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<SessionStateFile>;
      const conversations = parsed.conversations;
      if (!conversations || typeof conversations !== "object" || Array.isArray(conversations)) {
        return;
      }

      for (const [key, value] of Object.entries(conversations)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          continue;
        }

        const record = value as Partial<SessionStateRecord>;
        const sessionId = typeof record.sessionId === "string" ? record.sessionId.trim() : "";
        if (!sessionId) {
          continue;
        }

        const previousResponseId =
          typeof record.previousResponseId === "string" && record.previousResponseId.trim()
            ? record.previousResponseId.trim()
            : undefined;
        const updatedAt =
          typeof record.updatedAt === "string" && record.updatedAt.trim()
            ? record.updatedAt
            : new Date(0).toISOString();

        this.state.conversations[key] = {
          sessionId,
          previousResponseId,
          updatedAt
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/no such file/i.test(message)) {
        throw error;
      }
    }
  }

  get(key: string): SessionStateRecord | null {
    return this.state.conversations[key] ?? null;
  }

  async set(key: string, record: SessionStateRecord): Promise<void> {
    this.state.conversations[key] = record;
    await this.persist();
  }

  async clearPreviousResponseId(key: string): Promise<void> {
    const current = this.state.conversations[key];
    if (!current || current.previousResponseId === undefined) {
      return;
    }

    this.state.conversations[key] = {
      ...current,
      previousResponseId: undefined,
      updatedAt: new Date().toISOString()
    };
    await this.persist();
  }

  private async persist(): Promise<void> {
    const serialized = JSON.stringify(this.state, null, 2);
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        await mkdir(path.dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, `${serialized}\n`, "utf8");
      });
    await this.writeChain;
  }
}

const config = buildBotConfig();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});
const sessionStore = new DiscordSessionStore(config.statePath);
const conversationQueue = new Map<string, Promise<void>>();

async function processConversation(message: Message, botUserId: string): Promise<void> {
  const prompt = buildPrompt(message, botUserId);
  if (!prompt) {
    return;
  }

  const scope = buildConversationScope(message, config.ownerUserId, config.sessionPrefix);
  const previous = sessionStore.get(scope.conversationKey);
  const startingSessionId = previous?.sessionId || scope.sessionId;
  const startedAt = Date.now();

  try {
    if (canSendTyping(message.channel)) {
      await message.channel.sendTyping();
    }
  } catch {
    // Typing is best-effort.
  }

  try {
    const result = await sendMessage(prompt, {
      sessionId: startingSessionId,
      previousResponseId: previous?.previousResponseId,
      partnerId: scope.partnerId,
      speakerName: scope.speakerName,
      sendProxyPath: config.proxyUrl
    });

    const resolvedSessionId = result.sessionId?.trim() || startingSessionId;
    const finalReply = result.text.trim();

    if (result.resetPreviousResponseId) {
      await sessionStore.clearPreviousResponseId(scope.conversationKey);
    }

    await sessionStore.set(scope.conversationKey, {
      sessionId: resolvedSessionId,
      previousResponseId:
        result.responseId?.trim() || (result.resetPreviousResponseId ? undefined : previous?.previousResponseId),
      updatedAt: new Date().toISOString()
    });

    if (!finalReply) {
      throw new Error("Aurora returned an empty reply.");
    }

    await recordConversationEvent({
      type: "conversation_turn",
      userText: prompt,
      auroraText: finalReply,
      sessionId: resolvedSessionId,
      partnerId: scope.partnerId,
      speakerName: scope.speakerName,
      responseId: result.responseId,
      complianceId: result.complianceId,
      latencyMs: result.latencyMs ?? Math.max(0, Date.now() - startedAt),
      introspection: result.introspection
    });

    await sendDiscordReply(message, finalReply);
    console.log(
      `[discord] replied session=${resolvedSessionId} user=${message.author.id} latency=${result.latencyMs ?? 0}ms`
    );
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    const complianceId = error instanceof SendMessageError ? error.complianceId : undefined;

    if (error instanceof SendMessageError && error.resetPreviousResponseId) {
      await sessionStore.clearPreviousResponseId(scope.conversationKey);
    }

    await recordConversationEvent({
      type: "send_error",
      userText: prompt,
      sessionId: startingSessionId,
      partnerId: scope.partnerId,
      speakerName: scope.speakerName,
      complianceId,
      error: errorText,
      latencyMs: Math.max(0, Date.now() - startedAt)
    }).catch(() => undefined);

    console.error(`[discord] send failed session=${startingSessionId} user=${message.author.id}: ${errorText}`);
    await sendDiscordReply(message, `Aurora hit an error: ${asSingleLine(errorText, 300)}`).catch(() => undefined);
  }
}

function enqueueConversation(key: string, task: () => Promise<void>): void {
  const previous = conversationQueue.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (conversationQueue.get(key) === next) {
        conversationQueue.delete(key);
      }
    });
  conversationQueue.set(key, next);
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`[discord] ready as ${readyClient.user.tag}`);
});

client.on(Events.Error, (error) => {
  console.error(`[discord] client error: ${error instanceof Error ? error.stack || error.message : String(error)}`);
});

client.on(Events.MessageCreate, async (message) => {
  const botUserId = client.user?.id;
  if (!botUserId) {
    return;
  }

  const shouldHandle = await shouldHandleMessage(
    message,
    botUserId,
    config.replyMode,
    config.allowedGuildIds,
    config.allowedChannelIds
  );

  if (!shouldHandle) {
    return;
  }

  const scope = buildConversationScope(message, config.ownerUserId, config.sessionPrefix);
  enqueueConversation(scope.conversationKey, async () => {
    await processConversation(message, botUserId);
  });
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[discord] shutting down on ${signal}`);
  client.destroy();
  await Promise.allSettled([...conversationQueue.values()]);
}

async function main(): Promise<void> {
  await sessionStore.load();
  if (process.argv.includes("--check")) {
    console.log(
      `[discord] config ok proxy=${config.proxyUrl} mode=${config.replyMode} state=${path.relative(projectRoot, config.statePath)}`
    );
    return;
  }
  await client.login(config.token);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT").finally(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM").finally(() => {
    process.exit(0);
  });
});

main().catch((error) => {
  console.error(`[discord] fatal: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
