// src/__tests__/router.test.ts
import { describe, it, expect } from "vitest";
import { parseHash, buildEpisodeHash } from "../router.js";

describe("parseHash", () => {
    it("empty hash → welcome", () => {
        expect(parseHash("")).toEqual({ kind: "welcome" });
        expect(parseHash("#")).toEqual({ kind: "welcome" });
    });

    it("search hash → results", () => {
        expect(parseHash("#search/%D7%A9%D7%9C%D7%95%D7%9D")).toEqual({
            kind: "results",
            query: "שלום",
        });
    });

    it("bare episode hash → episode without filter", () => {
        expect(parseHash("#episode/ep1")).toEqual({
            kind: "episode",
            id: "ep1",
            lineIndex: undefined,
            query: undefined,
        });
    });

    it("episode hash with ?q= → episode with filter", () => {
        expect(parseHash("#episode/ep1?q=%D7%A9%D7%9C%D7%95%D7%9D")).toEqual({
            kind: "episode",
            id: "ep1",
            lineIndex: undefined,
            query: "שלום",
        });
    });

    it("episode hash with lineIndex and ?q= → episode with lineIndex and filter", () => {
        expect(parseHash("#episode/ep1/42?q=%D7%A9%D7%9C%D7%95%D7%9D")).toEqual({
            kind: "episode",
            id: "ep1",
            lineIndex: 42,
            query: "שלום",
        });
    });

    it("chapter hash → chapter", () => {
        expect(parseHash("#episode/ep1/ch-3")).toEqual({
            kind: "chapter",
            episodeId: "ep1",
            chapterIdx: 3,
        });
    });

    it("unknown hash → welcome", () => {
        expect(parseHash("#something/unknown")).toEqual({ kind: "welcome" });
    });

    it("encoded episode id is decoded", () => {
        const encoded = encodeURIComponent("פרק_001");
        const result = parseHash(`#episode/${encoded}`);
        expect(result).toEqual({ kind: "episode", id: "פרק_001", lineIndex: undefined, query: undefined });
    });
});

describe("buildEpisodeHash", () => {
    it("bare episode", () => {
        expect(buildEpisodeHash("ep1")).toBe("episode/ep1");
    });

    it("episode with lineIndex", () => {
        expect(buildEpisodeHash("ep1", 42)).toBe("episode/ep1/42");
    });

    it("episode with query", () => {
        expect(buildEpisodeHash("ep1", undefined, "שלום")).toBe(
            "episode/ep1?q=%D7%A9%D7%9C%D7%95%D7%9D",
        );
    });

    it("episode with lineIndex and query", () => {
        expect(buildEpisodeHash("ep1", 42, "שלום")).toBe(
            "episode/ep1/42?q=%D7%A9%D7%9C%D7%95%D7%9D",
        );
    });

    it("undefined query produces no ?q= suffix", () => {
        expect(buildEpisodeHash("ep1", undefined, undefined)).toBe("episode/ep1");
    });

    it("encodes episode id", () => {
        expect(buildEpisodeHash("פרק_001")).toBe(`episode/${encodeURIComponent("פרק_001")}`);
    });
});
