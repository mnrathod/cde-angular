/**
 * A deterministic ZIP writer, enough to build an Office Open XML package.
 *
 * Node has no ZIP in its standard library, but it has raw DEFLATE, and the
 * container format around it is a few headers. Writing them here avoids a
 * dependency (§0.3) for a build-time script that produces two files.
 *
 * **Deterministic** is the requirement that shapes it: every entry gets the
 * same fixed timestamp, so regenerating produces byte-identical output and
 * `generate → git diff` is a usable check that the committed samples match
 * their generator. A ZIP with real timestamps changes on every run and the
 * check becomes noise people learn to ignore.
 */
import { deflateRawSync, crc32 } from 'node:zlib';

/** 1 Jan 2026, 00:00:00, in the DOS date/time encoding ZIP has always used. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const SIGNATURE_LOCAL = 0x04034b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_END = 0x06054b50;
const METHOD_DEFLATE = 8;
const VERSION_NEEDED = 20;

/**
 * @param {Array<{name: string, content: string}>} entries
 * @returns {Buffer} the complete archive
 */
export function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, content } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const compressed = deflateRawSync(raw, { level: 9 });
    const checksum = crc32(raw);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(SIGNATURE_LOCAL, 0);
    localHeader.writeUInt16LE(VERSION_NEEDED, 4);
    localHeader.writeUInt16LE(0, 6);                    // no flags; no encryption
    localHeader.writeUInt16LE(METHOD_DEFLATE, 8);
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);                   // no extra field
    localParts.push(localHeader, nameBytes, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(SIGNATURE_CENTRAL, 0);
    centralHeader.writeUInt16LE(VERSION_NEEDED, 4);     // version made by
    centralHeader.writeUInt16LE(VERSION_NEEDED, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(METHOD_DEFLATE, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);                 // extra
    centralHeader.writeUInt16LE(0, 32);                 // comment
    centralHeader.writeUInt16LE(0, 34);                 // disk number
    centralHeader.writeUInt16LE(0, 36);                 // internal attributes
    centralHeader.writeUInt32LE(0, 38);                 // external attributes
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + compressed.length;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIGNATURE_END, 0);
  end.writeUInt16LE(0, 4);                              // this disk
  end.writeUInt16LE(0, 6);                              // disk with central dir
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);                             // no archive comment

  return Buffer.concat([...localParts, central, end]);
}
