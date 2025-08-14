import { Build, CreateBuildRequest } from '../src/domain/entities/Build';

describe('Build Entity - Token Fields', () => {
  it('should include optional inputTokens and outputTokens in Build interface', () => {
    const build: Build = {
      id: 'test-id',
      fileTree: { 'test.ts': 'console.log("test");' },
      projectId: 'project-123',
      version: 1,
      status: 'READY',
      metrics: {},
      inputTokens: 100,
      outputTokens: 200,
      createdAt: new Date(),
      modifiedAt: new Date()
    };

    expect(build.inputTokens).toBe(100);
    expect(build.outputTokens).toBe(200);
  });

  it('should include optional inputTokens and outputTokens in CreateBuildRequest interface', () => {
    const request: CreateBuildRequest = {
      fileTree: { 'test.ts': 'console.log("test");' },
      projectId: 'project-123',
      inputTokens: 150,
      outputTokens: 300
    };

    expect(request.inputTokens).toBe(150);
    expect(request.outputTokens).toBe(300);
  });

  it('should allow undefined token fields', () => {
    const build: Build = {
      id: 'test-id',
      fileTree: { 'test.ts': 'console.log("test");' },
      projectId: 'project-123',
      version: 1,
      status: 'QUEUED',
      metrics: {},
      createdAt: new Date(),
      modifiedAt: new Date()
    };

    expect(build.inputTokens).toBeUndefined();
    expect(build.outputTokens).toBeUndefined();
  });
});