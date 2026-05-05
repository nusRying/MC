const fs=require('fs');
const s=fs.readFileSync('My workflow (1).json','utf8');
const needle="applyIntentValues('product_mix');";
const i=s.indexOf(needle);
if(i===-1){ console.log('needle not found'); process.exit(1); }
console.log(s.substr(i-80,360));
