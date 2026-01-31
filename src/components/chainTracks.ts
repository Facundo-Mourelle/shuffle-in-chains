import { ChainedSongsManager } from "../store/chainStorage";
import { normalizeUri } from "./initContextMenu";

interface QueueTrack {
    uri: string;
    uid: string;
    [key: string]: any;
}

/**
 * Check if required APIs are available
 */
function checkAPIsAvailable(): boolean {
    if (!Spicetify?.Player?.getShuffle) {
        console.warn("[Chain Enforcer] getShuffle API not available");
        return false;
    }
    if (!Spicetify?.Platform?.PlayerAPI) {
        console.warn("[Chain Enforcer] PlayerAPI not available");
        return false;
    }
    return true;
}

/**
 * Check if shuffle mode is enabled
 */
function isShuffleModeEnabled(): boolean {
    try {
        return Spicetify.Player.getShuffle();
    } catch (err) {
        console.error("[Chain Enforcer] Failed to get shuffle status:", err);
        return false;
    }
}

/**
 * Get all chains for the current context
 */
function getChainsForCurrentContext(): string[][] {
    try {
        const rawContext = Spicetify.Player.data.context.uri;
        const contextUri = normalizeUri(rawContext);
        return ChainedSongsManager.getChains()[contextUri] || [];
    } catch (err) {
        console.error("[Chain Enforcer] Failed to get chains:", err);
        return [];
    }
}

/**
 * Get the next tracks from the queue
 */
async function getQueueNextTracks(): Promise<any[]> {
    try {
        const queueData = await Spicetify.Platform.PlayerAPI.getQueue();
        return queueData.nextUp || [];
    } catch (err) {
        console.error("[Chain Enforcer] Failed to get queue:", err);
        throw err;
    }
}

/**
 * Find the first song from a chain that appears in the queue (the "anchor")
 */
function findChainAnchor(chain: string[], nextTracks: any[]): { uri: string; index: number } | null {
    const queueUris = nextTracks.map((entry: any, index: number) => {
        const uri = entry.uri || "unknown";
        return { uri, index };
    });

    const anchor = queueUris.find((item: { uri: string }) => chain.includes(item.uri));

    if (!anchor) {
        console.warn("None of the chained songs found in queue");
        return null;
    }
    return anchor;
}

/**
 * Insert a song into the queue at a specific position
 */
async function insertSongIntoQueue(
    songUri: string,
    beforeTrack: { uri: string; uid: string }
): Promise<void> {
    try {
        await Spicetify.Platform.PlayerAPI.insertIntoQueue(
            [{ uri: songUri }],
            {
                before: {
                    uri: beforeTrack.uri,
                    uid: beforeTrack.uid
                }
            }
        );
    } catch (err) {
        console.error("[Chain Enforcer] Failed to insert song:", err);
        throw err;
    }
}

/**
 * Get the UID of a song at a specific position in the queue
 */
async function getUidAtPosition(position: number): Promise<string | null> {
    try {
        // Small delay to ensure Spotify updates the queue with new UID
        await new Promise(resolve => setTimeout(resolve, 100));

        const updatedQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
        const track = updatedQueue[position];

        return track?.uid || null;
    } catch (err) {
        console.error("Failed to get UID at position:", err);
        return null;
    }
}

/**
 * Move an existing song in the queue to a new position
 */
async function moveExistingSong(
    desiredUri: string,
    currentQueue: any[],
    targetPos: number,
    trackAtTarget: any,
    movedSongsCorrectPosition: Map<string, string>
): Promise<void> {
    const songToMove = currentQueue.find((entry: any) => {
        const foundUri = entry.uri || entry.track?.uri;
        return foundUri === desiredUri;
    });

    if (!songToMove) {
        throw new Error(`Song ${desiredUri} not found in queue`);
    }

    const songToMoveUri = songToMove.uri;

    await insertSongIntoQueue(songToMoveUri, {
        uri: trackAtTarget.uri,
        uid: trackAtTarget.uid
    });

    // Track the new UID
    const newUid = await getUidAtPosition(targetPos);
    if (newUid) {
        movedSongsCorrectPosition.set(desiredUri, newUid);
    }
}

/**
 * Insert a missing song that's not yet in the queue
 */
async function insertMissingSong(
    desiredUri: string,
    targetPos: number,
    trackAtTarget: any,
    movedSongsCorrectPosition: Map<string, string>
): Promise<void> {
    console.warn(`Song not in queue: ${desiredUri}. Inserting...`);

    await insertSongIntoQueue(desiredUri, {
        uri: trackAtTarget.uri,
        uid: trackAtTarget.uid
    });

    // Track the new UID
    const newUid = await getUidAtPosition(targetPos);
    if (newUid) {
        movedSongsCorrectPosition.set(desiredUri, newUid);
    }
}

/**
 * Reorder a single chain to maintain the desired song order
 */
async function reorderChain(
    chain: string[],
    anchor: { uri: string; index: number }
): Promise<Map<string, string>> {
    const movedSongsCorrectPosition = new Map<string, string>();

    for (let j = 0; j < chain.length; j++) {
        const desiredUri = chain[j];
        const targetPos = anchor.index + j;

        try {
            // Re-fetch current state
            const currentQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
            const trackAtTarget = currentQueue[targetPos];
            const trackAtTargetUri = trackAtTarget?.uri || trackAtTarget?.track?.uri;

            // Check if song is already in correct position
            if (trackAtTargetUri === desiredUri) {
                movedSongsCorrectPosition.set(desiredUri, trackAtTarget.uid);
                continue;
            }

            // Try to move the song
            const songExists = currentQueue.find((entry: any) => {
                const foundUri = entry.uri || entry.track?.uri;
                return foundUri === desiredUri;
            });

            if (songExists) {
                await moveExistingSong(
                    desiredUri,
                    currentQueue,
                    targetPos,
                    trackAtTarget,
                    movedSongsCorrectPosition
                );
            } else {
                await insertMissingSong(
                    desiredUri,
                    targetPos,
                    trackAtTarget,
                    movedSongsCorrectPosition
                );
            }
        } catch (err) {
            console.error(`Failed to process ${desiredUri}:`, err);
            Spicetify.showNotification(`Failed to chain song ${j + 1}`, true);
            break;
        }
    }

    return movedSongsCorrectPosition;
}

/**
 * Find and collect all duplicate instances of chained songs
 */
async function findDuplicates(
    chain: string[],
    movedSongsCorrectPosition: Map<string, string>
): Promise<QueueTrack[]> {
    try {
        const finalQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
        const tracksToRemove: QueueTrack[] = [];

        for (const track of finalQueue) {
            const trackUri = track.uri || track.track?.uri;
            const trackUid = track.uid;

            if (chain.includes(trackUri)) {
                const correctUid = movedSongsCorrectPosition.get(trackUri);

                if (correctUid && trackUid !== correctUid) {
                    tracksToRemove.push(track);
                }
            }
        }

        return tracksToRemove;
    } catch (err) {
        console.error("Failed to find duplicates:", err);
        return [];
    }
}

/**
 * Remove duplicate songs from the queue
 */
async function removeDuplicates(tracksToRemove: QueueTrack[]): Promise<number> {
    let removedCount = 0;

    for (const track of tracksToRemove) {
        try {
            await Spicetify.Platform.PlayerAPI.removeFromQueue([{
                uri: track.uri,
                uid: track.uid
            }]);
            removedCount++;
        } catch (err) {
            console.error(`Failed to remove duplicate:`, err);
        }
    }

    return removedCount;
}

/**
 * Process a single chain: reorder songs and remove duplicates
 */
async function processChain(chain: string[], nextTracks: any[]): Promise<void> {
    try {
        // Find the anchor point
        const anchor = findChainAnchor(chain, nextTracks);
        if (!anchor) {
            return;
        }

        // Reorder the chain
        const movedSongsCorrectPosition = await reorderChain(chain, anchor);

        // Cleanup duplicates
        console.log("Starting duplicate cleanup...");
        const duplicates = await findDuplicates(chain, movedSongsCorrectPosition);
        const removedCount = await removeDuplicates(duplicates);
        console.log(`Removed ${removedCount} duplicate(s)`);
    } catch (err) {
        console.error("Failed to process chain:", err);
        throw err;
    }
}

/**
 * Main function to enforce chain order in the queue
 */
export async function enforceChainOrder(): Promise<void> {
    try {
        // Check APIs
        if (!checkAPIsAvailable()) {
            console.warn("Required APIs not available");
            return;
        }

        // Check if shuffle mode is enabled
        if (!isShuffleModeEnabled()) {
            console.groupEnd();
            return;
        }

        // Get chains for current context
        const allChains = getChainsForCurrentContext();
        if (allChains.length === 0) {
            console.log("No chains found");
            console.groupEnd();
            return;
        }

        // Get queue tracks
        const nextTracks = await getQueueNextTracks();

        // Process each chain
        for (const chain of allChains) {
            await processChain(chain, nextTracks);
        }

    } catch (err) {
        console.error("Fatal error:", err);
        Spicetify.showNotification("Failed to enforce song chains", true);
    }
}
