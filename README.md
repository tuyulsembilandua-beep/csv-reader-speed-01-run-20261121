[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/tuyulsembilandua-beep/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/tuyulsembilandua-beep/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)

# csv-reader-speed-01-run-20261121

A faster drop-in for csv-reader 1.0.0: `solve.js` answers every case exactly
as the reference reader does, but reads the text with slice-and-split fast
paths instead of one character at a time.

- `solve.js` — dependency-free ES module; `run({text, header})` returns
  `{columns, rows, errors}` identical to csv-reader 1.0.0.
- `main.ts` — the kit driver, unchanged: reads `/input/cases.json`, answers
  each case with `run`, writes `/output/answers.json`.

## How it is fast

Most records hold no quote and no stray CR, so they are taken with one
`slice` plus a native `split(',')`. Only records holding a quote, a stray
CR, or the file's last line go through the character loop, which itself
extracts fields with slices instead of building them a character at a time.

Local practice set (6 cases, ~11.06 MB), fresh process per run, Node 22.20.0
on this VM (7 runs, median): house baseline 3.18 s wall / 4.02 s CPU,
this entry 1.32 s wall / 1.59 s CPU — about 2.4x faster overall, ~3x net
of the driver overhead — with 6/6 cases byte-identical to the reference
answers.

## License

MIT — see `LICENSE`.
