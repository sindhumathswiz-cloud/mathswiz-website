const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('./src/app'); // include api and other app dir pages
let count = 0;
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    // Replace where: { email: session.user.email } and where: { email: session.user.email! }
    let changed = false;
    let newContent = content.replace(/where:\s*\{\s*email:\s*session\.user\.email!?\s*\}/g, () => {
        changed = true;
        return 'where: { id: (session.user as any).id }';
    });
    
    // Some places use email: session.user.email as standalone arguments to findUnique without where: keyword immediately proceeding or other formats? 
    // Usually it's `where: { email: session.user.email! }` which is perfect.

    if (changed) {
        fs.writeFileSync(file, newContent, 'utf8');
        count++;
        console.log(`Updated ${file}`);
    }
});
console.log(`Total files updated: ${count}`);
