import { ChainedSongsManager, STORAGE_KEY } from "../store/chainStorage";

export function normalizeUri(uri: string): string {
    if (!uri) return "";
    // Removes "spotify:user:xxxx:" and leaves "playlist:xxxx" or "album:xxxx"
    const parts = uri.split(':');
    if (parts.includes('playlist')) {
        return `playlist:${parts[parts.indexOf('playlist') + 1]}`;
    }
    if (parts.includes('album')) {
        return `album:${parts[parts.indexOf('album') + 1]}`;
    }
    return uri;
}

export function getActiveContextUri(): string {
    // Extracts "playlist:xxxx" or "album:xxxx" from the URL path
    try {
        if (Spicetify?.Platform?.History?.location) {
            const path = Spicetify.Platform.History.location.pathname;
            const parts = path.split('/');
            // Handles /playlist/id or /album/id
            if (parts.length >= 3) {
                return `${parts[1]}:${parts[2]}`;
            }
        }
        // Fallback
        return Spicetify.Player.data.context.uri; // Fallback
    } catch (err) {
        console.error("[Context Menu] Failed to get active context:", err);
        return "";
    }
}

export function initContextMenu() {
    try {
        if (!Spicetify?.ContextMenu?.Item) {
            console.warn("[Context Menu] ContextMenu.Item API not available");
            return;
        }

        // "Chain selected songs" menu item
        new Spicetify.ContextMenu.Item(
            "Chain selected songs",
            (uris) => {
                try {
                    const contextUri = normalizeUri(getActiveContextUri());
                    if (!contextUri) {
                        Spicetify.showNotification("Could not determine current playlist", true);
                        return;
                    }

                    ChainedSongsManager.saveChain(contextUri, uris);
                    Spicetify.showNotification(`Chained ${uris.length} songs!`);
                } catch (err) {
                    console.error("[Context Menu] Failed to chain songs:", err);
                    Spicetify.showNotification("Failed to chain songs", true);
                }
            },
            (uris) => uris.length >= 2, // Only show if multiple songs selected
            "locked"
        ).register();

        // "Clear playlist chains" menu item
        new Spicetify.ContextMenu.Item(
            "Clear playlist chains",
            () => {
                try {
                    const contextUri = normalizeUri(getActiveContextUri());
                    if (!contextUri) {
                        Spicetify.showNotification("Could not determine current playlist", true);
                        return;
                    }

                    const data = ChainedSongsManager.getChains();
                    delete data[contextUri];
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                    Spicetify.showNotification("All chains cleared for this playlist");
                } catch (err) {
                    console.error("[Context Menu] Failed to clear chains:", err);
                    Spicetify.showNotification("Failed to clear chains", true);
                }
            },
            () => true,
            "x"
        ).register();

        console.log("[Context Menu] Initialized successfully");
    } catch (err) {
        console.error("[Context Menu] Initialization failed:", err);
        Spicetify.showNotification("Failed to initialize context menu", true);
    }
}
