const fs=require('fs');
const p='My workflow (1).json';
let s=fs.readFileSync(p,'utf8');
const oldPart = "  } else if (/branch|city|stock/.test(normalized)) {\n    applyIntentValues('branch_stock');\n  } else if (/top product|top 5|top 10|most stocked|most stock/.test(normalized)) {\n    applyIntentValues('top_products');\n  }";
const newPart = "  } else if (/top product|top 5|top 10|most stocked|most stock/.test(normalized)) {\n    applyIntentValues('top_products');\n  } else if (/branch|city|stock/.test(normalized)) {\n    applyIntentValues('branch_stock');\n  }";
if(s.includes(oldPart)){
  s=s.replace(oldPart,newPart);
  fs.writeFileSync(p,s,'utf8');
  console.log('replaced');
}else{
  console.log('pattern not found');
}
