const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");

puppeteer.use(StealthPlugin());

const TOTAL_PAGES = 2090;
const URL_TEMPLATE = "https://shoob.gg/cards?page=";
const DATA_FILE = "cards_by_tier.json";

let browser;

async function startBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            executablePath: "/usr/bin/chromium-browser",
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
    }
}

async function fetchCardDetails(cardId) {
    const page = await browser.newPage();
    try {
        const url = `https://shoob.gg/cards/info/${cardId}`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForSelector(".card-info", { timeout: 10000 });

        const cardDetails = await page.evaluate(() => {
            return {
                id: document.URL.split("/").pop(),
                tier: document.querySelector(".card-tier")?.textContent.trim() || "Unknown",
            };
        });

        return cardDetails;
    } catch (error) {
        console.error(`Error fetching card ${cardId}:`, error);
    } finally {
        await page.close();
    }
}

async function fetchAndStoreCardIds(pageNumber) {
    const page = await browser.newPage();
    try {
        await page.goto(`${URL_TEMPLATE}${pageNumber}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForSelector("a[href^='/cards/info/']", { timeout: 10000 });

        const cardIds = await page.$$eval("a[href^='/cards/info/']", links =>
            [...new Set(links.map(link => link.getAttribute("href").split("/").pop()))]
        );

        for (const cardId of cardIds) {
            const cardDetails = await fetchCardDetails(cardId);
            if (cardDetails) {
                saveToJSON(cardDetails);
            }
        }
    } catch (error) {
        console.error(`Error fetching page ${pageNumber}:`, error);
    } finally {
        await page.close();
    }
}

function saveToJSON({ id, tier }) {
    const data = readDataFile();
    if (!data[tier]) data[tier] = new Set();
    data[tier].add(id);
    
    const formattedData = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, [...value]])
    );
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(formattedData, null, 2));
    console.log(`Saved card ${id} in ${tier}`);
}

function readDataFile() {
    if (fs.existsSync(DATA_FILE)) {
        const existingData = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
        return Object.fromEntries(
            Object.entries(existingData).map(([key, value]) => [key, new Set(value)])
        );
    }
    return {};
}

async function scrapeAllPages() {
    try {
        await startBrowser();
        for (let i = 1; i <= TOTAL_PAGES; i++) {
            await fetchAndStoreCardIds(i);
        }
        console.log("Scraping completed!");
        await browser.close();
    } catch (error) {
        console.error("Critical error during scraping:", error);
    }
}

scrapeAllPages();
