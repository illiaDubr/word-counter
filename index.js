#!/usr/bin/env node

const { Worker } = require('worker_threads');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// ──────────────────────────────────────────────
//  Налаштування аргументів командного рядка
// ──────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.log(`
Використання:
  node index.js <файл.txt> [параметри]

Параметри:
  --top <N>          Кількість топ-слів у результаті  (за замовч.: 50)
  --out <файл.json>  Шлях до вихідного файлу          (за замовч.: output.json)
  --threads <N>      Кількість потоків воркерів        (за замовч.: кількість CPU)

Приклади:
  node index.js book.txt
  node index.js book.txt --top 100 --out stats.json
  node index.js book.txt --threads 4
`);
  process.exit(0);
}

const inputFile  = args[0];
const topN       = parseInt(getArg('--top', '50'));
const outFile    = getArg('--out', 'output.json');
const numThreads = parseInt(getArg('--threads', String(os.cpus().length)));
function getArg(flag, def) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}

// ──────────────────────────────────────────────
//  Розбиває рядки на N приблизно рівних чанків
// ──────────────────────────────────────────────
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
  // Читаємо файл
  const absPath = path.resolve(inputFile);
  let content;
  try {
    content = await fs.readFile(absPath, 'utf-8');
  } catch {
    console.error(`Помилка: не вдалося прочитати "${inputFile}"`);
    process.exit(1);
  }

  const fileSizeMB = Buffer.byteLength(content, 'utf8') / 1024 / 1024;
  if (fileSizeMB > 100) {
    console.warn(`Увага: файл ${fileSizeMB.toFixed(1)} МБ — для дуже великих файлів краще використовувати стрімінг`);
  }

  console.log(`\nОбробка: ${path.basename(absPath)} (${fileSizeMB.toFixed(2)} МБ)`);
  console.log(`Потоки: ${numThreads}  |  Топ слів: ${topN}`);
  console.log('─'.repeat(52));

  const startTime = Date.now();

  // Розбиваємо на чанки
  const lines = content.split('\n');
  const chunks = splitIntoChunks(lines, numThreads);

  // Запускаємо воркери паралельно
  process.stdout.write(`Запуск ${chunks.length} воркерів... `);
  const results = await Promise.all(chunks.map(runWorker));
  console.log('готово');

  // Зливаємо результати
  process.stdout.write('Злиття результатів... ');
  let merged = mergeResults(results);
  console.log('готово');

  const totalWords  = results.reduce((s, r) => s + r.count, 0);
  const uniqueWords = merged.size;
  const elapsedSec  = ((Date.now() - startTime) / 1000).toFixed(3);

  // Сортуємо та беремо топ N
  const sorted = [...merged.entries()]
    .sort((a, b) => b[1] - a[1]);

  const topWords = sorted.slice(0, topN).map(([word, count]) => ({
    word,
    count,
    percent: parseFloat(((count / totalWords) * 100).toFixed(4)),
  }));

  // Формуємо вихідний об'єкт
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
  console.log(`  Всього слів      : ${totalWords.toLocaleString()}`);
  console.log(`  Унікальних слів  : ${uniqueWords.toLocaleString()}`);
  console.log(`  Лексичне багатство: ${output.stats.lexical_richness}%`);
  console.log(`  Час обробки      : ${elapsedSec}с`);
  console.log(`\nТоп 10 слів:`);
  topWords.slice(0, 10).forEach((w, i) => {
    const bar = '█'.repeat(Math.round(w.percent * 2));
    console.log(`  ${String(i + 1).padStart(2)}. ${w.word.padEnd(20)} ${String(w.count).padStart(6)}x  ${bar}`);
  });
  console.log(`\nЗбережено → ${outPath}`);
}

main().catch(err => {
  console.error('Критична помилка:', err.message);
  process.exit(1);
});