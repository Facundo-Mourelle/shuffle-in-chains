import { ChainedSongsManager } from "../store/chainStorage";
import { normalizeUri } from "./initContextMenu";

interface QueueTrack {
    uri: string;
    uid: string;
    [key: string]: any;
}

/**
 * Check if shuffle mode is enabled
 */
function isShuffleModeEnabled(): boolean {
    return Spicetify.Player.getShuffle();
}

/**
 * Get all chains for the current context
 */
function getChainsForCurrentContext(): string[][] {
    const rawContext = Spicetify.Player.data.context.uri;
    const contextUri = normalizeUri(rawContext);
    return ChainedSongsManager.getChains()[contextUri] || [];
}

/**
 * Get the next tracks from the queue
 */
async function getQueueNextTracks(): Promise<any[]> {
    return (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
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
        console.warn("None of the chained songs were found in the visible queue.");
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
    await Spicetify.Platform.PlayerAPI.insertIntoQueue(
        [{ uri: songUri }],
        {
            before: {
                uri: beforeTrack.uri,
                uid: beforeTrack.uid
            }
        }
    );
}

/**
 * Get the UID of a song at a specific position in the queue
 */
async function getUidAtPosition(position: number): Promise<string | null> {
    // Small delay to ensure Spotify updates the queue with new UID
    await new Promise(resolve => setTimeout(resolve, 100));

    const updatedQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
    const track = updatedQueue[position];

    return track?.uid || null;
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
        const foundUri = entry.uri;
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
        console.log(`  Tracked correct UID: ${newUid} for ${desiredUri}`);
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
    console.warn(`⚠️ Song not in queue: ${desiredUri}. Attempting to insert manually...`);

    await insertSongIntoQueue(desiredUri, {
        uri: trackAtTarget.uri,
        uid: trackAtTarget.uid
    });

    console.log(`✅ Successfully inserted missing song: ${desiredUri}`);

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

        // Re-fetch current state to ensure accuracy after previous moves
        const currentQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
        const trackAtTarget = currentQueue[targetPos];
        const trackAtTargetUri = trackAtTarget?.uri;

        // Check if song is already in correct position
        if (trackAtTargetUri === desiredUri) {
            movedSongsCorrectPosition.set(desiredUri, trackAtTarget.uid);
            continue;
        }

        // Try to move the song
        try {
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
            console.error(`Failed to process song: ${desiredUri}`, err);
            console.warn(`Skipping rest of this chain due to error.`);
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
    const finalQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
    const tracksToRemove: QueueTrack[] = [];

    for (const track of finalQueue) {
        const trackUri = track.uri || track.track?.uri;
        const trackUid = track.uid;

        // If this track is part of a chain
        if (chain.includes(trackUri)) {
            const correctUid = movedSongsCorrectPosition.get(trackUri);

            // If this is NOT the correctly positioned instance, mark for removal
            if (correctUid && trackUid !== correctUid) {
                tracksToRemove.push(track);
            }
        }
    }

    return tracksToRemove;
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
            console.error(`Failed to remove duplicate: ${track.uri}`, err);
        }
    }

    return removedCount;
}

/**
 * Process a single chain: reorder songs and remove duplicates
 */
async function processChain(chain: string[], nextTracks: any[]): Promise<void> {
    // Find the anchor point
    const anchor = findChainAnchor(chain, nextTracks);
    if (!anchor) {
        return;
    }

    const movedSongsCorrectPosition = await reorderChain(chain, anchor);

    const duplicates = await findDuplicates(chain, movedSongsCorrectPosition);
    await removeDuplicates(duplicates);
}

/**
 * Main function to enforce chain order in the queue
 */
export async function enforceChainOrder(): Promise<void> {

    if (!isShuffleModeEnabled()) {
        return;
    }

    const allChains = getChainsForCurrentContext();
    if (allChains.length === 0) {
        console.log("No chains found for current context.");
        console.groupEnd();
        return;
    }

    const nextTracks = await getQueueNextTracks();

    for (const chain of allChains) {
        await processChain(chain, nextTracks);
    }
}
