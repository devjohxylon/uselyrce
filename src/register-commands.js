import { syncSlashCommands } from "./commands/sync.js";

syncSlashCommands()
  .then((r) => {
    if (r.scope === "guild") {
      console.log(`Registered ${r.count} guild command(s) on ${r.guildId}`);
    } else {
      console.log(`Registered ${r.count} global command(s) for app ${r.clientId}`);
    }
  })
  .catch((error) => {
    console.error("Failed to register commands:", error);
    process.exit(1);
  });
