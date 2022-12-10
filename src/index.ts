import puppeteer from "puppeteer";
import { JSDOM } from "jsdom";
import axios from "axios";

const TARGET_URL = "https://www.nytimes.com/games/wordle/index.html";

const delay = (time: number | undefined) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};

const getCandiateBaseWords = async () => {
  const res = await axios.get(TARGET_URL);
  const dom = new JSDOM(res.data);
  const scriptLists = dom.window.document.querySelectorAll("script");
  for (const item of scriptLists) {
    if (item.src.indexOf("wordle.") !== -1) {
      const resc = await axios.get(item.src);
      let content = resc.data;
      // ["". ... ""]の中にある単語一覧
      content = content.slice(content.indexOf("aahed"), content.length);
      content = content.slice(0, content.indexOf("]"));
      return content.replace(/"/g, "").split(",");
    }
  }
  return [];
};

const getWordleTable = async (page: {
  evaluate: (arg0: (selector: any) => any[], arg1: string) => any;
}) => {
  const rowSelector = 'div[class*="Row-module_row"]';
  const table = await page.evaluate((selector: any) => {
    const dataRows: any[][] = [];
    const rows = document.querySelectorAll(selector);
    rows.forEach((element) => {
      const cellSelector = 'div[class*="Tile-module_tile"]';
      const cells = element.querySelectorAll(cellSelector);
      const dataCells: { text: any; state: any }[] = [];
      cells.forEach(
        (cell: { dataset: { state: string }; textContent: any }) => {
          if (cell.dataset.state !== "empty") {
            dataCells.push({
              text: cell.textContent,
              state: cell.dataset.state,
            });
          }
        }
      );
      if (dataCells.length > 0) {
        dataRows.push(dataCells);
      }
    });
    return dataRows;
  }, rowSelector);
  return table;
};

const inputWord = async (
  page: {
    keyboard: { type: (arg0: any) => any; press: (arg0: string) => any };
  },
  word: any
) => {
  await page.keyboard.type(word);
  await page.keyboard.press("Enter");
};

const convCell = (state: string) => {
  if (state === "correct") return "🟩";
  if (state === "absent") return "⬜";
  if (state === "present") return "🟨";
  if (state === "empty") return "";
};

const outputCells = (wordleTable: any) => {
  for (const row of wordleTable) {
    console.log(row.map((v: { state: any }) => convCell(v.state)).join(""));
  }
};

const getCorrectWord = (wordleTable: any[]) => {
  const row = wordleTable.find((row: any[]) =>
    row.every((v: { state: string }) => v.state === "correct")
  );
  return row ? row.map((v: { text: any }) => v.text).join("") : "";
};

const filterByPresentLetter = (wordleTable: any[], candiateWords: any[]) => {
  const presentLetters = wordleTable
    .flat()
    .filter(
      (v: { state: string }) => v.state === "present" || v.state === "correct"
    )
    .map((v: { text: any }) => v.text);
  if (!presentLetters) return candiateWords;
  return candiateWords.filter((word: string | any[]) => {
    return presentLetters.every((v: any) => {
      return word.indexOf(v) >= 0;
    });
  });
};

const filterByAbsentLetter = (wordleTable: any[], candiateWords: any[]) => {
  const presentLetters = wordleTable
    .flat()
    .filter(
      (v: { state: string }) => v.state === "present" || v.state === "correct"
    )
    .map((v: { text: any }) => v.text);
  const absentLetters = wordleTable
    .flat()
    .filter((v: { state: string }) => v.state === "absent")
    .filter((v: { text: any }) => presentLetters.indexOf(v.text) === -1)
    .map((v: { text: any }) => v.text);
  if (!absentLetters) return candiateWords;
  return candiateWords.filter((word: string | any[]) => {
    return !absentLetters.some((v: any) => {
      return word.indexOf(v) >= 0;
    });
  });
};
/*
const filterByUsedWord = (wordleTable, candiateWords) => {
  return candiateWords.filter((word) => {
    return !wordleTable.some((letters) => {
      return word === letters.map((v) => v.text).join('');
    });
  });
};
*/
const filterByCorrectLetter = (wordleTable: any, candiateWords: any[]) => {
  const correctWords = ["", "", "", "", ""];
  for (const items of wordleTable) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].state === "correct") {
        correctWords[i] = items[i].text;
      }
    }
  }
  if (correctWords.join("").length === 0) return candiateWords;
  return candiateWords.filter((word: string[]) => {
    return correctWords.every((v, i) => {
      return v.length === 0 || v === word[i];
    });
  });
};
const filterByPresentLetterPosition = (
  wordleTable: any[],
  candiateWords: any[]
) => {
  //
  if (!wordleTable.flat().some((v: { state: string }) => v.state === "present"))
    return candiateWords;
  return candiateWords.filter((word: { [x: string]: any }) => {
    return !wordleTable.some((row: any[]) => {
      return row.some((v: { state: string; text: any }, i: string | number) => {
        return v.state === "present" && v.text === word[i];
      });
    });
  });
};

const getCandidateWords = (wordleTable: any | any[], candiateWords: any) => {
  let words = candiateWords;
  if (wordleTable.length === 0) return words;
  words = filterByPresentLetter(wordleTable, words);
  console.log("filterByPresentLetter", words);
  words = filterByAbsentLetter(wordleTable, words);
  console.log("filterByAbsentLetter", words);
  // words = filterByUsedWord(wordleTable, words);
  // console.log('filterByUsedWord', words)
  words = filterByCorrectLetter(wordleTable, words);
  console.log("filterByCorrectLetter", words);
  words = filterByPresentLetterPosition(wordleTable, words);
  console.log("filterByPresentLetterPosition", words);
  return words;
};

const getInputCandidateWord = (
  wordleTable: string | any[],
  candiateWords: any
) => {
  const words = getCandidateWords(wordleTable, candiateWords);
  if (wordleTable.length < 3) {
    const uniqWords = words.filter((word: string | any[]) => {
      return [...new Set([...word])].length === word.length;
    });
    if (uniqWords.length > 0) {
      // ２つ以上の同じ文字を含まない単語を優先する
      return uniqWords[Math.floor(Math.random() * uniqWords.length)];
    }
  }
  return words[Math.floor(Math.random() * words.length)];
};
const operateWordlePage = async (page: any) => {
  const candiateWords = await getCandiateBaseWords();
  for (const word of ["", "", "", "", "", ""]) {
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
    if (correctWord !== "") {
      console.log("answer is", correctWord);
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
  await page.screenshot({ path: "wordle1.png", fullPage: true });
  await page.click('button[aria-label="Close"]');
  await operateWordlePage(page);
  await page.screenshot({ path: "wordle2.png", fullPage: true });
  await browser.close();
})();
