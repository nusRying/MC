const fs=require('fs');
const p='My workflow (1).json';
let s=fs.readFileSync(p,'utf8');
const re = /\s*else if \(\/branch\|city\|stock\/.test\(normalized\) \{[\s\S]*?applyIntentValues\('branch_stock'\);[\s\S]*?\}[\s\S]*?else if \(\/top product\|top 5\|top 10\|most stocked\|most stock\/.test\(normalized\) \{[\s\S]*?applyIntentValues\('top_products'\);[\s\S]*?\}/m;
if(!re.test(s)){
  console.log('pattern not matched');
  process.exit(1);
}
const replacement = "  } else if (/top product|top 5|top 10|most stocked|most stock/.test(normalized)) {\n    applyIntentValues('top_products');\n  } else if (/branch|city|stock/.test(normalized)) {\n    applyIntentValues('branch_stock');\n  }";
const newS = s.replace(re, replacement);
fs.writeFileSync(p,newS,'utf8');
console.log('reordered');
