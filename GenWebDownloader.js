/*
   _____        __          __  _     _____                      _                 _           
  / ____|       \ \        / / | |   |  __ \                    | |               | |          
 | |  __  ___ _ _\ \  /\  / /__| |__ | |  | | _____      ___ __ | | ___   __ _  __| | ___ _ __ 
 | | |_ |/ _ \ '_ \ \/  \/ / _ \ '_ \| |  | |/ _ \ \ /\ / / '_ \| |/ _ \ / _` |/ _` |/ _ \ '__|
 | |__| |  __/ | | \  /\  /  __/ |_) | |__| | (_) \ V  V /| | | | | (_) | (_| | (_| |  __/ |   
  \_____|\___|_| |_|\/  \/ \___|_.__/|_____/ \___/ \_/\_/ |_| |_|_|\___/ \__,_|\__,_|\___|_|   
                                                                                                                                                                                                                                                                               
GenWebDownloader_logo
*/

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const chalk = require('chalk');

const prefix = `${chalk.yellow('[')} ${chalk.red('GenWebDownloader')} ${chalk.yellow(']')} ${chalk.blue('»')} `;

async function downloadResource(url, baseDir) {
    try {
        const { data } = await axios.get(url, { responseType: 'arraybuffer' });
        const resourceUrl = new URL(url);
        const resourcePath = path.join(baseDir, resourceUrl.pathname);
        const resourceDir = path.dirname(resourcePath);

        if (!fs.existsSync(resourceDir)) {
            fs.mkdirSync(resourceDir, { recursive: true });
        }

        fs.writeFileSync(resourcePath, data);
        console.log(`${prefix} Ресурс загружен: ${chalk.green(resourcePath)}`);
        return path.relative(baseDir, resourcePath);
    } catch (error) {
        console.error(`${prefix} Ошибка при загрузке ресурса: ${chalk.green(url)}`, error);
    }
}

async function downloadWebsite(siteUrl) {
    const baseDir = path.join(__dirname, new URL(siteUrl).hostname);
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir);
    }

    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (['image', 'stylesheet', 'font', 'script'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        try {
            await page.goto(siteUrl, { waitUntil: 'networkidle2', timeout: 90000 }); 
        } catch (error) {
            if (error.name === 'TimeoutError') {
                console.error(`${prefix} Превышено время ожидания загрузки страницы: ${chalk.green(siteUrl)}`);
                await browser.close();
                return;
            } else {
                throw error;
            }
        }

        const html = await page.content();
        await browser.close();

        const $ = cheerio.load(html);
        const baseUrl = new URL(siteUrl).origin;
        const resources = [];

        $('link[href], script[src], img[src]').each((_, element) => {
            const srcAttr = element.tagName === 'link' ? 'href' : 'src';
            const resourceUrl = $(element).attr(srcAttr);

            if (resourceUrl) {
                const absoluteUrl = new URL(resourceUrl, baseUrl).href;
                resources.push(downloadResource(absoluteUrl, baseDir));
                $(element).attr(srcAttr, path.relative(baseDir, path.join(baseDir, new URL(absoluteUrl).pathname)));
            }
        });

        await Promise.all(resources);
        fs.writeFileSync(path.join(baseDir, 'index.html'), $.html(), 'utf8');

        console.log(`${prefix} Сайт успешно загружен в директорию: ${chalk.green(baseDir)}`);
    } catch (error) {
        console.error(`${prefix} Ошибка при загрузке сайта:`, error);
    }
}

// Получение URL с консоли
const siteUrl = process.argv[2];
if (siteUrl) {
    downloadWebsite(siteUrl);
} else {
    console.error(`${prefix} Пожалуйста, укажите URL сайта как аргумент командной строки.`);
    process.exit(1);
}
