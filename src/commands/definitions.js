import {
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

const staff = PermissionFlagsBits.ModerateMembers;

export const commandDefinitions = [
  // ——— Rust server (RCON) ———
  new SlashCommandBuilder()
    .setName("server")
    .setDescription("Live Rust server info"),
  new SlashCommandBuilder()
    .setName("players")
    .setDescription("List players currently online"),
  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Wipe stats")
    .addSubcommand((sub) =>
      sub.setName("me").setDescription("Show your linked wipe stats card"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("player")
        .setDescription("Look up a player's wipe stats")
        .addStringOption((o) =>
          o.setName("ign").setDescription("In-game name (IGN)").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("panel")
        .setDescription("Staff: post the View My Stats panel in this channel"),
    ),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the in-game leaderboard")
    .addStringOption((o) =>
      o
        .setName("category")
        .setDescription("Which board to show")
        .addChoices(
          { name: "Kills", value: "kills" },
          { name: "Deaths", value: "deaths" },
          { name: "K/D ratio", value: "kd" },
          { name: "Playtime", value: "playtime" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("rcon")
    .setDescription("Rust server admin controls")
    .setDefaultMemberPermissions(staff)
    .addSubcommand((sub) =>
      sub
        .setName("say")
        .setDescription("Broadcast a message in-game")
        .addStringOption((o) =>
          o.setName("message").setDescription("Message to broadcast").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("console")
        .setDescription("Run a raw RCON console command")
        .addStringOption((o) =>
          o.setName("command").setDescription("Command to run").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("kick")
        .setDescription("Kick a player from the server")
        .addStringOption((o) =>
          o.setName("player").setDescription("In-game name (IGN)").setRequired(true),
        )
        .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("ban")
        .setDescription("Ban a player from the server")
        .addStringOption((o) =>
          o.setName("player").setDescription("In-game name (IGN)").setRequired(true),
        )
        .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unban")
        .setDescription("Unban a player")
        .addStringOption((o) =>
          o.setName("player").setDescription("In-game name (IGN)").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("give")
        .setDescription("Give an item to a player")
        .addStringOption((o) =>
          o.setName("player").setDescription("In-game name (IGN)").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("item").setDescription("Item short name, e.g. rifle.ak").setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName("amount").setDescription("Quantity").setMinValue(1).setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("resetstats")
        .setDescription("Wipe the tracked leaderboard stats (use after a server wipe)")
        .addStringOption((o) =>
          o.setName("label").setDescription("Wipe label, e.g. 2026-08-01").setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("pushstats").setDescription("Push the leaderboard image to Discord now"),
    ),

  new SlashCommandBuilder()
    .setName("kit")
    .setDescription("Staff: panel kits, give, and wipe-day locks")
    .setDefaultMemberPermissions(staff)
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List panel kits and claim / lock status"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("give")
        .setDescription("Give a panel or server kit to a player")
        .addStringOption((o) =>
          o.setName("player").setDescription("In-game name (IGN)").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("kit").setDescription("Kit id / name").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("locks").setDescription("Show kit lock status"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("lock")
        .setDescription("Turn kit locks on (uses kits selected in the panel)")
        .addIntegerOption((o) =>
          o
            .setName("hours")
            .setDescription("Optional auto-end after this many hours")
            .setMinValue(1)
            .setMaxValue(168),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("unlock").setDescription("Turn kit locks off (keeps the saved kit list)"),
    ),

  new SlashCommandBuilder()
    .setName("player")
    .setDescription("Staff: look up a player or force-teleport")
    .setDefaultMemberPermissions(staff)
    .addSubcommand((sub) =>
      sub
        .setName("lookup")
        .setDescription("Online status, Discord link, wipe stats, ban flag")
        .addStringOption((o) =>
          o.setName("ign").setDescription("In-game name").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("tp")
        .setDescription("Force-teleport a player to coords or another player")
        .addStringOption((o) =>
          o.setName("player").setDescription("Player to move").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("to_player").setDescription("Teleport onto this player's position"),
        )
        .addNumberOption((o) => o.setName("x").setDescription("X coordinate"))
        .addNumberOption((o) => o.setName("y").setDescription("Y coordinate"))
        .addNumberOption((o) => o.setName("z").setDescription("Z coordinate")),
    ),

  new SlashCommandBuilder()
    .setName("bans")
    .setDescription("Staff: view active game bans")
    .setDefaultMemberPermissions(staff)
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List active bans"),
    ),

  // ——— Player systems (link / teleports / shop) ———
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Discord to your in-game name")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Claim your online in-game name")
        .addStringOption((o) =>
          o.setName("player").setDescription("Your exact in-game name").setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("status").setDescription("Show your linked IGN"))
    .addSubcommand((sub) => sub.setName("unlink").setDescription("Unlink your Discord from your IGN"))
    .addSubcommand((sub) =>
      sub
        .setName("panel")
        .setDescription("Staff: post the Link Account panel in this channel"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("force")
        .setDescription("Staff: force-link a Discord user to an IGN")
        .addUserOption((o) => o.setName("user").setDescription("Discord user").setRequired(true))
        .addStringOption((o) =>
          o.setName("player").setDescription("In-game name").setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("home")
    .setDescription("Set and teleport to your homes")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Save your current position as a home")
        .addStringOption((o) =>
          o.setName("name").setDescription("Home name (default: home)").setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("go")
        .setDescription("Teleport to a saved home")
        .addStringOption((o) =>
          o.setName("name").setDescription("Home name (default: home)").setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List your homes"))
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a home")
        .addStringOption((o) =>
          o.setName("name").setDescription("Home name").setRequired(false),
        ),
    ),
  new SlashCommandBuilder()
    .setName("warp")
    .setDescription("Teleport to a public warp")
    .addSubcommand((sub) =>
      sub
        .setName("go")
        .setDescription("Teleport to a warp")
        .addStringOption((o) =>
          o.setName("name").setDescription("Warp name").setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List warps"))
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Staff: save your position as a warp")
        .addStringOption((o) =>
          o.setName("name").setDescription("Warp name").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Staff: delete a warp")
        .addStringOption((o) =>
          o.setName("name").setDescription("Warp name").setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("tpr")
    .setDescription("Request a teleport to another player")
    .addStringOption((o) =>
      o.setName("player").setDescription("Their in-game name").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("tpa")
    .setDescription("Accept a teleport request"),
  new SlashCommandBuilder()
    .setName("tpd")
    .setDescription("Deny a teleport request"),
  new SlashCommandBuilder()
    .setName("automessage")
    .setDescription("Timed in-game broadcasts")
    .setDefaultMemberPermissions(staff)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add an auto-message")
        .addStringOption((o) => o.setName("text").setDescription("Message text").setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName("minutes")
            .setDescription("Interval in minutes")
            .setMinValue(1)
            .setMaxValue(1440)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List auto-messages"))
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove an auto-message")
        .addStringOption((o) => o.setName("id").setDescription("Message id").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("Enable or disable an auto-message")
        .addStringOption((o) => o.setName("id").setDescription("Message id").setRequired(true))
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("On or off").setRequired(true),
        ),
    ),

  // ——— Moderation ———
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .setDefaultMemberPermissions(staff)
    .addUserOption((o) => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the warning").setRequired(true)),
  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout a member")
    .setDefaultMemberPermissions(staff)
    .addUserOption((o) => o.setName("user").setDescription("Member to mute").setRequired(true))
    .addIntegerOption((o) =>
      o
        .setName("minutes")
        .setDescription("Timeout length in minutes")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320),
    )
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the mute").setRequired(false)),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .setDefaultMemberPermissions(staff)
    .addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the kick").setRequired(false)),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the ban").setRequired(false))
    .addIntegerOption((o) =>
      o
        .setName("delete_days")
        .setDescription("Days of messages to delete (0-7)")
        .setMinValue(0)
        .setMaxValue(7),
    ),
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete recent messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("How many messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("Only delete messages from this user").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) =>
      o
        .setName("seconds")
        .setDescription("Slowmode delay in seconds (0 = off)")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600),
    ),
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel")
    .setDefaultMemberPermissions(staff)
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Channel to lock (default: here)").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a channel")
    .setDefaultMemberPermissions(staff)
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Channel to unlock (default: here)").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("raidmode")
    .setDescription("Lock all channels during a raid")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((o) =>
      o.setName("enabled").setDescription("Turn raid mode on or off").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("case")
    .setDescription("View moderation history for a user")
    .setDefaultMemberPermissions(staff)
    .addUserOption((o) =>
      o.setName("user").setDescription("Member to look up").setRequired(true),
    ),

  // ——— Giveaways ———
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Manage giveaways")
    .setDefaultMemberPermissions(staff)
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Start a new giveaway")
        .addStringOption((o) =>
          o.setName("prize").setDescription("What the winner gets").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("minutes")
            .setDescription("How long the giveaway runs (minutes)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10080),
        )
        .addIntegerOption((o) =>
          o
            .setName("winners")
            .setDescription("Number of winners (default 1)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20),
        )
        .addRoleOption((o) =>
          o.setName("required_role").setDescription("Role required to enter").setRequired(false),
        )
        .addBooleanOption((o) =>
          o
            .setName("grant_vip")
            .setDescription("Give VIP role to winner(s) when giveaway ends")
            .setRequired(false),
        )
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Channel to post in (default: here)").setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("End a giveaway early")
        .addStringOption((o) =>
          o.setName("message_id").setDescription("Giveaway message ID").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reroll")
        .setDescription("Reroll giveaway winners")
        .addStringOption((o) =>
          o.setName("message_id").setDescription("Giveaway message ID").setRequired(true),
        ),
    ),

  // ——— Tickets ———
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Support ticket tools")
    .setDefaultMemberPermissions(staff)
    .addSubcommand((sub) =>
      sub.setName("setup").setDescription("Post the ticket panel in this channel"),
    )
    .addSubcommand((sub) =>
      sub.setName("close").setDescription("Close the current ticket"),
    ),

  // ——— Community ———
  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a quick poll")
    .setDefaultMemberPermissions(staff)
    .addStringOption((o) =>
      o.setName("question").setDescription("The poll question").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("option1").setDescription("First choice").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("option2").setDescription("Second choice").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("option3").setDescription("Third choice").setRequired(false),
    )
    .addStringOption((o) =>
      o.setName("option4").setDescription("Fourth choice").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send an announcement embed")
    .setDefaultMemberPermissions(staff)
    .addStringOption((o) =>
      o.setName("title").setDescription("Announcement title").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("message").setDescription("Announcement text").setRequired(true),
    )
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Channel to post in (default: here)").setRequired(false),
    ),
].map((c) => c.toJSON());
