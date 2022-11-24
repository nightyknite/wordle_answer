const puppeteer = require('puppeteer');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { candiateWords } = require('./candiateWords');
const delay = (time) => {
    return new Promise((resolve) => { 
        setTimeout(resolve, time)
    });
}
const getResultWords = async (page) => {
    const rowSelector = 'div[class*="Row-module_row"]';
    const datas = await page.evaluate((selector) => {
      let datas = [];
      const rows = document.querySelectorAll(selector);
      rows.forEach((element) => {
         const cellSelector = 'div[class*="Tile-module_tile"]';
         const cells = element.querySelectorAll(cellSelector);
         let dataCells = [];
         cells.forEach((cell) => {
            dataCells.push({text: cell.textContent, state:cell.dataset.state})
          });
          datas.push(dataCells);
      });    
      return datas;
    }, rowSelector);
    return datas;
}

const inputWords = async (page, words) => {
    for (word of words) {
        await delay(1000);
        await page.keyboard.type(word);
        await page.keyboard.press('Enter');
        await delay(1000);
    }
};

const convCell = (state) => {
    if (state === 'correct') return '🟩';
    if (state === 'absent') return '⬜';
    if (state === 'present') return '🟨';
    if (state === 'empty') return '';
}

const generateResultCells =  (list) => {
    for (row of list) {
        console.log(row.map((c) => convCell(c.state)).join(''));
    }
};

const getCorrectWord =  (list) => {
    for (row of list) {
        const isCorrect = row.every((c) => {return c.state === 'correct';});
        if (isCorrect) return row.map((c) => c.text).join('');
    }
    return '';
};


const getCandidateWord = (result) => {

    return candiateWords[Math.floor(Math.random() * candiateWords.length)];
}

const searchCorrectWords = async (page) => {
    let correctWord = '';
    let result = [];
    let candiateWord = '';
    for (let word of ['rugby', 'moved', 'plans', 'witch']) {
        candiateWord = word;
        console.log(candiateWord);
        await inputWords(page, [candiateWord]);
        await delay(1000);
        result = await getResultWords(page);
        await delay(1000);
        generateResultCells(result);
        // 4回以内で正解
        correctWord = getCorrectWord(result);
        if (correctWord !== '') {
            return;
        }
    }


    // 5回目入力
    candiateWord = getCandidateWord(result);
    console.log(candiateWord);
    await inputWords(page, [candiateWord]);
    await delay(1000);
    result = await getResultWords(page);
    await delay(1000);
    generateResultCells(result);
    // 5回目で正解
    correctWord = getCorrectWord(result);
    if (correctWord !== '') {
        console.log(correctWord);
        return;
    }

    // 6回目入力
    candiateWord = getCandidateWord(result);
    console.log(candiateWord);
    await inputWords(page, [candiateWord]);
    await delay(1000);
    result = await getResultWords(page);
    await delay(1000);
    generateResultCells(result);
    // 6回目で正解
    correctWord = getCorrectWord(result);
    if (correctWord !== '') {
        console.log(correctWord);
        return;
    }
    console.log(result);
    return;

};

(async () => {
  const TARGET_URL = 'https://www.nytimes.com/games/wordle/index.html';
  const options = {
    headless: true,
  };
  const browser = await puppeteer.launch(options);
  const page = await browser.newPage();

  await page.goto(TARGET_URL);
  await page.screenshot({ path: 'wordle1.png', fullPage: true });
  await page.click('button[aria-label="Close"]');
  await searchCorrectWords(page);
  await page.screenshot({ path: 'wordle2.png', fullPage: true });
  await browser.close();

})()
