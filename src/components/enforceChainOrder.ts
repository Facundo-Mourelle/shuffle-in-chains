import { ChainedSongsManager } from "../store/chainStorage";
import { normalizeUri } from "./initContextMenu";

interface QueueTrack {
    uri: string;
    uid: string;
    [key: string]: any;
}

export async function enforceChainOrder() {

    const isShuffleEnabled = Spicetify.Player.getShuffle();

    if (!isShuffleEnabled) {
        console.groupEnd();
        return;
    }

    const rawContext = Spicetify.Player.data.context.uri;
    const contextUri = normalizeUri(rawContext);
    const allChains = ChainedSongsManager.getChains()[contextUri] || [];

    if (allChains.length === 0) {
        return;
    }

    const queueData = await Spicetify.Platform.PlayerAPI.getQueue();
    // Look for the array in all common locations
    const nextTracks = queueData.nextUp || [];

    for (const chain of allChains) {
        const movedSongsCorrectPosition = new Map<string, string>(); // uri -> uid

        // Map the raw queue objects to a flat list of URIs for comparison
        const queueUris = nextTracks.map((entry: any, index: number) => {
            const uri = entry.uri || entry.track?.uri || "unknown";
            return { uri, index };
        });

        const anchor = queueUris.find((item: { uri: string; }) => chain.includes(item.uri));

        if (!anchor) {
            console.warn("None of the chained songs were found in the visible queue.");
            continue;
        }

        // Sequential Reordering
        // Each iteration should set the new position of the moved song
        // TODO: optimizar esto para no hacer fetch constante de la queue -> manejo "estatico"
        // NOTE: mover una cancion en la queue le asigna un nuevo UID
        for (let j = 0; j < chain.length; j++) {
            const desiredUri = chain[j];
            const targetPos = anchor.index + j;

            // Re-fetch current state to ensure accuracy after previous moves
            const currentQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
            const trackAtTarget = currentQueue[targetPos];
            const trackAtTargetUri = trackAtTarget?.uri;

            if (trackAtTargetUri === desiredUri) {
                // Store the UID of the song that's already in the correct position
                movedSongsCorrectPosition.set(desiredUri, trackAtTarget.uid);
                continue;
            }

            // Find the song anywhere else in the queue
            const songToMove = currentQueue.find((entry: any) => {
                const foundUri = entry.uri;
                return foundUri === desiredUri;
            });

            // Reorder
            if (songToMove) {
                await Spicetify.Platform.PlayerAPI.insertIntoQueue(
                    [{ uri: songToMove.uri }],
                    {
                        before: {
                            uri: trackAtTarget.uri,
                            uid: trackAtTarget.uid
                        }
                    }
                )
                    .catch((err: any) => console.error("Reorder failed:", err));

                // Re-fetch to get the UID of the newly inserted song
                const updatedQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
                const newlyInserted = updatedQueue[targetPos];
                if (newlyInserted) {
                    movedSongsCorrectPosition.set(desiredUri, newlyInserted.uid);
                }
            } else {
                // Song not found in queue - it might not be loaded yet due to Spotify's queue cap
                // Attempt manual reorder
                try {
                    // Insert the missing song directly at the target position
                    await Spicetify.Platform.PlayerAPI.insertIntoQueue(
                        [{ uri: desiredUri }],
                        {
                            before: {
                                uri: trackAtTarget.uri,
                                uid: trackAtTarget.uid
                            }
                        }
                    );

                    // Re-fetch to get the UID of the newly inserted song
                    const updatedQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
                    const newlyInserted = updatedQueue[targetPos];
                    if (newlyInserted) {
                        movedSongsCorrectPosition.set(desiredUri, newlyInserted.uid);
                    }
                } catch (err) {
                    // Break the chain enforcement for this chain if we can't insert a song
                    // This prevents incomplete chains from being enforced
                    break;
                }
            }
        }

        // Remove duplicates
        const finalQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
        const tracksToRemove: QueueTrack[] = [];

        // Find all instances of chained songs
        for (const track of finalQueue) {
            const trackUri = track.uri;
            const trackUid = track.uid;

            if (chain.includes(trackUri)) {
                const correctUid = movedSongsCorrectPosition.get(trackUri);

                // If this is NOT the correctly positioned instance, mark for removal
                if (correctUid && trackUid !== correctUid) {
                    tracksToRemove.push(track);
                }
            }
        }

        try {
            await removeDuplicates(tracksToRemove);
        } catch (err) {
            console.error(`Failed at removing duplicates: `, err);

        }

    }

    async function removeDuplicates(tracksToRemove: QueueTrack[]): Promise<void> {
        for (const track of tracksToRemove) {
            try {
                await Spicetify.Platform.PlayerAPI.removeFromQueue([{ uri: track.uri, uid: track.uid }]);
            } catch (err) {
                console.error(`Failed to remove duplicate from queue: ${track.uri}`, err);
            }
        }
    }
}
