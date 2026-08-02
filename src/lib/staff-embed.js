import { EmbedBuilder } from "discord.js";
import { config } from "../config.js";

/** Usely chrome accent used across staff Discord embeds. */
export const STAFF_EMBED_COLOR = 0xd7dde6;
export const STAFF_OK_COLOR = 0x7dcea0;
export const STAFF_WARN_COLOR = 0xe8c06a;
export const STAFF_ERR_COLOR = 0xff6b73;

export function staffEmbed({
  title,
  description,
  color = STAFF_EMBED_COLOR,
  fields = [],
  footer,
} = {}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: footer || config.brand?.name || "Usely" });

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(String(description).slice(0, 4096));
  for (const field of fields) {
    if (!field?.name || field.value == null) continue;
    embed.addFields({
      name: String(field.name).slice(0, 256),
      value: String(field.value).slice(0, 1024) || "—",
      inline: Boolean(field.inline),
    });
  }
  return embed;
}

export function okEmbed(title, description, fields) {
  return staffEmbed({ title, description, fields, color: STAFF_OK_COLOR });
}

export function warnEmbed(title, description, fields) {
  return staffEmbed({ title, description, fields, color: STAFF_WARN_COLOR });
}

export function errEmbed(title, description, fields) {
  return staffEmbed({ title, description, fields, color: STAFF_ERR_COLOR });
}

/** Truncate a long list into embed-safe chunks joined by newlines. */
export function formatNameList(names, empty = "None") {
  const list = (names || []).filter(Boolean);
  if (!list.length) return empty;
  const text = list.join("\n");
  return text.length > 1000 ? `${text.slice(0, 990)}…` : text;
}
