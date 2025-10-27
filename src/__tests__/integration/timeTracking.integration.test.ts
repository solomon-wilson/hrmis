import request from 'supertest';
import { app } from '../../app';
import { TimeEntryRepository } from '../../database/repositories/time-attendance/TimeEntryRepository';
import { BreakEntryRepository } from '../../database/repositories/time-attendance/BreakEntryRepository';

/**
 * Time Tracking Integration Tests
 * Tests complete lifecycle of time tracking operations
 */
describe('Time Tracking Integration Tests', () => {
  let authToken: string;
  let employeeId: string;
  let timeEntryId: string;

  beforeAll(async () => {
    // Setup: Authenticate and get token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test.employee@company.com',
        password: 'testpass123'
      });

    authToken = loginResponse.body.token;
    employeeId = loginResponse.body.user.employeeId;
  });

  afterAll(async () => {
    // Cleanup: Remove test data
    const timeEntryRepo = new TimeEntryRepository();
    if (timeEntryId) {
      await timeEntryRepo.delete(timeEntryId);
    }
  });

  describe('Complete Time Tracking Lifecycle', () => {
    it('should complete full clock in/out cycle with breaks', async () => {
      // Step 1: Clock In
      const clockInResponse = await request(app)
        .post('/api/time/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId,
          location: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 10
          }
        })
        .expect(201);

      expect(clockInResponse.body.success).toBe(true);
      expect(clockInResponse.body.data.timeEntry).toBeDefined();
      timeEntryId = clockInResponse.body.data.timeEntry.id;

      // Step 2: Verify Status
      const statusResponse = await request(app)
        .get(`/api/time/status/${employeeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(statusResponse.body.data.currentStatus).toBe('CLOCKED_IN');
      expect(statusResponse.body.data.activeTimeEntryId).toBe(timeEntryId);

      // Step 3: Start Break
      const startBreakResponse = await request(app)
        .post('/api/time/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId,
          breakType: 'LUNCH',
          paid: false
        })
        .expect(201);

      expect(startBreakResponse.body.success).toBe(true);
      const breakEntryId = startBreakResponse.body.data.breakEntry.id;

      // Step 4: Verify On Break Status
      const onBreakStatus = await request(app)
        .get(`/api/time/status/${employeeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(onBreakStatus.body.data.currentStatus).toBe('ON_BREAK');

      // Step 5: End Break
      const endBreakResponse = await request(app)
        .post('/api/time/break/end')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ employeeId })
        .expect(200);

      expect(endBreakResponse.body.success).toBe(true);
      expect(endBreakResponse.body.data.duration).toBeGreaterThan(0);

      // Step 6: Clock Out
      const clockOutResponse = await request(app)
        .post('/api/time/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ employeeId })
        .expect(200);

      expect(clockOutResponse.body.success).toBe(true);
      expect(clockOutResponse.body.data.totalHours).toBeGreaterThan(0);

      // Step 7: Verify Final Status
      const finalStatus = await request(app)
        .get(`/api/time/status/${employeeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(finalStatus.body.data.currentStatus).toBe('CLOCKED_OUT');
    });

    it('should prevent duplicate clock-in', async () => {
      // Clock in
      await request(app)
        .post('/api/time/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ employeeId })
        .expect(201);

      // Try to clock in again (should fail)
      const duplicateResponse = await request(app)
        .post('/api/time/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ employeeId })
        .expect(400);

      expect(duplicateResponse.body.success).toBe(false);
      expect(duplicateResponse.body.error.code).toBe('CLOCK_STATE_ERROR');

      // Cleanup: Clock out
      await request(app)
        .post('/api/time/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ employeeId })
        .expect(200);
    });

    it('should handle manual time entry with approval workflow', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(9, 0, 0, 0);

      const endOfDay = new Date(yesterday);
      endOfDay.setHours(17, 0, 0, 0);

      // Submit manual entry
      const manualEntryResponse = await request(app)
        .post('/api/time/manual-entry')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId,
          clockInTime: yesterday.toISOString(),
          clockOutTime: endOfDay.toISOString(),
          reason: 'Forgot to clock in yesterday',
          submittedBy: employeeId
        })
        .expect(201);

      expect(manualEntryResponse.body.success).toBe(true);
      expect(manualEntryResponse.body.data.status).toBe('SUBMITTED');

      const manualTimeEntryId = manualEntryResponse.body.data.id;

      // Verify it appears in entries list
      const entriesResponse = await request(app)
        .get('/api/time/entries')
        .query({ employeeId, status: 'SUBMITTED' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const submittedEntry = entriesResponse.body.data.entries.find(
        (e: any) => e.id === manualTimeEntryId
      );
      expect(submittedEntry).toBeDefined();
    });
  });

  describe('Time Entry Corrections', () => {
    it('should request and process time entry correction', async () => {
      // Create a time entry first
      const clockIn = await request(app)
        .post('/api/time/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ employeeId })
        .expect(201);

      const entryId = clockIn.body.data.timeEntry.id;

      await request(app)
        .post('/api/time/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ employeeId })
        .expect(200);

      // Request correction
      const correctionResponse = await request(app)
        .put(`/api/time/entries/${entryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clockInTime: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
          reason: 'Incorrect clock in time',
          requestedBy: employeeId
        })
        .expect(200);

      expect(correctionResponse.body.success).toBe(true);
      expect(correctionResponse.body.data.status).toBe('SUBMITTED');
    });
  });

  describe('Employee Dashboard', () => {
    it('should retrieve comprehensive dashboard data', async () => {
      const dashboardResponse = await request(app)
        .get(`/api/time/dashboard/${employeeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(dashboardResponse.body.success).toBe(true);
      expect(dashboardResponse.body.data).toHaveProperty('currentStatus');
      expect(dashboardResponse.body.data).toHaveProperty('totalHoursToday');
      expect(dashboardResponse.body.data).toHaveProperty('todayEntries');
      expect(dashboardResponse.body.data).toHaveProperty('incompleteEntries');
    });

    it('should retrieve pay period data', async () => {
      const payPeriodResponse = await request(app)
        .get(`/api/time/pay-period/${employeeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(payPeriodResponse.body.success).toBe(true);
      expect(payPeriodResponse.body.data).toHaveProperty('payPeriod');
      expect(payPeriodResponse.body.data).toHaveProperty('entries');
      expect(payPeriodResponse.body.data).toHaveProperty('summary');
    });
  });

  describe('Error Handling', () => {
    it('should handle clock out without clock in', async () => {
      // Ensure clocked out
      await request(app)
        .post('/api/time/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ employeeId })
        .catch(() => {}); // Ignore error if already clocked out

      // Try to clock out again
      const response = await request(app)
        .post('/api/time/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ employeeId })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CLOCK_STATE_ERROR');
    });

    it('should validate future time entries', async () => {
      const futureTime = new Date();
      futureTime.setHours(futureTime.getHours() + 2);

      const response = await request(app)
        .post('/api/time/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId,
          clockInTime: futureTime.toISOString()
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Authorization', () => {
    it('should prevent access without authentication', async () => {
      await request(app)
        .post('/api/time/clock-in')
        .send({ employeeId })
        .expect(401);
    });

    it('should prevent employees from accessing other employee data', async () => {
      const otherEmployeeId = 'different-employee-id';

      await request(app)
        .get(`/api/time/dashboard/${otherEmployeeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });
  });
});
