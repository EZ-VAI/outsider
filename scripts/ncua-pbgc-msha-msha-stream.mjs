#!/usr/bin/env node

/*
 * Internal source parser for the large MSHA archives.  The public adapter
 * invokes this process synchronously and receives only aggregates.  Row-level
 * narratives and person-linked injury fields never cross the process boundary.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, createReadStream, fstatSync, lstatSync,
  openSync, readFileSync,
} from "node:fs";
import { createInflateRaw } from "node:zlib";
import path from "node:path";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 320 * 1024 * 1024;

function fail(code) { throw new Error(`NCUA_PBGC_MSHA_STREAM_${code}`); }

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith("--") || Object.hasOwn(options, flag)
      || !["--kind", "--archive", "--sha256", "--bytes"].includes(flag)) fail("USAGE");
    options[flag] = value;
  }
  if (!['ACCIDENTS', 'MINE_EMPLOYMENT', 'CONTRACTOR_EMPLOYMENT'].includes(options['--kind'])
    || !options['--archive'] || !HASH.test(options['--sha256'] ?? "")
    || !/^\d+$/u.test(options['--bytes'] ?? "")) fail("USAGE");
  const bytes = Number(options['--bytes']);
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_COMPRESSED_BYTES) fail("BYTES_INVALID");
  return { kind: options['--kind'], archive: path.resolve(options['--archive']),
    sha256: options['--sha256'], bytes };
}

function findZipEnd(bytes) {
  const floor = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= floor; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  fail("ZIP_END_NOT_FOUND");
}

function singleEntryDescriptor(bytes, expectedName) {
  const end = findZipEnd(bytes);
  const disk = bytes.readUInt16LE(end + 4);
  const centralDisk = bytes.readUInt16LE(end + 6);
  const diskEntries = bytes.readUInt16LE(end + 8);
  const entryCount = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  const commentLength = bytes.readUInt16LE(end + 20);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== 1 || entryCount !== 1
    || end + 22 + commentLength !== bytes.length || centralOffset + centralSize > end
    || centralOffset + 46 > end || bytes.readUInt32LE(centralOffset) !== 0x02014b50) {
    fail("ZIP_CENTRAL_PROFILE_INVALID");
  }
  const flags = bytes.readUInt16LE(centralOffset + 8);
  const method = bytes.readUInt16LE(centralOffset + 10);
  const expectedCrc32 = bytes.readUInt32LE(centralOffset + 16);
  const compressedBytes = bytes.readUInt32LE(centralOffset + 20);
  const uncompressedBytes = bytes.readUInt32LE(centralOffset + 24);
  const nameLength = bytes.readUInt16LE(centralOffset + 28);
  const extraLength = bytes.readUInt16LE(centralOffset + 30);
  const itemCommentLength = bytes.readUInt16LE(centralOffset + 32);
  const localOffset = bytes.readUInt32LE(centralOffset + 42);
  const centralEnd = centralOffset + 46 + nameLength + extraLength + itemCommentLength;
  const name = bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");
  if ((flags & 1) !== 0 || method !== 8 || name !== expectedName
    || compressedBytes <= 0 || compressedBytes > MAX_COMPRESSED_BYTES
    || uncompressedBytes <= 0 || uncompressedBytes > MAX_UNCOMPRESSED_BYTES
    || centralEnd !== centralOffset + centralSize || localOffset + 30 > centralOffset
    || bytes.readUInt32LE(localOffset) !== 0x04034b50) fail("ZIP_ENTRY_PROFILE_INVALID");
  const localNameLength = bytes.readUInt16LE(localOffset + 26);
  const localExtraLength = bytes.readUInt16LE(localOffset + 28);
  const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
  const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
  if (localName !== name || dataOffset + compressedBytes > centralOffset) fail("ZIP_LOCAL_BINDING_INVALID");
  return { name, method: "DEFLATE", flags, expectedCrc32, compressedBytes,
    uncompressedBytes, dataOffset, centralDirectoryOffset: centralOffset };
}

function parsePipeRecord(line) {
  // The publisher calls this a pipe-delimited text file.  Some historical
  // names contain an unescaped literal double quote (for example, possessive
  // names rendered with `"`), so RFC-4180 quote state would incorrectly join
  // unrelated physical rows.  Treat pipe as authoritative and remove only a
  // matching outer quote pair.  A literal pipe still fails the column-count
  // gate and is quarantined as a malformed row.
  return line.split("|").map((field) => field.length >= 2
    && field.startsWith('"') && field.endsWith('"')
    ? field.slice(1, -1).replace(/""/gu, '"') : field);
}

function integer(value) {
  if (!/^-?\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function addCount(object, key) { object[key] = (object[key] ?? 0) + 1; }
function addBigInt(object, key, value) {
  const prior = object.get(key) ?? 0n;
  object.set(key, prior + value);
}
function sortedCounts(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

function statsFor(kind, headers) {
  const indexes = new Map(headers.map((name, index) => [name.trim(), index]));
  const required = kind === "ACCIDENTS"
    ? ["MINE_ID", "CONTRACTOR_ID", "DOCUMENT_NO", "ACCIDENT_DT", "CAL_YR", "CAL_QTR",
      "DEGREE_INJURY_CD", "NO_INJURIES", "NARRATIVE", "CLOSED_DOC_NO"]
    : kind === "MINE_EMPLOYMENT"
      ? ["MINE_ID", "CAL_YR", "CAL_QTR", "AVG_EMPLOYEE_CNT", "HOURS_WORKED", "COAL_PRODUCTION"]
      : ["CONTRACTOR_ID", "CAL_YR", "CAL_QTR", "AVG_EMPLOYEE_CNT", "HOURS_WORKED", "COAL_PRODUCTION"];
  if (new Set(headers).size !== headers.length || required.some((name) => !indexes.has(name))) {
    fail(`HEADER_PROFILE_INVALID:${kind}`);
  }
  return { indexes, required, rowCount: 0, malformedRowCount: 0, years: {}, quartersByYear: {},
    latestYear: null, latestQuarter: null, earliestYear: null,
    ...(kind === "ACCIDENTS" ? {
      uniqueDocumentNumbers: new Set(), duplicateDocumentNumbers: 0, degreeCodes: {},
      contractorLinkedRows: 0, mineLinkedRows: 0, zeroReportedInjuriesRows: 0,
      positiveReportedInjuriesRows: 0, invalidReportedInjuriesRows: 0,
      narrativePresentRows: 0, closedDocumentPresentRows: 0, latestAccidentDate: null,
    } : { identifiers: new Set(), hoursByYear: new Map(), zeroHoursRows: 0,
      positiveHoursRows: 0, invalidHoursRows: 0, zeroEmployeeRows: 0,
      coalProductionPresentRows: 0 }),
  };
}

function observe(stats, kind, fields) {
  stats.rowCount += 1;
  if (fields.length !== stats.indexes.size) { stats.malformedRowCount += 1; return; }
  const get = (name) => fields[stats.indexes.get(name)];
  const year = integer(get("CAL_YR"));
  const quarter = integer(get("CAL_QTR"));
  if (year === null || year < 1900 || year > 2100 || quarter === null || quarter < 1 || quarter > 4) {
    stats.malformedRowCount += 1; return;
  }
  addCount(stats.years, String(year));
  const quarterKey = `${year}-Q${quarter}`;
  addCount(stats.quartersByYear, quarterKey);
  if (stats.earliestYear === null || year < stats.earliestYear) stats.earliestYear = year;
  if (stats.latestYear === null || year > stats.latestYear
    || (year === stats.latestYear && quarter > stats.latestQuarter)) {
    stats.latestYear = year; stats.latestQuarter = quarter;
  }
  if (kind === "ACCIDENTS") {
    const documentNumber = get("DOCUMENT_NO");
    if (!documentNumber || stats.uniqueDocumentNumbers.has(documentNumber)) stats.duplicateDocumentNumbers += 1;
    else stats.uniqueDocumentNumbers.add(documentNumber);
    addCount(stats.degreeCodes, get("DEGREE_INJURY_CD") || "EMPTY");
    if (get("CONTRACTOR_ID")) stats.contractorLinkedRows += 1;
    if (get("MINE_ID")) stats.mineLinkedRows += 1;
    const noInjuries = integer(get("NO_INJURIES"));
    if (noInjuries === 0) stats.zeroReportedInjuriesRows += 1;
    else if (noInjuries !== null && noInjuries > 0) stats.positiveReportedInjuriesRows += 1;
    else stats.invalidReportedInjuriesRows += 1;
    if (get("NARRATIVE")) stats.narrativePresentRows += 1;
    if (get("CLOSED_DOC_NO")) stats.closedDocumentPresentRows += 1;
    const date = get("ACCIDENT_DT");
    const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
    if (!match || Number(match[3]) !== year) stats.malformedRowCount += 1;
    else {
      const canonical = `${match[3]}-${match[1]}-${match[2]}`;
      if (stats.latestAccidentDate === null || canonical > stats.latestAccidentDate) stats.latestAccidentDate = canonical;
    }
  } else {
    const idName = kind === "MINE_EMPLOYMENT" ? "MINE_ID" : "CONTRACTOR_ID";
    if (get(idName)) stats.identifiers.add(get(idName));
    const hoursText = get("HOURS_WORKED");
    if (!/^\d+$/u.test(hoursText)) stats.invalidHoursRows += 1;
    else {
      const hours = BigInt(hoursText);
      addBigInt(stats.hoursByYear, String(year), hours);
      if (hours === 0n) stats.zeroHoursRows += 1; else stats.positiveHoursRows += 1;
    }
    const employees = Number(get("AVG_EMPLOYEE_CNT"));
    if (Number.isFinite(employees) && employees === 0) stats.zeroEmployeeRows += 1;
    if (get("COAL_PRODUCTION") !== "") stats.coalProductionPresentRows += 1;
  }
}

function finalize(stats, kind) {
  const base = { rowCount: stats.rowCount, malformedRowCount: stats.malformedRowCount,
    earliestCalendarYear: stats.earliestYear, latestCalendarYear: stats.latestYear,
    latestCalendarQuarter: stats.latestQuarter, rowsByCalendarYear: sortedCounts(stats.years),
    rowsByCalendarYearQuarter: sortedCounts(stats.quartersByYear) };
  if (kind === "ACCIDENTS") return { ...base,
    uniqueDocumentNumberCount: stats.uniqueDocumentNumbers.size,
    duplicateOrMissingDocumentNumberRows: stats.duplicateDocumentNumbers,
    rowsByDegreeInjuryCode: sortedCounts(stats.degreeCodes),
    contractorLinkedRows: stats.contractorLinkedRows, mineLinkedRows: stats.mineLinkedRows,
    zeroReportedInjuriesRows: stats.zeroReportedInjuriesRows,
    positiveReportedInjuriesRows: stats.positiveReportedInjuriesRows,
    invalidReportedInjuriesRows: stats.invalidReportedInjuriesRows,
    narrativePresentRows: stats.narrativePresentRows,
    closedDocumentPresentRows: stats.closedDocumentPresentRows,
    latestAccidentDate: stats.latestAccidentDate };
  return { ...base, distinctReportingIdentifierCount: stats.identifiers.size,
    zeroHoursRows: stats.zeroHoursRows, positiveHoursRows: stats.positiveHoursRows,
    invalidHoursRows: stats.invalidHoursRows, zeroAverageEmployeeRows: stats.zeroEmployeeRows,
    coalProductionPresentRows: stats.coalProductionPresentRows,
    hoursWorkedByCalendarYear: Object.fromEntries([...stats.hoursByYear.entries()]
      .sort(([a], [b]) => a.localeCompare(b)).map(([year, hours]) => [year, hours.toString()])),
  };
}

async function parseArchive(options) {
  const expectedEntry = options.kind === "ACCIDENTS" ? "Accidents.txt"
    : options.kind === "MINE_EMPLOYMENT" ? "MinesProdQuarterly.txt" : "ContractorProdQuarterly.txt";
  const pathStat = lstatSync(options.archive, { bigint: true });
  if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.size !== BigInt(options.bytes)) fail("ARCHIVE_UNSAFE");
  const fd = openSync(options.archive, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  let bytes;
  try {
    const before = fstatSync(fd, { bigint: true });
    bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathStat[field]) fail("ARCHIVE_CHANGED_DURING_READ");
    }
    const actualHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (bytes.length !== options.bytes || actualHash !== options.sha256) fail("ARCHIVE_PIN_MISMATCH");
    const descriptor = singleEntryDescriptor(bytes, expectedEntry);
    bytes = null;
    const inflater = createInflateRaw();
    const stream = createReadStream(options.archive, { fd, autoClose: false,
      start: descriptor.dataOffset, end: descriptor.dataOffset + descriptor.compressedBytes - 1 });
    stream.on("error", (error) => inflater.destroy(error));
    stream.pipe(inflater);
    let textBuffer = "";
    let headers = null;
    let stats = null;
    let decompressedBytes = 0;
    let physicalLineCount = 0;
    for await (const chunk of inflater) {
      decompressedBytes += chunk.length;
      if (decompressedBytes > descriptor.uncompressedBytes) fail("DECOMPRESSED_OVERFLOW");
      // These legacy exports contain Windows-1252/Latin-1 name bytes.  All
      // measured identifiers, dates, codes and numeric fields are ASCII.
      textBuffer += chunk.toString("latin1");
      while (true) {
        const newline = textBuffer.indexOf("\n");
        if (newline < 0) break;
        let line = textBuffer.slice(0, newline);
        textBuffer = textBuffer.slice(newline + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        physicalLineCount += 1;
        const fields = parsePipeRecord(line);
        if (headers === null) {
          headers = fields.map((value) => value.trim());
          stats = statsFor(options.kind, headers);
        } else if (fields.length > 1 || fields[0] !== "") observe(stats, options.kind, fields);
      }
    }
    if (textBuffer) {
      physicalLineCount += 1;
      const line = textBuffer.replace(/\r$/u, "");
      const fields = parsePipeRecord(line);
      if (headers === null) { headers = fields.map((value) => value.trim()); stats = statsFor(options.kind, headers); }
      else if (fields.length > 1 || fields[0] !== "") observe(stats, options.kind, fields);
    }
    if (!headers || !stats || decompressedBytes !== descriptor.uncompressedBytes
      || physicalLineCount < stats.rowCount + 1) fail("FULL_STREAM_ACCOUNTING_INVALID");
    return { kind: options.kind, pinReverified: true, fullEntryStreamParsed: true,
      archiveBytes: options.bytes, archiveSha256: options.sha256,
      zipEntry: descriptor, header: headers, physicalLineCount, decompressedBytes,
      diagnostics: finalize(stats, options.kind) };
  } finally { closeSync(fd); }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("node scripts/ncua-pbgc-msha-msha-stream.mjs --kind <kind> --archive <zip> --sha256 <pin> --bytes <n>\n");
  } else process.stdout.write(`${JSON.stringify(await parseArchive(options))}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
