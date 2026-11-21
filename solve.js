// solve.js — a faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// run(input) returns exactly csv-reader's answer {columns, rows, errors} for
// {text, header}:
// - A U+FEFF at the very start is dropped. A record ends at LF or CRLF, and a
//   line left with no characters is no record.
// - Outside quotes a CR not followed by LF is dropped (stray_cr).
// - A field opening with a quote runs to the next quote that is not doubled
//   ("" inside is one quote; each CRLF or lone CR inside is read as LF).
//   What follows the closing quote, up to the next comma or line break, is
//   appended as it stands (quote_junk, when the field ends). A quote that
//   never closes is a literal character and the text after it is read again
//   as unquoted (unterminated_quote). A quote inside an unquoted field is a
//   literal character. Fields stay strings, never trimmed or converted.
// - columns is the first record when header is true, else null; rows holds
//   the records after it (every record when header is false), each padded
//   with "" (short_row, with fields: its field count) or cut (long_row, with
//   extra: the cut fields) to the first record's width.
// - Each error is {code, line, row}: line the 1-based line its record starts
//   on, counting every LF, CRLF and lone CR inside quotes, and row its
//   record's index in rows (null for the header), in the order met.
//
// Speed: a record with no quote and no stray CR is taken with one slice plus
// a native split. The rest are read field by field, each field extracted
// with a slice instead of built a character at a time; the character loops
// skip ordinary characters (above the highest delimiter code) with a single
// comparison.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on, its index in rows (null: header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read, how it ended, and how many characters were kept.
  let fVal = '';
  let fEnd = END;
  let fAdded = 0;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // prefix + the kept segments: the segments already flushed plus [start, end).
  function finish(prefix, parts, start, end) {
    return parts === null
      ? prefix + text.slice(start, end)
      : prefix + parts.join('') + text.slice(start, end);
  }

  // Reads unquoted characters from pos, keeping `prefix` first. A CR not
  // followed by LF is dropped (stray_cr). Sets fVal, fEnd and fAdded (the
  // characters kept during this call, dropped CRs not counted).
  function readUnquoted(prefix) {
    let start = pos;
    let parts = null;
    let added = 0;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c > 44) {
        pos += 1;
        continue;
      }
      if (c === 44) {
        // Comma: the field ends, the record goes on.
        fVal = finish(prefix, parts, start, pos);
        fAdded = added + (pos - start);
        fEnd = COMMA;
        pos += 1;
        return;
      }
      if (c === 10) {
        // LF: the field and the record end.
        fVal = finish(prefix, parts, start, pos);
        fAdded = added + (pos - start);
        fEnd = LINE_BREAK;
        pos += 1;
        line += 1;
        return;
      }
      if (c === 13) {
        // CR: with a following LF it ends the record; alone it is dropped.
        if (text.charCodeAt(pos + 1) === 10) {
          fVal = finish(prefix, parts, start, pos);
          fAdded = added + (pos - start);
          fEnd = LINE_BREAK;
          pos += 2;
          line += 1;
          return;
        }
        error('stray_cr');
        added += pos - start;
        (parts ??= []).push(text.slice(start, pos));
        pos += 1;
        start = pos;
        continue;
      }
      pos += 1;
    }
    fVal = finish(prefix, parts, start, pos);
    fAdded = added + (pos - start);
    fEnd = END;
  }

  // Reads a quoted field whose opening quote is at pos. Sets fVal/fEnd/fAdded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let parts = null;
    let seg = pos;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c > 34) {
        pos += 1;
        continue;
      }
      if (c === 34) {
        // Quote: doubled it is one literal quote; single it closes the field.
        if (text.charCodeAt(pos + 1) === 34) {
          (parts ??= []).push(text.slice(seg, pos), '"');
          pos += 2;
          seg = pos;
          continue;
        }
        const value = parts === null ? text.slice(seg, pos) : parts.join('') + text.slice(seg, pos);
        pos += 1;
        if (pos >= n) {
          fVal = value;
          fEnd = END;
          return;
        }
        const d = text.charCodeAt(pos);
        if (d === 44) {
          fVal = value;
          fEnd = COMMA;
          pos += 1;
          return;
        }
        if (d === 10) {
          fVal = value;
          fEnd = LINE_BREAK;
          pos += 1;
          line += 1;
          return;
        }
        if (d === 13 && text.charCodeAt(pos + 1) === 10) {
          fVal = value;
          fEnd = LINE_BREAK;
          pos += 2;
          line += 1;
          return;
        }
        // What follows the closing quote is appended as it stands.
        readUnquoted(value);
        if (fAdded > 0) error('quote_junk');
        return;
      }
      if (c === 13) {
        // CRLF and a lone CR inside quotes are each one LF.
        (parts ??= []).push(text.slice(seg, pos), '\n');
        line += 1;
        pos += text.charCodeAt(pos + 1) === 10 ? 2 : 1;
        seg = pos;
        continue;
      }
      if (c === 10) line += 1;
      pos += 1;
    }
    // The quote never closes: it is a literal character, and the text after
    // it is read again as unquoted, from just past the opening quote.
    pos = open + 1;
    line = openLine;
    error('unterminated_quote');
    readUnquoted('"');
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields;
    let lastQuoted = false;
    const lf = text.indexOf('\n', pos);
    if (lf !== -1) {
      const q = text.indexOf('"', pos);
      const r = text.indexOf('\r', pos);
      if ((q === -1 || q > lf) && (r === -1 || r > lf || r === lf - 1)) {
        // Clean record: no quote, no stray CR; a CR just before the LF is
        // the CRLF ending and is dropped with it.
        let end = lf;
        if (r === lf - 1) end = lf - 1;
        if (end === pos) {
          pos = lf + 1;
          line += 1;
          continue;
        }
        fields = text.slice(pos, end).split(',');
        pos = lf + 1;
        line += 1;
      }
    } else {
      // No line break left: a last record with no quote and no CR is clean.
      const q = text.indexOf('"', pos);
      const r = text.indexOf('\r', pos);
      if (q === -1 && r === -1) {
        fields = text.slice(pos).split(',');
        pos = n;
      }
    }
    if (fields === undefined) {
      // Broken record: read it field by field, quote-aware.
      fields = [];
      do {
        lastQuoted = text.charCodeAt(pos) === 34;
        if (lastQuoted) readQuoted();
        else readUnquoted('');
        fields.push(fVal);
      } while (fEnd === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
