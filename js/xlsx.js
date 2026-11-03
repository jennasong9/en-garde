// Writes a one-sheet Excel file (.xlsx) from a sheet made by planAsSheet. An .xlsx file is a zip of
// small XML files, so this builds the zip by hand (stored, not compressed), with no library.

const encoder = new TextEncoder();

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// A zip of `files` ({ name, text }), stored without compression.
export function zipStored(files) {
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, name.length, true);
    parts.push(new Uint8Array(header.buffer), name, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    directory.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const zip = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    zip.set(part, at);
    at += part.length;
  }
  return zip;
}

const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// The cell styles: 0 plain, 1 bold, 2 bold and top-aligned (for a day merged down its meals).
const STYLES = XML + '<styleSheet xmlns="' + MAIN + '">'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs>'
  + '</styleSheet>';

const COLUMN_WIDTHS = [18, 18, 11, 38, 10, 12, 12, 10];
const columnName = (index) => String.fromCharCode(65 + index);

function cellXml(cell, rowNumber, columnIndex, mergedFirstCells) {
  const ref = columnName(columnIndex) + rowNumber;
  if (cell === null) return '';
  const style = cell.bold ? (mergedFirstCells.has(ref) ? 2 : 1) : 0;
  if (typeof cell.value === 'number') return '<c r="' + ref + '" s="' + style + '"><v>' + cell.value + '</v></c>';
  return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t>' + escapeXml(cell.value) + '</t></is></c>';
}

function sheetXml({ rows, merges }) {
  const mergedFirstCells = new Set(merges.map((range) => range.split(':')[0]));
  const body = rows.map((row, rowIndex) => '<row r="' + (rowIndex + 1) + '">'
    + row.map((cell, columnIndex) => cellXml(cell, rowIndex + 1, columnIndex, mergedFirstCells)).join('') + '</row>').join('');
  const columns = COLUMN_WIDTHS.map((width, index) => '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>').join('');
  const mergeXml = merges.length === 0 ? ''
    : '<mergeCells count="' + merges.length + '">' + merges.map((range) => '<mergeCell ref="' + range + '"/>').join('') + '</mergeCells>';
  return XML + '<worksheet xmlns="' + MAIN + '"><cols>' + columns + '</cols><sheetData>' + body + '</sheetData>' + mergeXml + '</worksheet>';
}

// The .xlsx file's bytes for a sheet ({ rows, merges }), with one worksheet called "Meal plan".
export function sheetToXlsx(sheet) {
  return zipStored([
    { name: '[Content_Types].xml', text: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', text: XML + '<Relationships xmlns="' + RELS + '"><Relationship Id="rId1" Type="' + OFFICE_RELS
      + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: XML + '<workbook xmlns="' + MAIN + '" xmlns:r="' + OFFICE_RELS
      + '"><sheets><sheet name="Meal plan" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', text: XML + '<Relationships xmlns="' + RELS + '"><Relationship Id="rId1" Type="' + OFFICE_RELS
      + '/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + OFFICE_RELS + '/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', text: STYLES },
    { name: 'xl/worksheets/sheet1.xml', text: sheetXml(sheet) },
  ]);
}
