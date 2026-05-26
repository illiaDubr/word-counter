# Word Frequency Counter

Підраховує частоту слів у `.txt` файлі та зберігає статистику у JSON.

## Що потрібно

- Node.js 16+ **або** готовий `word-counter.exe`

## Запуск

```bash
node index.js book.txt
```

З параметрами:

```bash
node index.js book.txt --top 100 --out result.json --threads 4
```

| Параметр | Опис | За замовч. |
|---|---|---|
| `--top <N>` | Кількість топ-слів | `50` |
| `--out <файл>` | Вихідний JSON | `output.json` |
| `--threads <N>` | Кількість потоків | кількість CPU |

## Збірка у .exe

```bash
npm install -g pkg
pkg .
```

Після цього запуск без Node.js:

```bash
word-counter.exe book.txt
```

## Результат

Програма виводить підсумок у консоль і зберігає `output.json`:

```json
{
  "file": "book.txt",
  "processing_time_sec": 0.42,
  "threads_used": 8,
  "stats": {
    "total_words": 120000,
    "unique_words": 9400,
    "avg_word_length": 5.12,
    "lexical_richness": 7.83
  },
  "top_words": [
    { "word": "the", "count": 8201, "percent": 6.83 }
  ]
}
```