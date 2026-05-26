const { workerData, parentPort } = require('worker_threads');

// Підраховує частоту слів у переданому тексті
function countWords(text) {
  const freq = new Map();

  // Нормалізація: нижній регістр, видалення пунктуації, розбивка на слова
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\-]/gu, ' ') 
    .split(/\s+/)
    .filter(w => w.length > 0);

  for (const word of words) {
    // Обрізаємо крайні апострофи та дефіси
    const clean = word.replace(/^['\-]+|['\-]+$/g, '');
    if (clean.length === 0) continue;
    freq.set(clean, (freq.get(clean) ?? 0) + 1);
  }

  return { freq: Object.fromEntries(freq), count: words.length };
}

// Отримуємо чанк від головного процесу, обробляємо та повертаємо результат
const result = countWords(workerData.chunk);
parentPort.postMessage(result);