const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");

puppeteer.use(StealthPlugin());

const TOTAL_PAGES = 2090;
const URL_TEMPLATE = "https://shoob.gg/cards?page=";
const LAST_PAGE_FILE = "last_page.txt";
const DATA_FILE = "cards_by_tier.json";

let browser;

async function startBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            executablePath: "/usr/bin/chromium",
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
    }
}

async function fetchCardDetails(cardId) {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 800 });

    try {
        const url = `https://shoob.gg/cards/info/${cardId}`;
        console.log(`Fetching card details: ${url}`);

        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
        await new Promise(resolve => setTimeout(resolve, 5000));
        await page.waitForSelector(".card-info", { timeout: 30000 });

        const cardDetails = await page.evaluate(() => {
            const name = document.querySelector(".card-name")?.textContent.trim();
            const tierText = document.querySelector(".card-tier")?.textContent.trim();
            const tier = tierText === "S" ? "S" : `Tier ${tierText}`;
            return { id: window.location.pathname.split("/").pop(), name, tier };
        });

        return cardDetails;
    } catch (error) {
        console.error(`Error fetching card ${cardId}:`, error);
        return null;
    } finally {
        await page.close();
    }
}

async function fetchAndStoreCardIds(pageNumber) {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36");
    try {
        const url = `${URL_TEMPLATE}${pageNumber}`;
        console.log(`Fetching page: ${url}`);

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForSelector("a[href^='/cards/info/']", { timeout: 10000 });

        const cardIds = await page.$$eval("a[href^='/cards/info/']", links =>
            links.map(link => link.getAttribute("href").split("/").pop())
        );

        if (cardIds.length > 0) {
            for (const cardId of cardIds) {
                const cardDetails = await fetchCardDetails(cardId);
                if (cardDetails) {
                    saveToJSON(cardDetails);
                }
            }
            saveLastPage(pageNumber);
        }
    } catch (error) {
        console.error(`Error fetching page ${pageNumber}:`, error);
        process.exit(1);
    } finally {
        await page.close();
    }
}

function saveToJSON(cardDetails) {
    const data = readDataFile();
    const { tier, id } = cardDetails;

    if (!data[tier]) {
        data[tier] = [];
    }
    data[tier].push(id);

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`Saved card ${id} under ${tier}`);
}

function readDataFile() {
    if (fs.existsSync(DATA_FILE)) {
        const existingData = fs.readFileSync(DATA_FILE, "utf-8");
        return existingData ? JSON.parse(existingData) : {};
    }
    return {};
}

function saveLastPage(pageNumber) {
    fs.writeFileSync(LAST_PAGE_FILE, pageNumber.toString());
}

function readLastPage() {
    if (fs.existsSync(LAST_PAGE_FILE)) {
        const lastPage = fs.readFileSync(LAST_PAGE_FILE, "utf-8");
        return parseInt(lastPage) || 0;
    }
    return 0;
}

async function scrapeAllPages() {
    try {
        await startBrowser();
        const lastFetchedPage = readLastPage();
        let startPage = lastFetchedPage + 1;

        console.log(startPage === 1 ? "Starting from page 1..." : `Resuming from page ${startPage}...`);

        for (let i = startPage; i <= TOTAL_PAGES; i++) {
            await fetchAndStoreCardIds(i);
        }

        console.log("Scraping completed!");
        await browser.close();
    } catch (error) {
        console.error("Critical error occurred during scraping:", error);
        process.exit(1);
    }
}

scrapeAllPages();
