const puppeteer = require('puppeteer');
const { JSDOM } = require('jsdom');
const axios = require('axios');

const TARGET_URL = 'https://www.nytimes.com/games/wordle/index.html';

const delay = (time) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};

const getCandiateBaseWords = async () => {
  const res = await axios.get(TARGET_URL);
  const { data } = res;
  const dom = new JSDOM(data);
  const scriptLists = dom.window.document.querySelectorAll('script');
  for (const item of scriptLists) {
    // scriptタグからwordle.xxx.js形式のファイルを読み込む
    if (item.src.indexOf('wordle.') != -1) {
      const resc = await axios.get(item.src);
      let content = resc.data;
      // ["". ... ""]の中にある単語一覧
      content = content.slice(content.indexOf('aahed'), content.length);
      content = content.slice(0, content.indexOf(']'));
      return content.replace(/"/g, '').split(',');
    }
  }
  return [];
};

const getWordleTable = async (page) => {
  const rowSelector = 'div[class*="Row-module_row"]';
  const table = await page.evaluate((selector) => {
    let dataRows = [];
    const rows = document.querySelectorAll(selector);
    rows.forEach((element) => {
      const cellSelector = 'div[class*="Tile-module_tile"]';
      const cells = element.querySelectorAll(cellSelector);
      let dataCells = [];
      cells.forEach((cell) => {
        if (cell.dataset.state !== 'empty') {
          dataCells.push({ text: cell.textContent, state: cell.dataset.state });
        }
      });
      if (dataCells.length > 0) {
        dataRows.push(dataCells);
      }
    });
    return dataRows;
  }, rowSelector);
  return table;
};

const inputWord = async (page, word) => {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
};

const convCell = (state) => {
  if (state === 'correct') return '🟩';
  if (state === 'absent') return '⬜';
  if (state === 'present') return '🟨';
  if (state === 'empty') return '';
};

const outputCells = (wordleTable) => {
  for (const row of wordleTable) {
    console.log(row.map((v) => convCell(v.state)).join(''));
  }
};

const getCorrectWord = (wordleTable) => {
  const row = wordleTable.find((row) =>
    row.every((v) => v.state === 'correct')
  );
  return row ? row.map((v) => v.text).join('') : '';
};

const filterByPresentLetter = (wordleTable, candiateWords) => {
  const presentLetters = wordleTable
    .flat()
    .filter((v) => v.state === 'present' || v.state === 'correct')
    .map((v) => v.text);
  if (!presentLetters) return candiateWords;
  return candiateWords.filter((word) => {
    return presentLetters.every((v) => {
      return word.indexOf(v) >= 0;
    });
  });
};

const filterByAbsentLetter = (wordleTable, candiateWords) => {
  const presentLetters = wordleTable
    .flat()
    .filter((v) => v.state === 'present' || v.state === 'correct')
    .map((v) => v.text);
  const absentLetters = wordleTable
    .flat()
    .filter((v) => v.state === 'absent')
    .filter((v) => presentLetters.indexOf(v.text) === -1)
    .map((v) => v.text);
  if (!absentLetters) return candiateWords;
  return candiateWords.filter((word) => {
    return !absentLetters.some((v) => {
      return word.indexOf(v) >= 0;
    });
  });
};

const filterByUsedWord = (wordleTable, candiateWords) => {
  return candiateWords.filter((word) => {
    return !wordleTable.some((letters) => {
      return word === letters.map((v) => v.text).join('');
    });
  });
};
const filterByCorrectLetter = (wordleTable, candiateWords) => {
  let correctWords = ['', '', '', '', ''];
  for (const items of wordleTable) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].state === 'correct') {
        correctWords[i] = items[i].text;
      }
    }
  }
  if (correctWords.join('').length === 0) return candiateWords;
  return candiateWords.filter((word) => {
    return correctWords.every((v, i) => {
      return v.length === 0 || v === word[i];
    });
  });
};
const filterByPresentLetterPosition = (wordleTable, candiateWords) => {
  // present文字で文字の位置がすでに使用したものと同じ位置は除外する
  if (!wordleTable.flat().some((v) => v.state === 'present'))
    return candiateWords;
  return candiateWords.filter((word) => {
    return !wordleTable.some((row) => {
      return row.some((v, i) => {
        return v.state === 'present' && v.text === word[i];
      });
    });
  });
};

const getCandidateWords = (wordleTable, candiateWords) => {
  let words = candiateWords;
  if (wordleTable.length === 0) return words;
  words = filterByPresentLetter(wordleTable, words);
  console.log('filterByPresentLetter', words)
  words = filterByAbsentLetter(wordleTable, words);
  console.log('filterByAbsentLetter', words)
  // words = filterByUsedWord(wordleTable, words);
  // console.log('filterByUsedWord', words)
  words = filterByCorrectLetter(wordleTable, words);
  console.log('filterByCorrectLetter', words)
  words = filterByPresentLetterPosition(wordleTable, words);
  console.log('PresentLetterPosition', words);
  return words;
};

const getInputCandidateWord = (wordleTable, candiateWords) => {
  const words = getCandidateWords(wordleTable, candiateWords);
  if (wordleTable.length < 3) {
    const uniqWords = words.filter((word) => {
      return [...new Set([...word])].length === word.length;
    });
    if (uniqWords.length > 0) {
      // ２つ以上の同じ文字を含まない単語を優先する
      return uniqWords[Math.floor(Math.random() * uniqWords.length)];
    }
  }
  return words[Math.floor(Math.random() * words.length)];
};
const operateWordlePage = async (page) => {
  // 解答候補単語全リストを取得
  const candiateWords = await getCandiateBaseWords();

  for (const word of ['', '', '', '', '', '']) {
    let wordleTable = await getWordleTable(page);
    let candiateWord = getInputCandidateWord(wordleTable, candiateWords);
    if (word.length > 0) {
      candiateWord = word;
    }
    console.log(candiateWord);
    await delay(1000);
    await inputWord(page, candiateWord);
    await delay(2000);
    wordleTable = await getWordleTable(page);
    await delay(1000);
    outputCells(wordleTable);
    const correctWord = getCorrectWord(wordleTable);
    if (correctWord !== '') {
      console.log('answer is', correctWord);
      return;
    }
  }
  return;
};

(async () => {
  const options = {
    headless: false,
    defaultViewport: {
      width: 400,
      height: 600,
    },
  };
  const browser = await puppeteer.launch(options);
  const page = await browser.newPage();
  await page.goto(TARGET_URL);
  await page.screenshot({ path: 'wordle1.png', fullPage: true });
  // ポップアップを閉じる
  await page.click('button[aria-label="Close"]');
  // wordle解答入力を行う
  await operateWordlePage(page);
  await page.screenshot({ path: 'wordle2.png', fullPage: true });
  await browser.close();
})();
