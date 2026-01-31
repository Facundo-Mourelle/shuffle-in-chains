import { initContextMenu } from "./components/initContextMenu";
import { enforceChainOrder } from "./components/chainTracks";
import { ChainedSongsManager } from "./store/chainStorage";

function main() {
  // Check if Spicetify is defined
  if (!globalThis.Spicetify?.Platform?.PlayerAPI || !globalThis.Spicetify?.ContextMenu) {
    setTimeout(main, 300); // Retry in 300ms
    return;
  }
  initContextMenu();

  Spicetify.Player.addEventListener("songchange", async () => {
    // Wait a moment for Spotify to update its internal queue state after a track change
    setTimeout(enforceChainOrder, 300);
  });

  (globalThis as any).debugChains = () => {
    console.table(ChainedSongsManager.getChains());
  };
  (globalThis as any).fixQueue = enforceChainOrder;
}

export default main;
