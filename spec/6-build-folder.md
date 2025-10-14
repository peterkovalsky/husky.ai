# Build Folder Structure Refactoring

## Overview

This specification describes the migration from a multi-version folder structure to a single working directory approach. Instead of creating `/apps/{projectId}/v{version}/` for each build, we will maintain one `/apps/projects/{projectId}/web/` directory that gets updated with each successful build.

## Motivation

- **Disk Space Optimization**: Eliminates duplicate `node_modules` folders across versions
- **Faster Builds**: Reuses existing `node_modules` without copying
- **Simplified Cleanup**: Only one directory to manage per project
- **Database as Source of Truth**: Build history and file trees remain in database

## Architecture Changes

### 1. Folder Structure

**Before:**
```
/apps/
  ├── {projectId}/
  │   ├── v1/          # First build
  │   │   ├── src/
  │   │   ├── node_modules/
  │   │   ├── package.json
  │   │   └── dist/
  │   ├── v2/          # Second build
  │   │   ├── src/
  │   │   ├── node_modules/
  │   │   └── ...
  │   └── v3/          # Third build
```

**After:**
```
/apps/projects/
  ├── {projectId}/
  │   └── web/         # Single working directory
  │       ├── src/
  │       ├── node_modules/
  │       ├── package.json
  │       ├── package-lock.json
  │       └── dist/
```

### 2. Database Schema Changes

**Add to `projects` table:**
```sql
ALTER TABLE projects
ADD COLUMN current_version INTEGER DEFAULT 0;
```

- `current_version`: Tracks the latest successful build version
- Initialized to `0` for new projects
- Incremented only after successful builds
- Used to determine if project has any successful builds

### 3. File References Update

**Files to Update:**
- `api/src/infrastructure/build/BuildService.ts:17` - Update directory creation logic
- `api/src/application/use-cases/ProcessJobUseCase.ts` - Update file path references

---

## Implementation Phases

### Phase 1: Starting a Project for the First Time

**Context:** User creates a new project and submits their first prompt.

#### Step 1.1: Initialize Project Directory
📍 *Location: BuildService.ts*

```typescript
// Create project working directory
const projectPath = `/apps/projects/{projectId}/web/`

if (!fs.existsSync(projectPath)) {
  fs.mkdirSync(projectPath, { recursive: true });
}
```

#### Step 1.2: Copy Dependencies (Optimization)
📍 *Location: BuildService - before AI generation*

```typescript
// Copy node_modules and lock file from template
const templatePath = '/templates/react18-ts/';
await copyNodeModules(templatePath, projectPath);
await copyFile(
  `${templatePath}/package-lock.json`,
  `${projectPath}/package-lock.json`
);
```

**Why:** Pre-copying dependencies speeds up first `npm install`

#### Step 1.3: AI Generation
📍 *Location: AnthropicAIService.ts*

- **No changes** to AI generation step
- AI receives current file tree (template for first build)
- AI returns file changes as JSON

#### Step 1.4: Merge File Tree
📍 *Location: ProcessJobUseCase.ts*

```typescript
// For first build, merge with template
const baseFileTree = await getTemplateFileTree('react18-ts');
const mergedFileTree = FileTreeMerger.merge(baseFileTree, aiChanges);
```

#### Step 1.5: Write Files to Disk
📍 *Location: BuildService.ts*

```typescript
// Write all files except node_modules and lock file
for (const [filePath, content] of Object.entries(mergedFileTree)) {
  if (filePath === 'node_modules' || filePath === 'package-lock.json') {
    continue; // Skip, already copied
  }

  const fullPath = path.join(projectPath, filePath);
  await fs.promises.writeFile(fullPath, content, 'utf-8');
}
```

#### Step 1.6: Build Application
📍 *Location: BuildService.ts*

```bash
cd /apps/projects/{projectId}/web
npm install --silent --no-audit --no-fund
npm run build
```

- `npm install` will be fast due to pre-copied node_modules
- Build output goes to `/apps/projects/{projectId}/web/dist/`

#### Step 1.7: Deploy to S3
📍 *Location: S3StorageService.ts*

**No changes** - Upload `/dist` folder to S3:
- Main bucket: `projects/{projectId}/*`
- Version history: `v{version}/production/*`

#### Step 1.8: Update Database
📍 *Location: ProcessJobUseCase.ts*

```typescript
// On successful build
await projectRepository.update(projectId, {
  current_version: build.version,
  preview_url: s3Url
});

await buildRepository.update(buildId, {
  status: 'READY',
  file_tree: mergedFileTree
});
```

---

### Phase 2: Iterating on Existing Project

**Context:** User submits a new prompt for a project with existing builds.

#### Step 2.1: Load Current State
📍 *Location: ProcessJobUseCase.ts:98-107*

```typescript
const projectPath = `/apps/projects/{projectId}/web/`;

// Load base file tree for AI context
let baseFileTree;
const lastSuccessfulBuild = await buildRepository.getLastSuccessful(projectId);

if (lastSuccessfulBuild) {
  // Use last successful build's file tree
  baseFileTree = lastSuccessfulBuild.file_tree;
} else {
  // Fallback to template (all previous builds failed)
  baseFileTree = await getTemplateFileTree('react18-ts');
}
```

#### Step 2.2: AI Generation
📍 *Location: AnthropicAIService.ts*

- AI receives `baseFileTree` as context
- AI returns only changed files
- Deleted files marked as `"__DELETE__"`

#### Step 2.3: Merge File Tree
📍 *Location: ProcessJobUseCase.ts:123-136*

```typescript
const mergedFileTree = FileTreeMerger.merge(baseFileTree, aiChanges);
```

#### Step 2.4: Clean Working Directory
📍 *Location: BuildService.ts* (NEW STEP)

```typescript
// Delete all source files, preserve node_modules and lock file
const preservePaths = ['node_modules', 'package-lock.json'];

for (const item of fs.readdirSync(projectPath)) {
  if (!preservePaths.includes(item)) {
    const fullPath = path.join(projectPath, item);
    await fs.promises.rm(fullPath, { recursive: true, force: true });
  }
}
```

**Critical:** This prevents old files from persisting when they should be deleted.

#### Step 2.5: Write New Files
📍 *Location: BuildService.ts*

```typescript
// Write merged file tree to disk
for (const [filePath, content] of Object.entries(mergedFileTree)) {
  if (filePath === 'node_modules' || filePath === 'package-lock.json') {
    continue; // Don't overwrite
  }

  const fullPath = path.join(projectPath, filePath);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, content, 'utf-8');
}
```

#### Step 2.6: Build and Deploy
- Same as Phase 1 Steps 1.6-1.8
- `npm install` only updates changed dependencies
- S3 deployment overwrites previous version in main bucket
- Version history bucket preserves all versions

---

## Edge Cases and Error Handling

### Edge Case 1: Build Failure
**Scenario:** Build fails (syntax error, dependency issue, etc.)

**Behavior:**
- Working directory `/web/` contains failed state
- Database build status set to `FAILED`
- `current_version` is **NOT** updated
- Next build will load file tree from last **successful** build
- Failed build's file tree still saved in database for debugging

**Recovery:**
- User can submit new prompt to fix issues
- System automatically rolls back to last successful state as base

### Edge Case 2: Concurrent Builds
**Scenario:** Two prompts submitted rapidly (race condition)

**Current Behavior (SQS):**
- Jobs processed sequentially from queue
- Second job waits for first to complete

**Recommendation:**
- Add optimistic locking using `current_version`:
  ```sql
  UPDATE projects
  SET current_version = {new_version}
  WHERE id = {projectId} AND current_version = {expected_version}
  ```
- If update fails, another build completed first - reload and retry

### Edge Case 3: Corrupted Working Directory
**Scenario:** `/web/` folder deleted or corrupted manually

**Detection:**
```typescript
if (!fs.existsSync(projectPath) || !fs.existsSync(`${projectPath}/package.json`)) {
  logger.warn('Working directory corrupted, reinitializing from last successful build');
  await reinitializeFromBuild(lastSuccessfulBuild);
}
```

**Recovery:**
- Recreate `/web/` from last successful build's file tree
- Re-copy `node_modules` from template
- Continue normal build process

### Edge Case 4: No Previous Successful Builds
**Scenario:** All previous builds failed, now attempting new build

**Behavior:**
- `current_version` remains `0`
- Base file tree loaded from template
- Treated as first-time build
- If successful, `current_version` set to build version

### Edge Case 5: Migration from Old Structure
**Scenario:** Existing projects have `/apps/{projectId}/v{version}/` structure

**Migration Script:**
```typescript
// For each existing project
const lastVersion = await getLastVersion(projectId);
const oldPath = `/apps/${projectId}/v${lastVersion}/`;
const newPath = `/apps/projects/${projectId}/web/`;

// Copy latest version to new structure
await fs.promises.cp(oldPath, newPath, { recursive: true });

// Update database
await projectRepository.update(projectId, {
  current_version: lastVersion
});
```

### Edge Case 6: Disk Space Full
**Scenario:** Cannot write files during build

**Error Handling:**
```typescript
try {
  await writeFilesToDisk(projectPath, mergedFileTree);
} catch (error) {
  if (error.code === 'ENOSPC') {
    logger.error('Disk space full');
    await buildRepository.update(buildId, {
      status: 'FAILED',
      error_message: 'Insufficient disk space'
    });
    // Alert operations team
  }
  throw error;
}
```

---

## S3 Storage Strategy

### Main Bucket (Live Preview)
**Path:** `projects/{projectId}/*`

- Always contains latest **successful** build
- Overwritten with each successful build
- Publicly accessible for preview URLs
- No versioning needed (handled by versions bucket)

### Versions Bucket (History)
**Path:** `v{version}/production/*` and `v{version}/source/*`

- Preserves all build versions
- Used for rollback capability
- Used for debugging failed builds
- Enables version comparison

**No changes to S3 strategy** - continues to work as documented in PROMPT_PROCESSING_GUIDE.md

---

## Performance Implications

### Benefits
✅ **Faster Builds**: Reuses `node_modules`, no copying between versions
✅ **Less Disk I/O**: Only writes changed files
✅ **Reduced Storage**: One `node_modules` per project instead of per version
✅ **Faster Cleanup**: Delete one directory instead of many

### Considerations
⚠️ **File Deletion**: New cleanup step adds ~1-2 seconds
⚠️ **Risk of Corruption**: Single directory failure affects project (mitigated by S3 backups)

### Estimated Time Savings
- **Before:** 12s (copy node_modules) + 8s (npm install) = 20s
- **After:** 2s (cleanup) + 5s (npm install) = 7s
- **Savings:** ~13 seconds per build (65% faster)

---

## Testing Checklist

- [ ] First-time project creation with no previous builds
- [ ] Successful iteration on existing project
- [ ] Failed build does not update `current_version`
- [ ] File deletion works correctly (AI returns `__DELETE__`)
- [ ] Cleanup preserves `node_modules` and `package-lock.json`
- [ ] Concurrent builds handled gracefully
- [ ] Corrupted directory recovery works
- [ ] Migration from old structure succeeds
- [ ] S3 uploads work with new paths
- [ ] Preview URLs work correctly
- [ ] Database rollback on build failure

---

## Implementation Order

1. **Database Migration**: Add `current_version` column
2. **Update BuildService**: Change directory paths and add cleanup logic
3. **Update ProcessJobUseCase**: Update file loading and versioning logic
4. **Update S3StorageService**: Verify paths work with new structure
5. **Migration Script**: Convert existing projects (if any)
6. **Testing**: Run full integration tests
7. **Deploy**: Roll out with monitoring

---

## Rollback Plan

If issues arise:

1. **Revert Code**: Deploy previous version
2. **Database**: `current_version` column can be ignored (backward compatible)
3. **Filesystem**: Old version structure still accessible
4. **S3**: No changes needed, both versions use same upload logic

---

This specification maintains compatibility with the existing architecture while optimizing for performance and disk usage.