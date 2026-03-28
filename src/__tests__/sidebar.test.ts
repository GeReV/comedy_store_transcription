// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderSidebar, updateSidebarState } from "../sidebar.js";
import type { EpisodeLines } from "../types.js";

const INDEX = [
    { id: "ep1", title: "פרק 1", num: 1 },
    { id: "ep2", title: "פרק 2", num: 2 },
];

const SUBS: Map<string, EpisodeLines> = new Map([
    ["ep1", [{ start: 0, end: 2, text: "שלום עולם" }]],
    ["ep2", [{ start: 0, end: 2, text: "להתראות" }]],
]);

function container(): HTMLElement {
    const el = document.createElement("div");
    renderSidebar(el, INDEX);
    return el;
}

describe("updateSidebarState — filtered class on sidebar-list", () => {
    it("adds 'filtered' class to .sidebar-list when query meets minimum length", () => {
        const c = container();
        updateSidebarState(c, SUBS, "שלום");
        expect(c.querySelector(".sidebar-list")?.classList.contains("filtered")).toBe(true);
    });

    it("removes 'filtered' class from .sidebar-list when query is empty", () => {
        const c = container();
        updateSidebarState(c, SUBS, "שלום");
        updateSidebarState(c, SUBS, "");
        expect(c.querySelector(".sidebar-list")?.classList.contains("filtered")).toBe(false);
    });

    it("removes 'filtered' class from .sidebar-list when query is shorter than minimum", () => {
        const c = container();
        updateSidebarState(c, SUBS, "שלום");
        updateSidebarState(c, SUBS, "ש");
        expect(c.querySelector(".sidebar-list")?.classList.contains("filtered")).toBe(false);
    });
});
