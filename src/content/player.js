import {
  CONTENT_MESSAGE,
  CONTENT_MESSAGE_SOURCE,
} from "../shared/page-messages.js";

// Runs a command on YouTube's player through the page-world bridge
// (src/page/player-bridge.js). Arguments must be structured-cloneable.
export function callPlayer(command, ...args) {
  window.postMessage(
    {
      source: CONTENT_MESSAGE_SOURCE,
      type: CONTENT_MESSAGE.PLAYER_COMMAND,
      command,
      args,
    },
    location.origin,
  );
}
