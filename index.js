const puppeteer = require('puppeteer');
const { JSDOM } = require('jsdom');
const axios = require('axios');

const TARGET_URL = 'https://www.nytimes.com/games/wordle/index.html';
let candiateWords = [];
let wordleResponse = [];

const delay = (time) => {
  return new Promise((resolve) => { 
    setTimeout(resolve, time)
  });
}

const getWordleResponse = async (page) => {
  const rowSelector = 'div[class*="Row-module_row"]';
  const datas = await page.evaluate((selector) => {
    let datas = [];
    const rows = document.querySelectorAll(selector);
    rows.forEach((element) => {
      const cellSelector = 'div[class*="Tile-module_tile"]';
      const cells = element.querySelectorAll(cellSelector);
      let dataCells = [];
      cells.forEach((cell) => {
        dataCells.push({text: cell.textContent, state: cell.dataset.state})
      });
      datas.push(dataCells);
    });
    return datas;
  }, rowSelector);
  return datas;
}

const inputWords = async (page, words) => {
  for (const word of words) {
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

const generateResultCells = () => {
  for (const row of wordleResponse) {
    console.log(row.map((c) => convCell(c.state)).join(''));
  }
};

const getCorrectWord = () => {
  for (const row of wordleResponse) {
    const isCorrect = row.every((c) => {return c.state === 'correct';});
    if (isCorrect) return row.map((c) => c.text).join('');
  }
  return '';
};

const getCandidateWord = () => {
    
  let words = [];
  words = candiateWords;

  if (wordleResponse.length === 0) {
    return words[Math.floor(Math.random() * words.length)];
  }

  // 全て存在する文字のみの候補
  const presentLetters = wordleResponse.flat().filter(v => v.state === 'present' || v.state === 'correct').map(v => v.text);
  if (presentLetters && presentLetters.length > 0) {
    words = words.filter((word) => {            
      return presentLetters.every(v => {
        return word.indexOf(v) >= 0;
      });
    });
  }

  // 存在しない文字を除外した候補
  let absentLetters = wordleResponse.flat().filter(v => v.state === 'absent').map(v => v.text);
  if (absentLetters && absentLetters.length > 0) {
    if (presentLetters && presentLetters.length > 0) {
      // presentにある文字は除外する
      absentLetters = absentLetters.filter(v => {
        return !presentLetters.some(w => w === v);
      });
    }
    words = words.filter((word) => {
      return !absentLetters.some(v => {
        return word.indexOf(v) >= 0
      });
    });
  }

  // 前回使用した文字を除外
  words = words.filter((word) => {
    for (const items of wordleResponse) {
      if (word === items[0].text + items[1].text + items[2].text + items[3].text + items[4].text) {
        return false;
      }
    }
    return true;
  });

  // 存在してかつ位置も同じ条件で絞り込む
  let correctWords = ['', '', '', '', ''];
  for (const items of wordleResponse) {
    for (let i = 0; i < 5; i++) {
      if (items[i].state === 'correct') {
        correctWords[i] = items[i].text;
      }
    }
  }
  for (let i = 0; i < correctWords.length; i++) {
    if (correctWords[i] !== '') {
      words = words.filter((word) => { 
        return word[i] === correctWords[i];
      });
    }
  }

  console.log('candiate', words);
  const candidateWord = words[Math.floor(Math.random() * words.length)];
  return candidateWord;
}

const searchCorrectWords = async (page) => {
  let correctWord = '';
  let candiateWord = '';

  for (let word of ['rugby', 'moved', 'plans', 'witch']) {
    candiateWord = word;
    console.log(candiateWord);
    getCandidateWord();
    await inputWords(page, [candiateWord]);
    await delay(1000);
    wordleResponse = await getWordleResponse(page);
    await delay(1000);
    generateResultCells();
    // 4回以内で正解
    correctWord = getCorrectWord();
    if (correctWord !== '') {
      return;
    }
  }

  // 5回目入力
  candiateWord = getCandidateWord();
  console.log(candiateWord);
  await inputWords(page, [candiateWord]);
  await delay(1000);
  wordleResponse = await getWordleResponse(page);
  await delay(1000);
  generateResultCells();
  // 5回目で正解
  correctWord = getCorrectWord();
  if (correctWord !== '') {
    console.log('answer', correctWord);
    return;
  }

  // 6回目入力
  candiateWord = getCandidateWord();
  console.log(candiateWord);
  await inputWords(page, [candiateWord]);
  await delay(1000);
  wordleResponse = await getWordleResponse(page);
  await delay(1000);
  generateResultCells();
  // 6回目で正解
  correctWord = getCorrectWord();
  if (correctWord !== '') {
    console.log('answer', correctWord);
    return;
  }
  return;

};

const setCandiateBaseWords = async () => {
  const res = await axios.get(TARGET_URL);
  const { data } = res;
  const dom = new JSDOM(data);
  const scriptLists = dom.window.document.querySelectorAll('script');
  for (let item of scriptLists) {
    if (item.src.indexOf('wordle.') != -1) {
      const resc = await axios.get(item.src);
      let content = resc.data;
      content = content.slice(content.indexOf('it=[') + 4, content.length);
      content = content.slice(0, content.indexOf(']'));
      const words = content.replace(/"/g, '').split(',');
      candiateWords = words;
      break;
    }
  }
}

(async () => {
  const options = {
    headless: true,
  };

  await setCandiateBaseWords();

  const browser = await puppeteer.launch(options);
  const page = await browser.newPage();

  await page.goto(TARGET_URL);
  await page.screenshot({ path: 'wordle1.png', fullPage: true });
  await page.click('button[aria-label="Close"]');
  await searchCorrectWords(page);
  await page.screenshot({ path: 'wordle2.png', fullPage: true });
  await browser.close();

})()
