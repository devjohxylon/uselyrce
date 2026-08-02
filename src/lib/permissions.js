import { PermissionFlagsBits } from "discord.js";
import { config, isAdmin } from "../config.js";

function hasStaffRole(member) {
  return config.roles.staff.some((roleId) => member.roles.cache.has(roleId));
}

/** Soft staff: channel tools, non-destructive bot helpers. */
export function isStaff(member) {
  if (!member) return false;
  if (isAdmin(member.id)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return hasStaffRole(member);
}

/** Game-admin: kick/ban/console/give — ManageMessages alone is not enough. */
export function isGameAdmin(member) {
  if (!member) return false;
  if (isAdmin(member.id)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.BanMembers)) return true;
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;
  return hasStaffRole(member);
}

export function isAutomodExempt(member) {
  if (!member) return true;
  return isStaff(member);
}

export async function requireStaff(interaction) {
  const member = interaction.member;
  if (!isStaff(member)) {
    await interaction.reply({
      content: "You need staff permissions to use this command.",
      ephemeral: true,
    });
    return false;
  }
  return true;
}

export async function requireGameAdmin(interaction) {
  const member = interaction.member;
  if (!isGameAdmin(member)) {
    await interaction.reply({
      content: "You need game-admin permissions (Ban Members or higher) for this command.",
      ephemeral: true,
    });
    return false;
  }
  return true;
}
