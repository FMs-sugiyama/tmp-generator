#!/usr/bin/env bun

console.log("DEBUG: Starting upload.ts");

// Check environment variables
const openaiKey = process.env.OPENAI_API_KEY;
console.log(`DEBUG: OPENAI_API_KEY present: ${!!openaiKey}`);

// Simulate reading policy documents
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...findMarkdownFiles(fullPath));
      } else if (item.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.log(`DEBUG: Error reading directory ${dir}: ${error}`);
  }
  
  return files;
}

// Look for policy documents
const policyDir = './policy';
const markdownFiles = findMarkdownFiles(policyDir);

console.log(`DEBUG: Found ${markdownFiles.length} markdown files:`);
markdownFiles.forEach(file => console.log(`  - ${file}`));

if (markdownFiles.length > 0) {
  console.log("DEBUG: Reading MD files - OK");
} else {
  console.log("DEBUG: Reading MD files - NG (no files found)");
}

// Simulate vector store creation
const vectorStoreId = `vs_${Date.now()}`;
const config = {
  id: vectorStoreId,
  created_at: new Date().toISOString(),
  files_count: markdownFiles.length,
  status: "simulated"
};

// Ensure config directory exists
import { mkdirSync, writeFileSync } from 'fs';

try {
  mkdirSync('./config', { recursive: true });
  writeFileSync('./config/vectorStore.json', JSON.stringify(config, null, 2));
  console.log(`DEBUG: Created vector store config: ${vectorStoreId}`);
  console.log("DEBUG: Vector Store creation - OK (simulated)");
} catch (error) {
  console.log(`DEBUG: Vector Store creation - NG: ${error}`);
  process.exit(1);
}