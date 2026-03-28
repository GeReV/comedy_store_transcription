import { test, expect } from "@playwright/test";
import type { Route } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const fixtureData = fs.readFileSync(
    path.join(__dirname, "fixtures/subtitles.json"),
    "utf-8",
);

// Intercept both the gzip and plain JSON requests so the app always loads
// fixture data regardless of which fetch path it takes.
async function mockSubtitles(route: Route): Promise<void> {
    await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: fixtureData,
    });
}

test.beforeEach(async ({ page }) => {
    await page.route("**/data/subtitles.json.gz", mockSubtitles);
    await page.route("**/data/subtitles.json", mockSubtitles);
});

// ---------------------------------------------------------------------------
// Test 1: Welcome → Results: typing a query shows #search/… URL and results
// ---------------------------------------------------------------------------
test("welcome → results: typing query navigates to #search/…", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".welcome-message");

    await page.fill("#query", "שלום");
    await page.waitForSelector(".results-episode");

    expect(page.url()).toContain("#search/%D7%A9%D7%9C%D7%95%D7%9D");
    await expect(page.locator(".results-episode")).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// Test 2: Results → Welcome: clearing query returns to # URL
// ---------------------------------------------------------------------------
test("results → welcome: clearing query returns to #", async ({ page }) => {
    await page.goto("/");
    await page.fill("#query", "שלום");
    await page.waitForSelector(".results-episode");

    await page.click("#query-clear");
    await page.waitForSelector(".welcome-message");

    expect(page.url()).toMatch(/#$/);
});

// ---------------------------------------------------------------------------
// Test 3: Back from results → welcome
// ---------------------------------------------------------------------------
test("back from results → welcome", async ({ page }) => {
    await page.goto("/");
    await page.fill("#query", "שלום");
    await page.waitForSelector(".results-episode");

    await page.goBack();
    await page.waitForSelector(".welcome-message");

    // After goBack, URL may be bare "/" or "/#" — both indicate welcome state
    const url = page.url();
    expect(url.endsWith("/") || url.endsWith("#")).toBe(true);
});

// ---------------------------------------------------------------------------
// Test 4: Results → clicking result line → filtered episode (#episode/ep1/N?q=…)
// ---------------------------------------------------------------------------
test("results → click result line → filtered episode with line index", async ({ page }) => {
    await page.goto("/");
    await page.fill("#query", "שלום");
    await page.waitForSelector(".result-line.match");

    const firstMatch = page.locator(".result-line.match").first();
    await firstMatch.click();

    await page.waitForSelector(".episode-header");

    const url = page.url();
    expect(url).toContain("#episode/ep1/");
    expect(url).toContain("?q=");
});

// ---------------------------------------------------------------------------
// Test 5: Results → clicking episode title → filtered episode (#episode/ep1?q=…)
// ---------------------------------------------------------------------------
test("results → click episode title → filtered episode without line index", async ({ page }) => {
    await page.goto("/");
    await page.fill("#query", "שלום");
    await page.waitForSelector(".results-episode-title");

    await page.locator(".results-episode-title").first().click();
    await page.waitForSelector(".episode-header");

    const url = page.url();
    expect(url).toContain("#episode/ep1");
    expect(url).toContain("?q=");
    // Ensure no line index is present between episode id and ?
    expect(url).not.toMatch(/#episode\/ep1\/\d+\?/);
});

// ---------------------------------------------------------------------------
// Test 6: Back from filtered episode → results
// ---------------------------------------------------------------------------
test("back from filtered episode → results", async ({ page }) => {
    // Build history: welcome → results → episode
    await page.goto("/");
    await page.fill("#query", "שלום");
    await page.waitForSelector(".results-episode");

    // Click episode title to navigate into filtered episode
    await page.locator(".results-episode-title").first().click();
    await page.waitForSelector(".episode-header");

    await page.goBack();
    await page.waitForSelector(".results-episode");

    expect(page.url()).toContain("#search/");
});

// ---------------------------------------------------------------------------
// Test 7: Filtered episode → clicking episode title → clears filter
// ---------------------------------------------------------------------------
test("filtered episode → click episode title → clears filter", async ({ page }) => {
    await page.goto("/#episode/ep1?q=%D7%A9%D7%9C%D7%95%D7%9D");
    await page.waitForSelector(".episode-header");

    const titleLink = page.locator(".episode-header a");
    await titleLink.click();
    await page.waitForURL(/.*#episode\/ep1$/);

    expect(page.url()).not.toContain("?q=");
    await expect(page.locator(".transcript-line.hidden")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Test 8: Filtered episode → breadcrumb Results link → results
// ---------------------------------------------------------------------------
test("filtered episode → breadcrumb results link → results view", async ({ page }) => {
    await page.goto("/#episode/ep1?q=%D7%A9%D7%9C%D7%95%D7%9D");
    await page.waitForSelector("#breadcrumb a[href*='search']");

    await page.locator("#breadcrumb a[href*='search']").click();
    await page.waitForSelector(".results-episode");

    expect(page.url()).toContain("#search/");
});

// ---------------------------------------------------------------------------
// Test 9: Episode → typing query → URL updates with ?q=
// ---------------------------------------------------------------------------
test("episode → typing query → URL updates with ?q=", async ({ page }) => {
    await page.goto("/#episode/ep1");
    await page.waitForSelector(".episode-header");

    await page.fill("#query", "שלום");
    await page.waitForURL(/.*\?q=/);

    const url = page.url();
    expect(url).toContain("#episode/ep1");
    expect(url).toContain("?q=");
});

// ---------------------------------------------------------------------------
// Test 10: Filtered episode → sidebar click → different filtered episode
// ---------------------------------------------------------------------------
test("filtered episode → sidebar click → different filtered episode", async ({ page }) => {
    await page.goto("/#episode/ep1?q=%D7%A9%D7%9C%D7%95%D7%9D");
    await page.waitForSelector(".episode-header");
    await page.waitForSelector(".sidebar-item");

    // Click ep2 in the sidebar
    const ep2Link = page.locator(".sidebar-link[href='#episode/ep2']");
    await ep2Link.click();
    await page.waitForURL(/.*#episode\/ep2/);

    const url = page.url();
    expect(url).toContain("#episode/ep2");
    expect(url).toContain("?q=");
});

// ---------------------------------------------------------------------------
// Test 11: Episode with chapters → clicking chapter header → chapter view
// ---------------------------------------------------------------------------
test("episode with chapters → click chapter header → chapter URL", async ({ page }) => {
    await page.goto("/#episode/ep2");
    await page.waitForSelector(".chapter-block-header");

    const chapterLink = page.locator("a.chapter-block-header").first();
    await chapterLink.click();
    await page.waitForURL(/.*#episode\/ep2\/ch-1$/);
});

// ---------------------------------------------------------------------------
// Test 12: Chapter → breadcrumb episode link → episode
// ---------------------------------------------------------------------------
test("chapter → breadcrumb episode link → episode", async ({ page }) => {
    await page.goto("/#episode/ep2/ch-1");
    await page.waitForSelector("#breadcrumb a[href*='episode/ep2']");

    await page.locator("#breadcrumb a[href*='episode/ep2']").click();
    await page.waitForURL(/.*#episode\/ep2$/);

    expect(page.url()).not.toContain("/ch-");
});

// ---------------------------------------------------------------------------
// Test 13: Back from chapter → episode
// ---------------------------------------------------------------------------
test("back from chapter → episode", async ({ page }) => {
    await page.goto("/#episode/ep2");
    await page.waitForSelector(".chapter-block-header");

    const chapterLink = page.locator("a.chapter-block-header").first();
    await chapterLink.click();
    await page.waitForURL(/.*#episode\/ep2\/ch-1$/);

    await page.goBack();
    await page.waitForURL(/.*#episode\/ep2$/);

    expect(page.url()).not.toContain("/ch-");
});

// ---------------------------------------------------------------------------
// Test 14: Short query (1 char) → status bar shows hint, URL NOT #search/…
// ---------------------------------------------------------------------------
test("short query → status hint shown, URL stays at welcome", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".welcome-message");

    await page.fill("#query", "א");

    // Status should show the minimum-length hint
    await expect(page.locator("#search-status")).toContainText("תווים");

    // URL should NOT have navigated to a search route
    expect(page.url()).not.toContain("#search/");
});

// ---------------------------------------------------------------------------
// Test 15: Direct load #episode/ep1?q=שלום → filter applied, query input populated
// ---------------------------------------------------------------------------
test("direct load filtered episode → filter applied and query input populated", async ({ page }) => {
    await page.goto("/#episode/ep1?q=%D7%A9%D7%9C%D7%95%D7%9D");
    await page.waitForSelector(".episode-header");

    // Query input should reflect the q= param
    await expect(page.locator("#query")).toHaveValue("שלום");

    // Only "שלום עולם" matches: the query ends with final mem (ם U+05DD),
    // but "שלומך" has regular mem (מ U+05DE) mid-word — so 2 of 3 lines are hidden.
    const hiddenLines = page.locator(".transcript-line.hidden");
    await expect(hiddenLines).toHaveCount(2);
});

// ---------------------------------------------------------------------------
// Test 16: sidebar-list gets 'filtered' class when query is active
// ---------------------------------------------------------------------------
test("sidebar-list has 'filtered' class when a search query is active", async ({ page }) => {
    await page.goto("/");
    await page.fill("#query", "שלום");
    await expect(page.locator(".sidebar-list.filtered")).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// Test 17: Back from results to welcome → sidebar-list loses 'filtered' class
// ---------------------------------------------------------------------------
test("back from results to welcome → sidebar-list loses 'filtered' class", async ({ page }) => {
    await page.goto("/");
    await page.fill("#query", "שלום");
    await expect(page.locator(".sidebar-list.filtered")).toHaveCount(1);
    await page.goBack();
    await expect(page.locator(".sidebar-list.filtered")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Test 18: Back from filtered episode to welcome → sidebar-list loses 'filtered' class
// ---------------------------------------------------------------------------
test("back from filtered episode to welcome → sidebar-list loses 'filtered' class", async ({ page }) => {
    await page.goto("/#episode/ep1?q=%D7%A9%D7%9C%D7%95%D7%9D");
    await page.waitForSelector(".episode-header");
    await expect(page.locator(".sidebar-list.filtered")).toHaveCount(1);
    // Navigate to welcome via hash
    await page.goto("/");
    await expect(page.locator(".sidebar-list.filtered")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Test 19: Back from results to welcome → status bar is cleared
// ---------------------------------------------------------------------------
test("back from results to welcome → status bar is cleared", async ({ page }) => {
    await page.goto("/");
    await page.fill("#query", "שלום");
    await expect(page.locator("#search-status")).toContainText("תוצאות");
    await page.goBack();
    await expect(page.locator("#search-status")).toHaveText("");
});
