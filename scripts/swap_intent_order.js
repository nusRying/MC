const fs = require('fs');
const p = 'My workflow (1).json';
let s = fs.readFileSync(p,'utf8');
const before = "} else if (/branch|city|stock/.test(normalized)) {\n    applyIntentValues('branch_stock');\n  } else if (/top product|top 5|top 10|most stocked|most stock/.test(normalized)) {\n    applyIntentValues('top_products');\n  } else if (/embed|dashboard|metabase/.test(normalized)) {\n    applyIntentValues('dashboard_help');\n  }";
const after = "} else if (/top product|top 5|top 10|most stocked|most stock/.test(normalized)) {\n    applyIntentValues('top_products');\n  } else if (/branch|city|stock/.test(normalized)) {\n    applyIntentValues('branch_stock');\n  } else if (/embed|dashboard|metabase/.test(normalized)) {\n    applyIntentValues('dashboard_help');\n  }";
if (s.includes(before)){
  s = s.replace(before, after);
  fs.writeFileSync(p, s, 'utf8');
  console.log('Reordered intent checks');
} else {
  console.log('Pattern not found — abort');
}
