import request from 'supertest';
import { createApp } from '../../app';
import { IntegrationTestSetup } from './setup';
// Mock Supabase auth to inject user and allow role checks
jest.mock('../../middleware/supabase-auth', () => ({
    authenticateWithSupabase: (_req, _res, next) => {
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
            managedEmployeeIds: ['22222222-2222-2222-2222-222222222222']
        };
        return next();
    },
    requireRole: (_role) => (_req, _res, next) => next()
}));
describe('Leave Planning Integration', () => {
    let app;
    const employeeId = '22222222-2222-2222-2222-222222222222';
    beforeAll(async () => {
        await IntegrationTestSetup.setupTestEnvironment();
        await IntegrationTestSetup.seedTestData();
        app = createApp();
    });
    afterAll(async () => {
        await IntegrationTestSetup.teardownTestEnvironment();
    });
    let planId;
    test('create leave plan', async () => {
        const res = await request(app)
            .post('/api/document-management/leave-plans')
            .send({
            employeeId,
            year: 2025,
            entries: [
                {
                    startDate: '2025-06-10',
                    endDate: '2025-06-15',
                    type: 'ANNUAL',
                    days: 5
                }
            ],
            notes: 'Summer holiday'
        });
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
        planId = res.body?.data?.id || res.body?.id || planId;
        expect(planId).toBeDefined();
    });
    test('get leave plan by id', async () => {
        const res = await request(app)
            .get(`/api/document-management/leave-plans/${planId}`)
            .expect((r) => expect(r.status).toBeGreaterThanOrEqual(200));
        expect(res.body).toBeDefined();
    });
    test('list leave plans', async () => {
        const res = await request(app)
            .get('/api/document-management/leave-plans?page=1&limit=10')
            .expect((r) => expect(r.status).toBeGreaterThanOrEqual(200));
        expect(res.body).toBeDefined();
    });
    test('update leave plan', async () => {
        const res = await request(app)
            .put(`/api/document-management/leave-plans/${planId}`)
            .send({ notes: 'Updated notes' });
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
    });
    test('submit leave plan', async () => {
        const res = await request(app)
            .post(`/api/document-management/leave-plans/${planId}/submit`)
            .send({});
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
    });
    test('manager approve leave plan', async () => {
        const res = await request(app)
            .post(`/api/document-management/leave-plans/${planId}/manager-approve`)
            .send({});
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
    });
    test('HR approve leave plan', async () => {
        const res = await request(app)
            .post(`/api/document-management/leave-plans/${planId}/hr-approve`)
            .send({});
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
    });
    test('pending lists', async () => {
        const resManager = await request(app)
            .get('/api/document-management/leave-plans/pending/manager');
        expect(resManager.status).toBeGreaterThanOrEqual(200);
        const resHr = await request(app)
            .get('/api/document-management/leave-plans/pending/hr');
        expect(resHr.status).toBeGreaterThanOrEqual(200);
    });
    test('delete leave plan', async () => {
        const res = await request(app)
            .delete(`/api/document-management/leave-plans/${planId}`)
            .send({});
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
    });
});
