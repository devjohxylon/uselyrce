import { startBot } from "./bot.js";

startBot().catch((error) => {
  if (String(error.message).includes("disallowed intents")) {
    console.error(`
Usely failed: Discord blocked privileged intents.

Fix in Discord Developer Portal (https://discord.com/developers/applications):
  1. Open your app → Bot
  2. Under "Privileged Gateway Intents", turn ON:
     • MESSAGE CONTENT INTENT
     • SERVER MEMBERS INTENT
  3. Click Save Changes
  4. Run: npm.cmd start

Also re-invite the bot if you added new permissions recently.
`);
  } else {
    console.error("Usely failed to start:", error);
  }
  process.exit(1);
});
