export type Route =
    | { kind: "welcome" }
    | { kind: "results"; query: string }
    | { kind: "episode"; id: string; lineIndex?: number }
    | { kind: "chapter"; episodeId: string; chapterIdx: number };

export function parseHash(hash: string): Route {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return { kind: "welcome" };

    if (raw.startsWith("search/")) {
        const query = decodeURIComponent(raw.slice("search/".length));
        return { kind: "results", query };
    }

    if (raw.startsWith("episode/")) {
        const rest = raw.slice("episode/".length);
        const slashIdx = rest.lastIndexOf("/");
        if (slashIdx !== -1) {
            const id = decodeURIComponent(rest.slice(0, slashIdx));
            const seg = rest.slice(slashIdx + 1);
            if (seg.startsWith("ch-")) {
                const chapterIdx = parseInt(seg.slice(3), 10);
                if (!isNaN(chapterIdx)) {
                    return { kind: "chapter", episodeId: id, chapterIdx };
                }
            }
            const lineIndex = parseInt(seg, 10);
            return { kind: "episode", id, lineIndex: isNaN(lineIndex) ? undefined : lineIndex };
        }
        return { kind: "episode", id: decodeURIComponent(rest) };
    }

    return { kind: "welcome" };
}

export function buildEpisodeHash(id: string, lineIndex?: number, query?: string): string {
    let h = `episode/${encodeURIComponent(id)}`;
    if (lineIndex !== undefined) { h += `/${lineIndex}`; }
    if (query) { h += `?q=${encodeURIComponent(query)}`; }
    return h;
}
