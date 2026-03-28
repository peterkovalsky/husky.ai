#!/usr/bin/env node
/**
 * Generates worker/src/template-{name}.json from templates/{name}/
 *
 * Run: node scripts/generate-template-json.js [template-name]
 *   - No args: generates all templates
 *   - With arg: generates only the specified template
 *
 * Examples:
 *   node scripts/generate-template-json.js                  # all templates
 *   node scripts/generate-template-json.js react18-ts       # just React
 *   node scripts/generate-template-json.js astro-website    # just Astro
 */

const fs = require('fs');
const path = require('path');

const TEMPLATES = {
  'react18-ts': [
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
  ],
  'astro-website': [
    'package.json',
    'astro.config.mjs',
    'tsconfig.json',
    'src/layouts/BaseLayout.astro',
    'src/pages/index.astro',
    'src/styles/global.css',
    'src/components/Header.astro',
    'src/components/Footer.astro',
    'public/favicon.svg',
  ],
};

function generateTemplateJson(templateName, files) {
  const templateDir = path.join(__dirname, `../templates/${templateName}`);
  const outputFile = path.join(__dirname, `../worker/src/template-${templateName}.json`);

  const template = {};

  for (const file of files) {
    const filePath = path.join(templateDir, file);

    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    // Remove trailing newline for consistency
    template[file] = content.replace(/\n$/, '');
  }

  fs.writeFileSync(outputFile, JSON.stringify(template, null, 2) + '\n');
  console.log(`Generated: ${outputFile}`);
  console.log(`Included ${files.length} files`);
}

// Determine which template(s) to generate
const requestedTemplate = process.argv[2];

if (requestedTemplate) {
  if (!TEMPLATES[requestedTemplate]) {
    console.error(`Unknown template: ${requestedTemplate}`);
    console.error(`Available: ${Object.keys(TEMPLATES).join(', ')}`);
    process.exit(1);
  }
  generateTemplateJson(requestedTemplate, TEMPLATES[requestedTemplate]);
} else {
  // Generate all templates
  for (const [name, files] of Object.entries(TEMPLATES)) {
    generateTemplateJson(name, files);
  }
}
