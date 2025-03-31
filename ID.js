const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");

puppeteer.use(StealthPlugin());

const TOTAL_PAGES = 2090;
const URL_TEMPLATE = "https://shoob.gg/cards?page=";
const LAST_PAGE_FILE = "last_page.txt";
const DATA_FILE = "cards_tier_data.json";

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
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 800 });

    try {
        const url = `https://shoob.gg/cards/info/${cardId}`;
        console.log(`Fetching card details: ${url}`);

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(3000);
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForSelector(".cardData video, .cardData img", { timeout: 5000 }).catch(() => {});

        const cardDetails = await page.evaluate(() => {
            const getText = (selector) => document.querySelector(selector)?.innerText?.trim() || null;
            const getImage = () => {
                const videoElement = document.querySelector(".cardData video");
                const videoSource = videoElement?.querySelector("source")?.src;
                const videoSrc = videoSource || videoElement?.src;
                const imgSrc = document.querySelector(".cardData img")?.src;
                return videoSrc || imgSrc || "N/A";
            };

            const creators = [...document.querySelectorAll(".user_purchased p")]
                .map(p => p.textContent.split(":")[1]?.trim())
                .filter(Boolean)
                .join(", ") || "Creator is Anonymous";

            let cardName =
                getText(".breadcrumb-new span[itemprop='name']:nth-child(3)") ||
                getText(".cardTitle") ||
                getText(".card-name") ||
                "N/A";

            if (!cardName) {
                const metaDescription = document.querySelector("meta[name='description']")?.content;
                const match = metaDescription?.match(/^(.*?) from /);
                cardName = match ? match[1] : "N/A";
            }

            const tier = Array.from(document.querySelectorAll(".breadcrumb-new span[itemprop='name']"))
                .find(el => el.innerText.startsWith("Tier"))?.innerText.split("Tier")[1].trim() || "Unknown";

            return {
                name: cardName,
                image: getImage(),
                description: document.querySelector("meta[name='description']")?.content.split("\n")[0] || "N/A",
                tier,
                creators
            };
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
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    
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
    
    const tier = cardDetails.tier || "Unknown";

    if (!data[tier]) {
        data[tier] = [];
    }

    data[tier].push(cardDetails);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`Saved new card in ${tier}. Total cards in ${tier}: ${data[tier].length}`);
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
