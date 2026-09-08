import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type PackReference = {
  name: string;
  bundleIds: number[];
};

type PackQaRequest = {
  verifiedPacks: PackReference[];
  manualReview: Array<{ name: string; bundleIds?: number[]; reason: string }>;
};

const requestFile = path.resolve(process.env.AZTEK_PACK_QA_FILE || 'requests/aztek-sep-1-pack-qa.json');
const qaRequest = JSON.parse(fs.readFileSync(requestFile, 'utf8')) as PackQaRequest;
const sheetId = '1k-US_o_qg27lxdnVrqAze650VNc-plyBk8uY9HkA4HA';
const sheetGid = '1091406992';

function firstCsvCell(line: string): string {
  const match = line.match(/^(?:"((?:[^"]|"")*)"|([^,]*))/);
  return (match?.[1] ?? match?.[2] ?? '').replace(/""/g, '');
}

function parsePacks(csv: string): PackReference[] {
  const cells = csv.split(/\r?\n/).map(firstCsvCell);
  const packs: PackReference[] = [];

  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index] !== 'Package Name') {
      continue;
    }

    const name = cells[index + 1];
    if (!name) {
      continue;
    }

    const bundleIds: number[] = [];
    for (let rowIndex = index + 3; rowIndex < cells.length; rowIndex += 1) {
      if (cells[rowIndex] === 'Package Name') {
        break;
      }

      if (/^\d+$/.test(cells[rowIndex])) {
        bundleIds.push(Number(cells[rowIndex]));
      }
    }

    packs.push({ name, bundleIds });
  }

  return packs;
}

test('Google Sheet: pack names and Bundle IDs match the QA request', async ({ request }) => {
  const response = await request.get(
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetGid}`,
  );
  expect(response.ok(), 'The public QA specification sheet should be reachable').toBeTruthy();

  const actualPacks = parsePacks(await response.text());
  const expectedPacks = [
    ...qaRequest.verifiedPacks,
    ...qaRequest.manualReview.filter((pack) => (pack.bundleIds?.length ?? 0) > 0),
  ].map(({ name, bundleIds }) => ({ name, bundleIds: bundleIds! }));

  expect(actualPacks).toEqual(expectedPacks);
});
