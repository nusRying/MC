const fs = require('fs');
const p = 'My workflow (1).json';
let s = fs.readFileSync(p,'utf8');
const a = "} else if (/product type|product mix|category/.test(normalized)) {";
const b = "} else if (/embed|dashboard|metabase/.test(normalized)) {";
const start = s.indexOf(a);
if (start === -1) { console.log('start not found'); process.exit(1); }
const end = s.indexOf(b, start);
if (end === -1) { console.log('end not found'); process.exit(1); }
const section = s.substring(start, end);
// find branch_stock block
const branchRe = /else if \\/branch\|city\|stock\\/.test\(normalized\) \{[\s\S]*?applyIntentValues\('branch_stock'\);\n\s*\}/m;
const topRe = /else if \\/top product\|top 5\|top 10\|most stocked\|most stock\\/.test\(normalized\) \{[\s\S]*?applyIntentValues\('top_products'\);\n\s*\}/m;
const branchMatch = section.match(branchRe);
const topMatch = section.match(topRe);
if (!branchMatch || !topMatch) { console.log('blocks not found'); process.exit(1); }
const newSection = section.replace(branchMatch[0] + '\n' + topMatch[0], topMatch[0] + '\n' + branchMatch[0]);
const newS = s.substring(0, start) + newSection + s.substring(end);
fs.writeFileSync(p, newS, 'utf8');
console.log('Swapped blocks');
