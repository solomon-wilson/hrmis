import request from 'supertest';
import { app } from '../../app';
import { LeaveRequestRepository } from '../../database/repositories/time-attendance/LeaveRequestRepository';
import { LeaveBalanceRepository } from '../../database/repositories/time-attendance/LeaveBalanceRepository';

/**
 * Leave Management Integration Tests
 * Tests complete leave request workflows including submission, approval, and balance updates
 */
describe('Leave Management Integration Tests', () => {
  let employeeToken: string;
  let managerToken: string;
  let employeeId: string;
  let managerId: string;
  let leaveRequestId: string;
  let leaveTypeId: string;

  beforeAll(async () => {
    // Login as employee
    const employeeLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test.employee@company.com',
        password: 'testpass123'
      });

    employeeToken = employeeLogin.body.token;
    employeeId = employeeLogin.body.user.employeeId;

    // Login as manager
    const managerLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test.manager@company.com',
        password: 'testpass123'
      });

    managerToken = managerLogin.body.token;
    managerId = managerLogin.body.user.employeeId;

    // Get leave type ID
    const leaveTypesResponse = await request(app)
      .get('/api/leave/policies')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    leaveTypeId = leaveTypesResponse.body.data[0]?.id;
  });

  afterAll(async () => {
    // Cleanup
    if (leaveRequestId) {
      const leaveRequestRepo = new LeaveRequestRepository();
      await leaveRequestRepo.delete(leaveRequestId);
    }
  });

  describe('Complete Leave Request Workflow', () => {
    it('should complete full leave request lifecycle: submit -> approve -> balance update', async () => {
      // Step 1: Check initial balance
      const initialBalanceResponse = await request(app)
        .get(`/api/leave/balances/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const initialBalance = initialBalanceResponse.body.data.find(
        (b: any) => b.leaveTypeId === leaveTypeId
      );
      expect(initialBalance).toBeDefined();
      const startingBalance = initialBalance.balance;

      // Step 2: Check eligibility
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 7);
      const dayAfterTomorrow = new Date(tomorrow);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

      const eligibilityResponse = await request(app)
        .post('/api/leave/check-eligibility')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          employeeId,
          leaveTypeId,
          startDate: tomorrow.toISOString(),
          endDate: dayAfterTomorrow.toISOString()
        })
        .expect(200);

      expect(eligibilityResponse.body.data.eligible).toBe(true);

      // Step 3: Submit leave request
      const submitResponse = await request(app)
        .post('/api/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          employeeId,
          leaveTypeId,
          startDate: tomorrow.toISOString(),
          endDate: dayAfterTomorrow.toISOString(),
          reason: 'Personal vacation',
          notes: 'Family trip'
        })
        .expect(201);

      expect(submitResponse.body.success).toBe(true);
      leaveRequestId = submitResponse.body.data.id;
      expect(submitResponse.body.data.status).toBe('PENDING');

      // Step 4: Verify it appears in employee's requests
      const employeeRequestsResponse = await request(app)
        .get('/api/leave/requests')
        .query({ employeeId })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const submittedRequest = employeeRequestsResponse.body.data.requests.find(
        (r: any) => r.id === leaveRequestId
      );
      expect(submittedRequest).toBeDefined();

      // Step 5: Verify it appears in manager's pending approvals
      const pendingApprovalsResponse = await request(app)
        .get('/api/leave/pending-approvals')
        .query({ managerId })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const pendingRequest = pendingApprovalsResponse.body.data.requests.find(
        (r: any) => r.id === leaveRequestId
      );
      expect(pendingRequest).toBeDefined();

      // Step 6: Manager approves request
      const approvalResponse = await request(app)
        .put(`/api/leave/requests/${leaveRequestId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          approverId: managerId,
          notes: 'Approved - enjoy your vacation'
        })
        .expect(200);

      expect(approvalResponse.body.success).toBe(true);
      expect(approvalResponse.body.data.status).toBe('APPROVED');

      // Step 7: Verify balance was deducted
      const updatedBalanceResponse = await request(app)
        .get(`/api/leave/balances/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const updatedBalance = updatedBalanceResponse.body.data.find(
        (b: any) => b.leaveTypeId === leaveTypeId
      );
      expect(updatedBalance.balance).toBeLessThan(startingBalance);
      expect(updatedBalance.used).toBeGreaterThan(0);
    });

    it('should handle leave request denial', async () => {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 14);
      const weekAfter = new Date(nextWeek);
      weekAfter.setDate(weekAfter.getDate() + 3);

      // Submit request
      const submitResponse = await request(app)
        .post('/api/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          employeeId,
          leaveTypeId,
          startDate: nextWeek.toISOString(),
          endDate: weekAfter.toISOString(),
          reason: 'Additional vacation'
        })
        .expect(201);

      const requestId = submitResponse.body.data.id;

      // Manager denies request
      const denyResponse = await request(app)
        .put(`/api/leave/requests/${requestId}/deny`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          deniedBy: managerId,
          reason: 'Team coverage conflict',
          notes: 'Please coordinate with team'
        })
        .expect(200);

      expect(denyResponse.body.success).toBe(true);
      expect(denyResponse.body.data.status).toBe('REJECTED');

      // Verify balance was not deducted
      const balanceResponse = await request(app)
        .get(`/api/leave/balances/${employeeId}`)
        .query({ leaveTypeId })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      // Balance should remain unchanged for denied requests
      expect(balanceResponse.body.data).toBeDefined();
    });

    it('should allow employee to cancel pending request', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const endDate = new Date(futureDate);
      endDate.setDate(endDate.getDate() + 1);

      // Submit request
      const submitResponse = await request(app)
        .post('/api/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          employeeId,
          leaveTypeId,
          startDate: futureDate.toISOString(),
          endDate: endDate.toISOString(),
          reason: 'Test cancellation'
        })
        .expect(201);

      const requestId = submitResponse.body.data.id;

      // Employee cancels request
      const cancelResponse = await request(app)
        .put(`/api/leave/requests/${requestId}/cancel`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          employeeId,
          reason: 'Plans changed'
        })
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);
      expect(cancelResponse.body.data.status).toBe('CANCELLED');
    });
  });

  describe('Leave Balance Management', () => {
    it('should retrieve all leave balances for employee', async () => {
      const balancesResponse = await request(app)
        .get(`/api/leave/balances/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(balancesResponse.body.success).toBe(true);
      expect(Array.isArray(balancesResponse.body.data)).toBe(true);
      expect(balancesResponse.body.data.length).toBeGreaterThan(0);

      const balance = balancesResponse.body.data[0];
      expect(balance).toHaveProperty('leaveTypeId');
      expect(balance).toHaveProperty('balance');
      expect(balance).toHaveProperty('used');
      expect(balance).toHaveProperty('pending');
    });

    it('should get leave statistics for employee', async () => {
      const statsResponse = await request(app)
        .get(`/api/leave/statistics/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(statsResponse.body.success).toBe(true);
      expect(statsResponse.body.data).toHaveProperty('totalRequests');
      expect(statsResponse.body.data).toHaveProperty('approved');
      expect(statsResponse.body.data).toHaveProperty('pending');
      expect(statsResponse.body.data).toHaveProperty('rejected');
    });
  });

  describe('Leave Calendar and Team Visibility', () => {
    it('should retrieve leave calendar', async () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      const calendarResponse = await request(app)
        .get('/api/leave/calendar')
        .query({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(calendarResponse.body.success).toBe(true);
      expect(Array.isArray(calendarResponse.body.data)).toBe(true);
    });

    it('should retrieve team leave calendar for manager', async () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      const teamCalendarResponse = await request(app)
        .get('/api/leave/team-calendar')
        .query({
          managerId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(teamCalendarResponse.body.success).toBe(true);
      expect(teamCalendarResponse.body.data).toBeDefined();
    });
  });

  describe('Validation and Error Handling', () => {
    it('should prevent leave request with insufficient balance', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 60);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 365); // Request 1 year

      const response = await request(app)
        .post('/api/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          employeeId,
          leaveTypeId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          reason: 'Extended leave'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INSUFFICIENT_LEAVE_BALANCE');
    });

    it('should prevent overlapping leave requests', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 90);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 3);

      // Submit first request
      const firstRequest = await request(app)
        .post('/api/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          employeeId,
          leaveTypeId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          reason: 'First request'
        })
        .expect(201);

      // Try to submit overlapping request
      const overlapStart = new Date(startDate);
      overlapStart.setDate(overlapStart.getDate() + 1);
      const overlapEnd = new Date(overlapStart);
      overlapEnd.setDate(overlapEnd.getDate() + 2);

      const overlappingResponse = await request(app)
        .post('/api/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          employeeId,
          leaveTypeId,
          startDate: overlapStart.toISOString(),
          endDate: overlapEnd.toISOString(),
          reason: 'Overlapping request'
        })
        .expect(409);

      expect(overlappingResponse.body.success).toBe(false);
      expect(overlappingResponse.body.error.code).toBe('LEAVE_CONFLICT');

      // Cleanup
      await request(app)
        .put(`/api/leave/requests/${firstRequest.body.data.id}/cancel`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ employeeId, reason: 'Test cleanup' });
    });

    it('should validate date range', async () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 1); // End before start

      const response = await request(app)
        .post('/api/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          employeeId,
          leaveTypeId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          reason: 'Invalid dates'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Authorization and Permissions', () => {
    it('should prevent employee from approving leave requests', async () => {
      const response = await request(app)
        .put(`/api/leave/requests/${leaveRequestId}/approve`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          approverId: employeeId,
          notes: 'Self approval attempt'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should prevent access to other employee balances', async () => {
      const otherEmployeeId = 'other-employee-id';

      const response = await request(app)
        .get(`/api/leave/balances/${otherEmployeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });
});
