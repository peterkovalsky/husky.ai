#!/usr/bin/env node
/**
 * Generates worker/src/template-react18-ts.json from templates/react18-ts/
 *
 * Run: node scripts/generate-template-json.js
 */

const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, '../templates/react18-ts');
const OUTPUT_FILE = path.join(__dirname, '../worker/src/template-react18-ts.json');

// Files to include in the template JSON
const FILES_TO_INCLUDE = [
  'package.json',
  'index.html',
  'eslint.config.js',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'tailwind.config.js',
  'postcss.config.js',
  'src/App.tsx',
  'src/pages/HomePage.tsx',
  'src/main.tsx',
  'src/index.css',
  'src/vite-env.d.ts',
];

function generateTemplateJson() {
  const template = {};

  for (const file of FILES_TO_INCLUDE) {
    const filePath = path.join(TEMPLATE_DIR, file);

    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    // Remove trailing newline for consistency
    template[file] = content.replace(/\n$/, '');
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(template, null, 2) + '\n');
  console.log(`Generated: ${OUTPUT_FILE}`);
  console.log(`Included ${FILES_TO_INCLUDE.length} files`);
}

generateTemplateJson();
