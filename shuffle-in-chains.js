(async function() {
        while (!Spicetify.React || !Spicetify.ReactDOM) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        var shuffleDinDchains = (() => {
  // src/store/chainStorage.ts
  var STORAGE_KEY = "chained-songs:data";
  var ChainedSongsManager = class {
    static getChains() {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    }
    static saveChain(playlistUri, uris) {
      const data = this.getChains();
      if (!data[playlistUri])
        data[playlistUri] = [];
      data[playlistUri] = data[playlistUri].filter(
        (chain) => !chain.some((uri) => uris.includes(uri))
      );
      data[playlistUri].push(uris);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  };

  // src/components/initContextMenu.ts
  function normalizeUri(uri) {
    if (!uri)
      return "";
    const parts = uri.split(":");
    if (parts.includes("playlist")) {
      return `playlist:${parts[parts.indexOf("playlist") + 1]}`;
    }
    if (parts.includes("album")) {
      return `album:${parts[parts.indexOf("album") + 1]}`;
    }
    return uri;
  }
  function getActiveContextUri() {
    var _a, _b;
    try {
      if ((_b = (_a = Spicetify == null ? void 0 : Spicetify.Platform) == null ? void 0 : _a.History) == null ? void 0 : _b.location) {
        const path = Spicetify.Platform.History.location.pathname;
        const parts = path.split("/");
        if (parts.length >= 3) {
          return `${parts[1]}:${parts[2]}`;
        }
      }
      return Spicetify.Player.data.context.uri;
    } catch (err) {
      console.error("[Context Menu] Failed to get active context:", err);
      return "";
    }
  }
  function initContextMenu() {
    var _a;
    try {
      if (!((_a = Spicetify == null ? void 0 : Spicetify.ContextMenu) == null ? void 0 : _a.Item)) {
        console.warn("[Context Menu] ContextMenu.Item API not available");
        return;
      }
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
        (uris) => uris.length >= 2,
        "locked"
      ).register();
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

  // src/components/chainTracks.ts
  function checkAPIsAvailable() {
    var _a, _b;
    if (!((_a = Spicetify == null ? void 0 : Spicetify.Player) == null ? void 0 : _a.getShuffle)) {
      console.warn("[Chain Enforcer] getShuffle API not available");
      return false;
    }
    if (!((_b = Spicetify == null ? void 0 : Spicetify.Platform) == null ? void 0 : _b.PlayerAPI)) {
      console.warn("[Chain Enforcer] PlayerAPI not available");
      return false;
    }
    return true;
  }
  function isShuffleModeEnabled() {
    try {
      return Spicetify.Player.getShuffle();
    } catch (err) {
      console.error("[Chain Enforcer] Failed to get shuffle status:", err);
      return false;
    }
  }
  function getChainsForCurrentContext() {
    try {
      const rawContext = Spicetify.Player.data.context.uri;
      const contextUri = normalizeUri(rawContext);
      return ChainedSongsManager.getChains()[contextUri] || [];
    } catch (err) {
      console.error("[Chain Enforcer] Failed to get chains:", err);
      return [];
    }
  }
  async function getQueueNextTracks() {
    try {
      const queueData = await Spicetify.Platform.PlayerAPI.getQueue();
      return queueData.nextUp || [];
    } catch (err) {
      console.error("[Chain Enforcer] Failed to get queue:", err);
      throw err;
    }
  }
  function findChainAnchor(chain, nextTracks) {
    const queueUris = nextTracks.map((entry, index) => {
      const uri = entry.uri || "unknown";
      return { uri, index };
    });
    const anchor = queueUris.find((item) => chain.includes(item.uri));
    if (!anchor) {
      console.warn("None of the chained songs found in queue");
      return null;
    }
    return anchor;
  }
  async function insertSongIntoQueue(songUri, beforeTrack) {
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
  async function getUidAtPosition(position) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const updatedQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
      const track = updatedQueue[position];
      return (track == null ? void 0 : track.uid) || null;
    } catch (err) {
      console.error("Failed to get UID at position:", err);
      return null;
    }
  }
  async function moveExistingSong(desiredUri, currentQueue, targetPos, trackAtTarget, movedSongsCorrectPosition) {
    const songToMove = currentQueue.find((entry) => {
      var _a;
      const foundUri = entry.uri || ((_a = entry.track) == null ? void 0 : _a.uri);
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
    const newUid = await getUidAtPosition(targetPos);
    if (newUid) {
      movedSongsCorrectPosition.set(desiredUri, newUid);
    }
  }
  async function insertMissingSong(desiredUri, targetPos, trackAtTarget, movedSongsCorrectPosition) {
    console.warn(`Song not in queue: ${desiredUri}. Inserting...`);
    await insertSongIntoQueue(desiredUri, {
      uri: trackAtTarget.uri,
      uid: trackAtTarget.uid
    });
    const newUid = await getUidAtPosition(targetPos);
    if (newUid) {
      movedSongsCorrectPosition.set(desiredUri, newUid);
    }
  }
  async function reorderChain(chain, anchor) {
    var _a;
    const movedSongsCorrectPosition = /* @__PURE__ */ new Map();
    for (let j = 0; j < chain.length; j++) {
      const desiredUri = chain[j];
      const targetPos = anchor.index + j;
      try {
        const currentQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
        const trackAtTarget = currentQueue[targetPos];
        const trackAtTargetUri = (trackAtTarget == null ? void 0 : trackAtTarget.uri) || ((_a = trackAtTarget == null ? void 0 : trackAtTarget.track) == null ? void 0 : _a.uri);
        if (trackAtTargetUri === desiredUri) {
          movedSongsCorrectPosition.set(desiredUri, trackAtTarget.uid);
          continue;
        }
        const songExists = currentQueue.find((entry) => {
          var _a2;
          const foundUri = entry.uri || ((_a2 = entry.track) == null ? void 0 : _a2.uri);
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
  async function findDuplicates(chain, movedSongsCorrectPosition) {
    var _a;
    try {
      const finalQueue = (await Spicetify.Platform.PlayerAPI.getQueue()).nextUp || [];
      const tracksToRemove = [];
      for (const track of finalQueue) {
        const trackUri = track.uri || ((_a = track.track) == null ? void 0 : _a.uri);
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
  async function removeDuplicates(tracksToRemove) {
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
  async function processChain(chain, nextTracks) {
    try {
      const anchor = findChainAnchor(chain, nextTracks);
      if (!anchor) {
        return;
      }
      const movedSongsCorrectPosition = await reorderChain(chain, anchor);
      console.log("Starting duplicate cleanup...");
      const duplicates = await findDuplicates(chain, movedSongsCorrectPosition);
      const removedCount = await removeDuplicates(duplicates);
      console.log(`Removed ${removedCount} duplicate(s)`);
    } catch (err) {
      console.error("Failed to process chain:", err);
      throw err;
    }
  }
  async function enforceChainOrder() {
    try {
      if (!checkAPIsAvailable()) {
        console.warn("Required APIs not available");
        return;
      }
      if (!isShuffleModeEnabled()) {
        console.groupEnd();
        return;
      }
      const allChains = getChainsForCurrentContext();
      if (allChains.length === 0) {
        console.log("No chains found");
        console.groupEnd();
        return;
      }
      const nextTracks = await getQueueNextTracks();
      for (const chain of allChains) {
        await processChain(chain, nextTracks);
      }
    } catch (err) {
      console.error("Fatal error:", err);
      Spicetify.showNotification("Failed to enforce song chains", true);
    }
  }

  // src/app.tsx
  var songChangeListener = null;
  function checkAPIsAvailable2() {
    var _a;
    if (!((_a = Spicetify == null ? void 0 : Spicetify.Platform) == null ? void 0 : _a.PlayerAPI)) {
      console.warn("Spicetify.Platform.PlayerAPI not available");
      return false;
    }
    if (!(Spicetify == null ? void 0 : Spicetify.ContextMenu)) {
      console.warn("Spicetify.ContextMenu not available");
      return false;
    }
    if (!(Spicetify == null ? void 0 : Spicetify.Player)) {
      console.warn("Spicetify.Player not available");
      return false;
    }
    return true;
  }
  function initialize() {
    try {
      initContextMenu();
      songChangeListener = async () => {
        try {
          setTimeout(() => {
            enforceChainOrder().catch((err) => {
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
  function main() {
    if (!checkAPIsAvailable2()) {
      setTimeout(main, 300);
      return;
    }
    initialize();
  }
  var app_default = main;

  // ../../../../../../tmp/spicetify-creator/index.jsx
  (async () => {
    await app_default();
  })();
})();

      })();