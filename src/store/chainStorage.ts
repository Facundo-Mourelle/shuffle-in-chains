export const STORAGE_KEY = "chained-songs:data";

interface ChainData {
    [playlistUri: string]: string[][];
}

export class ChainedSongsManager {
    static getChains(): ChainData {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    }

    static saveChain(playlistUri: string, uris: string[]) {
        const data = this.getChains();
        if (!data[playlistUri]) data[playlistUri] = [];

        // Prevent duplicate chains involving the same songs
        data[playlistUri] = data[playlistUri].filter(chain =>
            !chain.some(uri => uris.includes(uri))
        );

        data[playlistUri].push(uris);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
}
