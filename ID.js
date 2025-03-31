const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");

puppeteer.use(StealthPlugin());

async function startBrowser() {
    return await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
}

async function fetchCardDetails(cardId, browser) {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    try {
        const url = `https://shoob.gg/cards/info/${cardId}`;
        console.log(`Fetching card: ${url}`);

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(3000);
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForSelector(".cardData video, .cardData img", { timeout: 5000 }).catch(() => {});

        const cardData = await page.evaluate(() => {
            const getText = (selector) => document.querySelector(selector)?.innerText?.trim() || "N/A";
            const getImage = () => {
                const videoElement = document.querySelector(".cardData video");
                const videoSrc = videoElement?.querySelector("source")?.src || videoElement?.src;
                return videoSrc || document.querySelector(".cardData img")?.src || "N/A";
            };

            return {
                name: getText(".breadcrumb-new span[itemprop='name']:nth-child(3')") || getText(".cardTitle") || "N/A",
                image: getImage(),
                description: document.querySelector("meta[name='description']")?.content.split("\n")[0] || "N/A",
                tier: Array.from(document.querySelectorAll(".breadcrumb-new span[itemprop='name']"))
                    .find(el => el.innerText.startsWith("Tier"))?.innerText.split("Tier")[1].trim() || "Unknown",
                creator: [...document.querySelectorAll(".user_purchased p")]
                    .map(p => p.textContent.split(":")[1]?.trim())
                    .filter(Boolean)
                    .join(", ") || "Anonymous"
            };
        });

        return cardData;
    } catch (error) {
        console.error(`Error fetching ${cardId}:`, error);
        return null;
    } finally {
        await page.close();
    }
}

(async () => {
    const browser = await startBrowser();
    const cardId = "1000228097"; // Example card ID, replace with actual ID
    const cardDetails = await fetchCardDetails(cardId, browser);
    
    console.log("Card Data:", cardDetails);
    await browser.close();
})();
