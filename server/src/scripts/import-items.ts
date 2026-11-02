/**
 * Load the item list.
 *   npm run seed:items                       -> loads data/items.json (from StkSummary, names untouched)
 *   npm run seed:items -- path\to\Stock.xlsx -> loads a fresh Tally "Stock Summary" export
 *     (column A = item name, column B = unit; rows without a unit are skipped)
 * Existing items keep their id; new names are added; nothing is renamed or deleted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { pool, q } from '../db.js';
import { migrate } from './migrate.js';

const here = path.dirname(fileURLToPath(import.meta.url));

async function readItems(file?: string): Promise<{ name: string; unit: string }[]> {
  if (!file) return JSON.parse(fs.readFileSync(path.resolve(here, '../../data/items.json'), 'utf8'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const out: { name: string; unit: string }[] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return; // header
    const name = String(row.getCell(1).text ?? '').trim();
    const unit = String(row.getCell(2).text ?? '').trim();
    if (name && unit) out.push({ name, unit });
  });
  return out;
}

await migrate();
const items = await readItems(process.argv[2]);
let added = 0;
for (const it of items) {
  const r = await q(`insert into items(name, unit) values ($1, $2) on conflict (name) do update set unit = excluded.unit returning (xmax = 0) as inserted`, [
    it.name,
    it.unit,
  ]);
  if (r[0]?.inserted) added++;
}
console.log(`${items.length} items read, ${added} new.`);
await pool.end();
