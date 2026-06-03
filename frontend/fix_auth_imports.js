const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
    fs.readdirSync(dir).forEach( f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
    });
}

const targetDir = path.join(__dirname, 'src');

walk(targetDir, (filePath) => {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let original = content;
        
        // Replace variety of quote styles and next-auth/next vs next-auth
        content = content.replace(/import { getServerSession } from "next-auth\/next";/g, 'import { getServerSession } from "next-auth";');
        content = content.replace(/import { getServerSession } from 'next-auth\/next';/g, 'import { getServerSession } from "next-auth";');
        
        content = content.replace(/from "@\/app\/api\/auth\/\[\.\.\.nextauth\]\/route"/g, 'from "@/lib/auth"');
        content = content.replace(/from '@\/app\/api\/auth\/\[\.\.\.nextauth\]\/route'/g, 'from "@/lib/auth"');

        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated: ${filePath}`);
        }
    }
});
