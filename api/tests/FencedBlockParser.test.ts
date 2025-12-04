import { FencedBlockParser } from '../src/shared/utils/FencedBlockParser';

describe('FencedBlockParser', () => {
  describe('parse', () => {
    it('should parse single file block', () => {
      const input = `<<<FILE:src/App.tsx>>>
import React from 'react';

export default function App() {
  return <div>Hello</div>;
}
<<<END>>>`;

      const result = FencedBlockParser.parse(input);

      expect(Object.keys(result)).toHaveLength(1);
      expect(result['src/App.tsx']).toContain("import React from 'react'");
      expect(result['src/App.tsx']).toContain('export default function App()');
    });

    it('should parse multiple file blocks', () => {
      const input = `<<<FILE:src/App.tsx>>>
import React from 'react';
export default function App() { return <div>Hello</div>; }
<<<END>>>

<<<FILE:src/index.ts>>>
import App from './App';
console.log('Hello');
<<<END>>>`;

      const result = FencedBlockParser.parse(input);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result['src/App.tsx']).toContain('import React');
      expect(result['src/index.ts']).toContain("import App from './App'");
    });

    it('should parse delete markers', () => {
      const input = `<<<FILE:src/App.tsx>>>
new content
<<<END>>>

<<<DELETE:src/old-file.tsx>>>`;

      const result = FencedBlockParser.parse(input);

      expect(result['src/App.tsx']).toBe('new content');
      expect(result['src/old-file.tsx']).toBe('__DELETE__');
    });

    it('should preserve template literals without escaping', () => {
      const input = `<<<FILE:src/App.tsx>>>
const msg = \`Hello \${name}\`;
const multiline = \`
  Line 1
  Line 2
\`;
<<<END>>>`;

      const result = FencedBlockParser.parse(input);

      expect(result['src/App.tsx']).toContain('`Hello ${name}`');
      expect(result['src/App.tsx']).toContain('`\n  Line 1\n  Line 2\n`');
    });

    it('should preserve regex patterns without escaping', () => {
      const input = `<<<FILE:src/utils.ts>>>
const regex = /\\d+/g;
const email = /^[\\w-]+@[\\w-]+\\.[a-z]+$/i;
<<<END>>>`;

      const result = FencedBlockParser.parse(input);

      expect(result['src/utils.ts']).toContain('/\\d+/g');
      expect(result['src/utils.ts']).toContain('/^[\\w-]+@[\\w-]+\\.[a-z]+$/i');
    });

    it('should handle code with quotes and special characters', () => {
      const input = `<<<FILE:src/App.tsx>>>
const str = "Hello \\"world\\"";
const obj = { key: 'value' };
const html = '<div class="test">Content</div>';
<<<END>>>`;

      const result = FencedBlockParser.parse(input);

      expect(result['src/App.tsx']).toContain('"Hello \\"world\\""');
      expect(result['src/App.tsx']).toContain("{ key: 'value' }");
    });

    it('should handle JSX with complex expressions', () => {
      const input = `<<<FILE:src/Component.tsx>>>
export function Component({ items }: Props) {
  return (
    <div className={\`container \${isActive ? 'active' : ''}\`}>
      {items.map((item, i) => (
        <span key={i}>{item.name}</span>
      ))}
    </div>
  );
}
<<<END>>>`;

      const result = FencedBlockParser.parse(input);

      expect(result['src/Component.tsx']).toContain("className={`container ${isActive ? 'active' : ''}`}");
      expect(result['src/Component.tsx']).toContain('{items.map((item, i) =>');
    });

    it('should handle empty files', () => {
      const input = `<<<FILE:src/empty.ts>>>

<<<END>>>`;

      const result = FencedBlockParser.parse(input);

      expect(result['src/empty.ts']).toBe('');
    });

    it('should handle files with whitespace content', () => {
      // Using explicit whitespace characters
      const input = '<<<FILE:src/whitespace.ts>>>\n   \n<<<END>>>';

      const result = FencedBlockParser.parse(input);

      // Content is captured between the first newline after >>> and the newline before <<<END>>>
      expect(result['src/whitespace.ts']).toBe('   ');
    });
  });

  describe('format', () => {
    it('should format file tree as fenced blocks', () => {
      const fileTree = {
        'src/App.tsx': 'export default function App() { return <div>Hello</div>; }',
        'src/index.ts': 'console.log("hello");'
      };

      const result = FencedBlockParser.format(fileTree);

      expect(result).toContain('<<<FILE:src/App.tsx>>>');
      expect(result).toContain('<<<END>>>');
      expect(result).toContain('export default function App()');
      expect(result).toContain('<<<FILE:src/index.ts>>>');
    });

    it('should format delete markers', () => {
      const fileTree = {
        'src/old.tsx': '__DELETE__'
      };

      const result = FencedBlockParser.format(fileTree);

      expect(result).toBe('<<<DELETE:src/old.tsx>>>');
    });

    it('should format mixed files and deletes', () => {
      const fileTree = {
        'src/App.tsx': 'new content',
        'src/old.tsx': '__DELETE__',
        'src/index.ts': 'index content'
      };

      const result = FencedBlockParser.format(fileTree);

      expect(result).toContain('<<<FILE:src/App.tsx>>>');
      expect(result).toContain('new content');
      expect(result).toContain('<<<DELETE:src/old.tsx>>>');
      expect(result).toContain('<<<FILE:src/index.ts>>>');
    });

    it('should round-trip parse and format correctly', () => {
      const originalFileTree = {
        'src/App.tsx': 'const x = `template ${var}`;\nconst regex = /\\d+/;',
        'src/utils.ts': 'export function helper() { return "test"; }'
      };

      const formatted = FencedBlockParser.format(originalFileTree);
      const parsed = FencedBlockParser.parse(formatted);

      expect(parsed).toEqual(originalFileTree);
    });
  });

  describe('validate', () => {
    it('should validate correct format with single file', () => {
      const input = `<<<FILE:src/App.tsx>>>
content
<<<END>>>`;

      const result = FencedBlockParser.validate(input);

      expect(result.valid).toBe(true);
      expect(result.fileCount).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate correct format with multiple files', () => {
      const input = `<<<FILE:src/App.tsx>>>
content1
<<<END>>>

<<<FILE:src/index.ts>>>
content2
<<<END>>>

<<<DELETE:src/old.tsx>>>`;

      const result = FencedBlockParser.validate(input);

      expect(result.valid).toBe(true);
      expect(result.fileCount).toBe(3);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect mismatched tags - missing END', () => {
      const input = `<<<FILE:src/App.tsx>>>
content`;

      const result = FencedBlockParser.validate(input);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Mismatched');
    });

    it('should detect mismatched tags - extra END', () => {
      const input = `<<<FILE:src/App.tsx>>>
content
<<<END>>>
<<<END>>>`;

      const result = FencedBlockParser.validate(input);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Mismatched');
    });

    it('should fail validation for empty content', () => {
      const result = FencedBlockParser.validate('');

      expect(result.valid).toBe(false);
      expect(result.fileCount).toBe(0);
    });

    it('should fail validation for non-fenced content', () => {
      const input = '{"src/App.tsx": "content"}'; // JSON format

      const result = FencedBlockParser.validate(input);

      expect(result.valid).toBe(false);
      expect(result.fileCount).toBe(0);
    });
  });

  describe('parsePartial', () => {
    it('should recover complete files from truncated response', () => {
      const input = `<<<FILE:src/App.tsx>>>
complete content
<<<END>>>

<<<FILE:src/index.ts>>>
incomplete content that got cut off`;

      const result = FencedBlockParser.parsePartial(input);

      expect(Object.keys(result.complete)).toHaveLength(1);
      expect(result.complete['src/App.tsx']).toBe('complete content');
      expect(result.incomplete?.path).toBe('src/index.ts');
      expect(result.incomplete?.partialContent).toContain('incomplete content');
    });

    it('should return all files when response is complete', () => {
      const input = `<<<FILE:src/App.tsx>>>
content1
<<<END>>>

<<<FILE:src/index.ts>>>
content2
<<<END>>>`;

      const result = FencedBlockParser.parsePartial(input);

      expect(Object.keys(result.complete)).toHaveLength(2);
      expect(result.incomplete).toBeNull();
    });

    it('should handle response with only delete markers', () => {
      const input = `<<<DELETE:src/old1.tsx>>>
<<<DELETE:src/old2.tsx>>>`;

      const result = FencedBlockParser.parsePartial(input);

      expect(Object.keys(result.complete)).toHaveLength(2);
      expect(result.complete['src/old1.tsx']).toBe('__DELETE__');
      expect(result.complete['src/old2.tsx']).toBe('__DELETE__');
      expect(result.incomplete).toBeNull();
    });

    it('should handle mixed complete files and truncated file', () => {
      const input = `<<<FILE:src/complete1.tsx>>>
content1
<<<END>>>

<<<DELETE:src/toDelete.tsx>>>

<<<FILE:src/complete2.tsx>>>
content2
<<<END>>>

<<<FILE:src/truncated.tsx>>>
this file got cut`;

      const result = FencedBlockParser.parsePartial(input);

      expect(Object.keys(result.complete)).toHaveLength(3);
      expect(result.complete['src/complete1.tsx']).toBe('content1');
      expect(result.complete['src/complete2.tsx']).toBe('content2');
      expect(result.complete['src/toDelete.tsx']).toBe('__DELETE__');
      expect(result.incomplete?.path).toBe('src/truncated.tsx');
    });
  });

  describe('isFencedFormat', () => {
    it('should detect fenced format with FILE tag', () => {
      const input = '<<<FILE:src/App.tsx>>>\ncontent\n<<<END>>>';
      expect(FencedBlockParser.isFencedFormat(input)).toBe(true);
    });

    it('should detect fenced format with DELETE tag', () => {
      const input = '<<<DELETE:src/old.tsx>>>';
      expect(FencedBlockParser.isFencedFormat(input)).toBe(true);
    });

    it('should not detect JSON as fenced format', () => {
      const input = '{"src/App.tsx": "content"}';
      expect(FencedBlockParser.isFencedFormat(input)).toBe(false);
    });

    it('should not detect plain text as fenced format', () => {
      const input = 'Just some regular text';
      expect(FencedBlockParser.isFencedFormat(input)).toBe(false);
    });

    it('should not detect markdown code blocks as fenced format', () => {
      const input = '```json\n{"key": "value"}\n```';
      expect(FencedBlockParser.isFencedFormat(input)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle file paths with spaces', () => {
      const input = `<<<FILE:src/My Component.tsx>>>
content
<<<END>>>`;

      const result = FencedBlockParser.parse(input);
      expect(result['src/My Component.tsx']).toBe('content');
    });

    it('should handle deeply nested paths', () => {
      const input = `<<<FILE:src/components/ui/buttons/primary/Button.tsx>>>
content
<<<END>>>`;

      const result = FencedBlockParser.parse(input);
      expect(result['src/components/ui/buttons/primary/Button.tsx']).toBe('content');
    });

    it('should handle content that looks like tags but is not', () => {
      const input = `<<<FILE:src/App.tsx>>>
const tag = '<<<SOMETAG>>>';
const notAnEnd = '<<<END';
const actualContent = true;
<<<END>>>`;

      const result = FencedBlockParser.parse(input);
      expect(result['src/App.tsx']).toContain("const tag = '<<<SOMETAG>>>'");
      expect(result['src/App.tsx']).toContain("const notAnEnd = '<<<END'");
    });

    it('should handle Windows-style paths', () => {
      const input = `<<<FILE:src\\components\\Button.tsx>>>
content
<<<END>>>`;

      const result = FencedBlockParser.parse(input);
      expect(result['src\\components\\Button.tsx']).toBe('content');
    });
  });
});
