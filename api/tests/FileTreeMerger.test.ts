import { FileTreeMerger } from '../src/shared/utils/FileTreeMerger';

describe('FileTreeMerger', () => {
  describe('merge', () => {
    it('should merge new files from AI response', () => {
      const currentFileTree = {
        'package.json': '{"name": "old"}',
        'src/App.tsx': 'export default function App() { return <div>Old</div>; }'
      };

      const aiResponseFileTree = {
        'src/NewComponent.tsx': 'export default function NewComponent() { return <div>New</div>; }'
      };

      const result = FileTreeMerger.merge(currentFileTree, aiResponseFileTree);

      expect(result.mergedFileTree).toEqual({
        'package.json': '{"name": "old"}',
        'src/App.tsx': 'export default function App() { return <div>Old</div>; }',
        'src/NewComponent.tsx': 'export default function NewComponent() { return <div>New</div>; }'
      });

      expect(result.addedFiles).toEqual(['src/NewComponent.tsx']);
      expect(result.modifiedFiles).toEqual([]);
      expect(result.preservedFiles).toEqual(['package.json', 'src/App.tsx']);
    });

    it('should modify existing files when AI response has changes', () => {
      const currentFileTree = {
        'package.json': '{"name": "old"}',
        'src/App.tsx': 'export default function App() { return <div>Old</div>; }'
      };

      const aiResponseFileTree = {
        'src/App.tsx': 'export default function App() { return <div>Updated</div>; }'
      };

      const result = FileTreeMerger.merge(currentFileTree, aiResponseFileTree);

      expect(result.mergedFileTree).toEqual({
        'package.json': '{"name": "old"}',
        'src/App.tsx': 'export default function App() { return <div>Updated</div>; }'
      });

      expect(result.addedFiles).toEqual([]);
      expect(result.modifiedFiles).toEqual(['src/App.tsx']);
      expect(result.preservedFiles).toEqual(['package.json']);
    });

    it('should preserve files not mentioned in AI response', () => {
      const currentFileTree = {
        'package.json': '{"name": "old"}',
        'src/App.tsx': 'export default function App() { return <div>Old</div>; }',
        'src/utils/helper.ts': 'export function helper() { return "test"; }'
      };

      const aiResponseFileTree = {
        'src/App.tsx': 'export default function App() { return <div>Updated</div>; }',
        'src/NewComponent.tsx': 'export default function NewComponent() { return <div>New</div>; }'
      };

      const result = FileTreeMerger.merge(currentFileTree, aiResponseFileTree);

      expect(result.mergedFileTree).toEqual({
        'package.json': '{"name": "old"}',
        'src/App.tsx': 'export default function App() { return <div>Updated</div>; }',
        'src/utils/helper.ts': 'export function helper() { return "test"; }',
        'src/NewComponent.tsx': 'export default function NewComponent() { return <div>New</div>; }'
      });

      expect(result.addedFiles).toEqual(['src/NewComponent.tsx']);
      expect(result.modifiedFiles).toEqual(['src/App.tsx']);
      expect(result.preservedFiles).toEqual(['package.json', 'src/utils/helper.ts']);
    });

    it('should handle empty current file tree (new project)', () => {
      const currentFileTree = {};

      const aiResponseFileTree = {
        'package.json': '{"name": "new"}',
        'src/App.tsx': 'export default function App() { return <div>New</div>; }'
      };

      const result = FileTreeMerger.merge(currentFileTree, aiResponseFileTree);

      expect(result.mergedFileTree).toEqual(aiResponseFileTree);
      expect(result.addedFiles).toEqual(['package.json', 'src/App.tsx']);
      expect(result.modifiedFiles).toEqual([]);
      expect(result.preservedFiles).toEqual([]);
    });

    it('should handle empty AI response (no changes)', () => {
      const currentFileTree = {
        'package.json': '{"name": "old"}',
        'src/App.tsx': 'export default function App() { return <div>Old</div>; }'
      };

      const aiResponseFileTree = {};

      const result = FileTreeMerger.merge(currentFileTree, aiResponseFileTree);

      expect(result.mergedFileTree).toEqual(currentFileTree);
      expect(result.addedFiles).toEqual([]);
      expect(result.modifiedFiles).toEqual([]);
      expect(result.preservedFiles).toEqual(['package.json', 'src/App.tsx']);
    });

    it('should not modify files when content is identical', () => {
      const currentFileTree = {
        'package.json': '{"name": "same"}',
        'src/App.tsx': 'export default function App() { return <div>Same</div>; }'
      };

      const aiResponseFileTree = {
        'package.json': '{"name": "same"}', // Same content
        'src/App.tsx': 'export default function App() { return <div>Different</div>; }' // Different content
      };

      const result = FileTreeMerger.merge(currentFileTree, aiResponseFileTree);

      expect(result.mergedFileTree).toEqual({
        'package.json': '{"name": "same"}',
        'src/App.tsx': 'export default function App() { return <div>Different</div>; }'
      });

      expect(result.addedFiles).toEqual([]);
      expect(result.modifiedFiles).toEqual(['src/App.tsx']); // Only this one changed
      expect(result.preservedFiles).toEqual([]); // None preserved since both were in AI response
    });
  });
});