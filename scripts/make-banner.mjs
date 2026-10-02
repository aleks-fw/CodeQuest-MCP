// Draws assets/banner.svg: the pixel title of the README (same look as the CodeCheck MCP banner).
// Run: node scripts/make-banner.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const TITLE = 'CODEQUEST-MCP';
const SUBTITLE = 'RPG PROGRESSION OVER REAL DEV WORK · MCP SERVER';
const CELL = 12;
const GAP = 1;
const TOP = 68;
// Light at the top of a letter, dark at the bottom.
const ROW_COLORS = ['#5eead4', '#5eead4', '#14b8a6', '#14b8a6', '#0f9488', '#0f766e', '#0f766e'];

const GLYPHS = {
  C: ['.XXX.', 'X...X', 'X....', 'X....', 'X....', 'X...X', '.XXX.'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  D: ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
  E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
  Q: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X.X.X', 'X..X.', '.XX.X'],
  U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
  T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
  M: ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
  P: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
  '-': ['.....', '.....', '.....', 'XXXXX', '.....', '.....', '.....'],
};

const WIDTH = 1000;
const HEIGHT = 210;
const advance = (5 + GAP) * CELL;
const left = Math.round((WIDTH - (TITLE.length * advance - GAP * CELL)) / 2 / CELL) * CELL;

const cells = [];
[...TITLE].forEach((letter, index) => {
  const glyph = GLYPHS[letter];
  if (!glyph) throw new Error(`no glyph for ${letter}`);
  glyph.forEach((line, row) => {
    [...line].forEach((mark, col) => {
      if (mark === 'X') cells.push({ x: left + index * advance + col * CELL, y: TOP + row * CELL, row });
    });
  });
});

const rect = (x, y, fill = '') => `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}"${fill}/>`;
const shadow = (dx, dy, opacity) =>
  `<g fill="#14b8a6" fill-opacity="${opacity}" shape-rendering="crispEdges">\n${cells
    .map((cell) => rect(cell.x + dx, cell.y + dy))
    .join('\n')}\n</g>`;
const face = `<g shape-rendering="crispEdges">\n${cells
  .map((cell) => rect(cell.x, cell.y, ` fill="${ROW_COLORS[cell.row]}"`))
  .join('\n')}\n</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${TITLE}">
<rect width="${WIDTH}" height="${HEIGHT}" rx="10" fill="#0d1117"/>
<rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="9" fill="none" stroke="#1f2a37"/>
${shadow(8, 8, 0.16)}
${shadow(4, 4, 0.32)}
${face}
<text x="${WIDTH / 2}" y="188" text-anchor="middle" font-family="ui-monospace,Consolas,Menlo,monospace" font-size="15" letter-spacing="3" fill="#7d8590">${SUBTITLE}</text>
</svg>
`;

mkdirSync('assets', { recursive: true });
writeFileSync('assets/banner.svg', svg);
console.log(`assets/banner.svg: ${cells.length} cells, left margin ${left}px`);
