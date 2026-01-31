import { initContextMenu } from "./components/initContextMenu";
import { enforceChainOrder } from "./components/chainTracks";

// Store references for cleanup
let songChangeListener: ((event?: Event | undefined) => void) | null = null;

/**
 * Check if all required Spicetify APIs are available
 */
function checkAPIsAvailable(): boolean {
  if (!Spicetify?.Platform?.PlayerAPI) {
    console.warn("Spicetify.Platform.PlayerAPI not available");
    return false;
  }

  if (!Spicetify?.ContextMenu) {
    console.warn("Spicetify.ContextMenu not available");
    return false;
  }

  if (!Spicetify?.Player) {
    console.warn("Spicetify.Player not available");
    return false;
  }

  return true;
}

/**
 * Initialize the extension
 */
function initialize() {
  try {

    // Initialize context menu
    initContextMenu();

    // Set up song change listener with error handling
    songChangeListener = async () => {
      try {
        // Wait a moment for Spotify to update its internal queue state
        setTimeout(() => {
          enforceChainOrder().catch((err: any) => {
            console.error("Failed to enforce chain order:", err);
            Spicetify.showNotification("Failed to enforce song chains", true);
          });
        }, 300);
      } catch (err) {
        console.error("[Chained Songs] Song change handler error:", err);
      }
    };

    Spicetify.Player.addEventListener("songchange", songChangeListener);

  } catch (err) {
    console.error("[Chained Songs] Initialization failed:", err);
    Spicetify.showNotification("Chained Songs extension failed to load", true);
  }
}

/**
 * Cleanup function to remove listeners when extension unloads
 */
function cleanup() {
  console.log("[Chained Songs] Cleaning up...");

  if (songChangeListener) {
    Spicetify.Player.removeEventListener("songchange", songChangeListener);
    songChangeListener = null;
  }
}

/**
 * Main entry point with retry mechanism
 */
function main() {
  // Check if Spicetify APIs are defined
  if (!checkAPIsAvailable()) {
    setTimeout(main, 300); // Retry in 300ms
    return;
  }

  initialize();
}

// Export cleanup for potential use by Spicetify
export { cleanup };

export default main;
