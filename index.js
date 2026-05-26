#!/usr/bin/env node

const { Worker } = require('worker_threads');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ──────────────────────────────────────────────
// 
// ──────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag, def) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}

// ──────────────────────────────────────────────
// 
// ──────────────────────────────────────────────
async function askFilename() {
  const dir = process.cwd();
  const txtFiles = fsSync.readdirSync(dir).filter(f => f.endsWith('.txt'));

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║      Word Frequency Counter          ║');
  console.log('╚══════════════════════════════════════╝\n');

  if (txtFiles.length > 0) {
    console.log('Знайдені .txt файли в папці:');
    txtFiles.forEach(f => console.log(`  • ${f}`));
    console.log('');
  } else {
    console.log('У поточній папці немає .txt файлів.\n');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('Введіть назву файлу: ', answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}


function splitIntoChunks(lines, n) {
  const chunks = [];
  const size = Math.ceil(lines.length / n);
  for (let i = 0; i < lines.length; i += size) {
    chunks.push(lines.slice(i, i + size).join('\n'));
  }
  return chunks;
}

// ──────────────────────────────────────────────
//  Запускає один воркер, повертає Promise
// ──────────────────────────────────────────────
function runWorker(chunk) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: { chunk },
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', code => {
      if (code !== 0) reject(new Error(`Воркер завершився з кодом ${code}`));
    });
  });
}

// ──────────────────────────────────────────────
//  Зливає результати Map з усіх воркерів
// ──────────────────────────────────────────────
function mergeResults(results) {
  const merged = new Map();
  for (const { freq } of results) {
    for (const [word, count] of Object.entries(freq)) {
      merged.set(word, (merged.get(word) ?? 0) + count);
    }
  }
  return merged;
}

// ──────────────────────────────────────────────
//  Головна функція
// ──────────────────────────────────────────────
async function main() {
  // Визначаємо файл — з аргументу або інтерактивно
  let inputFile = args[0];

  if (args[0] === '--help') {
    console.log(`
Використання:
  word-counter.exe <файл.txt> [параметри]

Параметри:
  --top <N>          Кількість топ-слів у результаті  (за замовч.: 50)
  --out <файл.json>  Шлях до вихідного файлу          (за замовч.: output.json)
  --threads <N>      Кількість потоків воркерів        (за замовч.: кількість CPU)
`);
    process.exit(0);
  }

  if (!inputFile) {
    inputFile = await askFilename();
    if (!inputFile) {
      console.error('Файл не вказано. Завершення.');
      process.exit(1);
    }
  }

  const topN       = parseInt(getArg('--top', '50'));
  const outFile    = getArg('--out', 'output.json');
  const numThreads = parseInt(getArg('--threads', String(os.cpus().length)));


  const absPath = path.resolve(inputFile);
  let content;
  try {
    content = await fs.readFile(absPath, 'utf-8');
  } catch {
    console.error(`\nПомилка: не вдалося прочитати "${inputFile}"`);
    console.error('Перевірте що файл знаходиться в тій самій папці що й програма.');
    process.exit(1);
  }

  const fileSizeMB = Buffer.byteLength(content, 'utf8') / 1024 / 1024;

  console.log(`\nОбробка: ${path.basename(absPath)} (${fileSizeMB.toFixed(2)} МБ)`);
  console.log(`Потоки: ${numThreads}  |  Топ слів: ${topN}`);
  console.log('─'.repeat(52));

  const startTime = Date.now();


  const lines = content.split('\n');
  const chunks = splitIntoChunks(lines, numThreads);

  
  process.stdout.write(`Запуск ${chunks.length} воркерів... `);
  const results = await Promise.all(chunks.map(runWorker));
  console.log('готово');

  
  process.stdout.write('Злиття результатів... ');
  const merged = mergeResults(results);
  console.log('готово');

  const totalWords  = results.reduce((s, r) => s + r.count, 0);
  const uniqueWords = merged.size;
  const elapsedSec  = ((Date.now() - startTime) / 1000).toFixed(3);

 
  const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]);

  const topWords = sorted.slice(0, topN).map(([word, count]) => ({
    word,
    count,
    percent: parseFloat(((count / totalWords) * 100).toFixed(4)),
  }));


  const output = {
    file:                path.basename(absPath),
    processed_at:        new Date().toISOString(),
    processing_time_sec: parseFloat(elapsedSec),
    threads_used:        numThreads,
    stats: {
      total_words:      totalWords,
      unique_words:     uniqueWords,
      avg_word_length:  parseFloat(
        ([...merged.keys()].reduce((s, w) => s + w.length, 0) / uniqueWords).toFixed(2)
      ),
      lexical_richness: parseFloat(((uniqueWords / totalWords) * 100).toFixed(2)),
    },
    top_words: topWords,
  };

  // Записуємо JSON
  const outPath = path.resolve(outFile);
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');

  // Виводимо підсумок у консоль
  console.log('\nРезультати:');
  console.log(`  Всього слів       : ${totalWords.toLocaleString()}`);
  console.log(`  Унікальних слів   : ${uniqueWords.toLocaleString()}`);
  console.log(`  Лексичне багатство: ${output.stats.lexical_richness}%`);
  console.log(`  Час обробки       : ${elapsedSec}с`);
  console.log(`\nТоп 10 слів:`);
  topWords.slice(0, 10).forEach((w, i) => {
    const bar = '█'.repeat(Math.round(w.percent * 2));
    console.log(`  ${String(i + 1).padStart(2)}. ${w.word.padEnd(20)} ${String(w.count).padStart(6)}x  ${bar}`);
  });
  console.log(`\nЗбережено → ${outPath}`);
  console.log('\nНатисніть Enter для виходу...');

  // Пауза перед закриттям щоб консоль не зникла одразу
  await new Promise(resolve => process.stdin.once('data', resolve));
}

main().catch(err => {
  console.error('Критична помилка:', err.message);
  process.exit(1);
});