import request from 'supertest';
import path from 'path';
import { Express } from 'express';
import { createApp } from '../../app';
import { IntegrationTestSetup } from './setup';

// Mock Supabase auth middleware to inject a test user context
jest.mock('../../middleware/supabase-auth', () => ({
  authenticateWithSupabase: (_req: any, _res: any, next: any) => {
    _req.user = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'hr.admin@test.local',
      roles: ['HR_ADMIN'],
      employeeId: '11111111-1111-1111-1111-111111111111'
    };
    _req.permissionContext = {
      userId: _req.user.id,
      roles: _req.user.roles,
      employeeId: _req.user.employeeId,
      managedEmployeeIds: []
    };
    return next();
  },
  requireRole: (_role: string) => (_req: any, _res: any, next: any) => next()
}));

// Mock Supabase storage client interactions
jest.mock('../../database/supabase', () => ({
  supabase: {
    getClient: () => ({
      storage: {
        from: () => ({
          upload: async () => ({ data: { path: 'employees/111/.../test.pdf' } , error: null }),
          createSignedUrl: async () => ({ data: { signedUrl: 'https://signed-url' }, error: null }),
          remove: async () => ({ error: null }),
          list: async () => ({ data: [], error: null }),
          copy: async () => ({ error: null })
        })
      },
      from: () => ({
        insert: async () => ({ error: null })
      })
    })
  }
}));

describe('Document Management Integration', () => {
  let app: Express;

  beforeAll(async () => {
    await IntegrationTestSetup.setupTestEnvironment();
    await IntegrationTestSetup.seedTestData();
    app = createApp();
  });

  afterAll(async () => {
    await IntegrationTestSetup.teardownTestEnvironment();
  });

  test('uploads a document and returns metadata', async () => {
    const filePath = path.join(__dirname, '..', 'fixtures', 'sample.pdf');
    // Create a small in-memory buffer for the file if fixture not present
    const hasFixture = false;

    const req = request(app)
      .post('/api/document-management/documents/upload')
      .field('employeeId', '11111111-1111-1111-1111-111111111111')
      .field('category', 'CONTRACT')
      .field('title', 'Employment Contract');

    const res = hasFixture
      ? await req.attach('file', filePath)
      : await req.attach('file', Buffer.from('%PDF-1.4\n'), { filename: 'contract.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        id: expect.any(String),
        title: 'Employment Contract',
        category: 'CONTRACT',
        fileName: 'contract.pdf',
        fileSize: expect.any(Number)
      }
    });
  });

  test('lists documents with pagination', async () => {
    const res = await request(app)
      .get('/api/document-management/documents?page=1&limit=10')
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
  });

  test('rejects missing file on upload with proper error', async () => {
    const res = await request(app)
      .post('/api/document-management/documents/upload')
      .field('employeeId', '11111111-1111-1111-1111-111111111111')
      .field('category', 'CONTRACT')
      .field('title', 'Missing File');

    expect(res.status).toBe(400);
    expect(res.body.error?.code || res.body.error?.message || res.body.message).toBeDefined();
  });
});


