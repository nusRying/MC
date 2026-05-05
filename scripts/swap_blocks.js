const fs=require('fs');
const p='My workflow (1).json';
let s=fs.readFileSync(p,'utf8');
const cond1='(/branch|city|stock/.test(normalized))';
const cond2='(/top product|top 5|top 10|most stocked|most stock/.test(normalized))';
const idx1 = s.indexOf(cond1);
const idx2 = s.indexOf(cond2);
if(idx1===-1||idx2===-1){ console.log('conditions not found'); process.exit(1); }
const start1 = s.lastIndexOf('else if', idx1);
const end1 = s.indexOf('}', idx1);
const start2 = s.lastIndexOf('else if', idx2);
const end2 = s.indexOf('}', idx2);
if(start1===-1||end1===-1||start2===-1||end2===-1){ console.log('bounds not found'); process.exit(1); }
const block1 = s.slice(start1, end1+1);
const block2 = s.slice(start2, end2+1);
// Ensure block1 comes before block2
if(start1 > start2){ console.log('block order unexpected'); process.exit(1); }
const newS = s.slice(0, start1) + block2 + s.slice(end1+1, start2) + block1 + s.slice(end2+1);
fs.writeFileSync(p,newS,'utf8');
console.log('swapped');
