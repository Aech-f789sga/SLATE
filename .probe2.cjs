const fs = require('fs');
const s = fs.readFileSync('public/assets/aistudio/Inkpad___Handwritten_Notes__7__e420adc2.html', 'utf8');

const tools = new Set();
const re = /data-t=\\?["']?([a-zA-Z]+)/g;
let m;
while ((m = re.exec(s))) tools.add(m[1]);
console.log('TOOLS:', [...tools].join(' '));

// tool ids used in JS
const re2 = /tool\s*===?\s*["']([a-zA-Z]+)["']/g;
const used = new Set();
while ((m = re2.exec(s))) used.add(m[1]);
console.log('JS TOOL BRANCHES:', [...used].join(' '));

// stroke kinds
const re3 = /t\s*:\s*["']([a-zA-Z]+)["']/g;
const kinds = new Set();
while ((m = re3.exec(s))) kinds.add(m[1]);
console.log('STROKE KINDS:', [...kinds].join(' '));

const re4 = /k\s*:\s*["']([a-zA-Z]+)["']/g;
const ks = new Set();
while ((m = re4.exec(s))) ks.add(m[1]);
console.log('k VALUES:', [...ks].join(' '));
