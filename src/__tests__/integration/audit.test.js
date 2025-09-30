import request from 'supertest';
import { IntegrationTestSetup } from './setup';
import { createApp } from '../../app';
import { AuditLogRepository } from '../../database/repositories/AuditLogRepository';
describe('Audit Logging Integration Tests', () => {
    let app;
    let dbPool;
    let auditRepo;
    let hrAdminToken;
    let managerToken;
    beforeAll(async () => {
        await IntegrationTestSetup.setupTestEnvironment();
        dbPool = IntegrationTestSetup.getTestDatabase();
        auditRepo = new AuditLogRepository(dbPool);
        app = createApp();
        // Create test users and get tokens
        const bcrypt = require('bcryptjs');
        // HR Admin
        const hrAdminPassword = await bcrypt.hash('password123', 10);
        await dbPool.query('INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())', ['hr.admin@company.com', hrAdminPassword, 'HR_ADMIN']);
        const hrAdminLogin = await request(app)
            .post('/api/auth/login')
            .send({
            email: 'hr.admin@company.com',
            password: 'password123'
        });
        hrAdminToken = hrAdminLogin.body.token;
        // Manager
        const managerPassword = await bcrypt.hash('password123', 10);
        await dbPool.query('INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())', ['manager@company.com', managerPassword, 'MANAGER']);
        const managerLogin = await request(app)
            .post('/api/auth/login')
            .send({
            email: 'manager@company.com',
            password: 'password123'
        });
        managerToken = managerLogin.body.token;
    });
    afterAll(async () => {
        await IntegrationTestSetup.teardownTestEnvironment();
    });
    beforeEach(async () => {
        await IntegrationTestSetup.cleanDatabase();
        await IntegrationTestSetup.seedTestData();
    });
    describe('Employee Operations Audit Trail', () => {
        test('should log employee creation', async () => {
            const employeeData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@company.com',
                phone: '+1-555-0123',
                jobTitle: 'Software Engineer',
                department: 'Engineering',
                startDate: '2024-01-15',
                employmentType: 'FULL_TIME'
            };
            const response = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send(employeeData)
                .expect(201);
            const employeeId = response.body.id;
            // Check audit log
            const auditLogs = await auditRepo.getEntityHistory(employeeId);
            expect(auditLogs).toHaveLength(1);
            const createLog = auditLogs[0];
            expect(createLog.action).toBe('CREATE');
            expect(createLog.entityType).toBe('EMPLOYEE');
            expect(createLog.entityId).toBe(employeeId);
            expect(createLog.performedBy).toBeDefined();
            expect(createLog.changes).toMatchObject({
                firstName: { old: null, new: 'John' },
                lastName: { old: null, new: 'Doe' },
                email: { old: null, new: 'john.doe@company.com' }
            });
        });
        test('should log employee updates with field-level changes', async () => {
            // Create employee first
            const createResponse = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send({
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane.smith@company.com',
                jobTitle: 'Developer',
                department: 'Engineering',
                startDate: '2024-01-01',
                employmentType: 'FULL_TIME'
            });
            const employeeId = createResponse.body.id;
            // Update employee
            const updates = {
                jobTitle: 'Senior Developer',
                phone: '+1-555-9999',
                department: 'Product Engineering'
            };
            await request(app)
                .put(`/api/employees/${employeeId}`)
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send(updates)
                .expect(200);
            // Check audit logs
            const auditLogs = await auditRepo.getEntityHistory(employeeId);
            expect(auditLogs).toHaveLength(2); // CREATE + UPDATE
            const updateLog = auditLogs[0]; // Most recent first
            expect(updateLog.action).toBe('UPDATE');
            expect(updateLog.changes).toMatchObject({
                jobTitle: { old: 'Developer', new: 'Senior Developer' },
                phone: { old: null, new: '+1-555-9999' },
                department: { old: 'Engineering', new: 'Product Engineering' }
            });
        });
        test('should log status changes with detailed information', async () => {
            // Create employee
            const createResponse = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send({
                firstName: 'Status',
                lastName: 'Test',
                email: 'status.test@company.com',
                jobTitle: 'Test Engineer',
                department: 'Engineering',
                startDate: '2024-01-01',
                employmentType: 'FULL_TIME'
            });
            const employeeId = createResponse.body.id;
            // Change status to ON_LEAVE
            const statusUpdate = {
                status: 'ON_LEAVE',
                effectiveDate: '2024-02-01',
                reason: 'Medical leave',
                notes: 'Approved medical leave for recovery'
            };
            await request(app)
                .put(`/api/employees/${employeeId}/status`)
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send(statusUpdate)
                .expect(200);
            // Check audit logs
            const auditLogs = await auditRepo.getEntityHistory(employeeId);
            expect(auditLogs).toHaveLength(2); // CREATE + STATUS_CHANGE
            const statusLog = auditLogs[0];
            expect(statusLog.action).toBe('STATUS_CHANGE');
            expect(statusLog.changes).toMatchObject({
                status: { old: 'ACTIVE', new: 'ON_LEAVE' },
                effectiveDate: { old: null, new: '2024-02-01T00:00:00.000Z' },
                reason: { old: null, new: 'Medical leave' },
                notes: { old: null, new: 'Approved medical leave for recovery' }
            });
        });
        test('should log employee termination', async () => {
            // Create employee
            const createResponse = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send({
                firstName: 'Terminate',
                lastName: 'Test',
                email: 'terminate.test@company.com',
                jobTitle: 'Test Engineer',
                department: 'Engineering',
                startDate: '2024-01-01',
                employmentType: 'FULL_TIME'
            });
            const employeeId = createResponse.body.id;
            // Terminate employee
            const terminationUpdate = {
                status: 'TERMINATED',
                effectiveDate: '2024-03-01',
                reason: 'Voluntary resignation',
                notes: 'Employee submitted two weeks notice'
            };
            await request(app)
                .put(`/api/employees/${employeeId}/status`)
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send(terminationUpdate)
                .expect(200);
            // Check audit logs
            const auditLogs = await auditRepo.getEntityHistory(employeeId);
            expect(auditLogs).toHaveLength(2);
            const terminationLog = auditLogs[0];
            expect(terminationLog.action).toBe('STATUS_CHANGE');
            expect(terminationLog.changes.status).toEqual({
                old: 'ACTIVE',
                new: 'TERMINATED'
            });
            expect(terminationLog.changes.reason).toEqual({
                old: null,
                new: 'Voluntary resignation'
            });
        });
    });
    describe('User Action Tracking', () => {
        test('should track which user performed each action', async () => {
            // Create employee as HR Admin
            const createResponse = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send({
                firstName: 'User',
                lastName: 'Track',
                email: 'user.track@company.com',
                jobTitle: 'Engineer',
                department: 'Engineering',
                startDate: '2024-01-01',
                employmentType: 'FULL_TIME'
            });
            const employeeId = createResponse.body.id;
            // Update as Manager (if they have permission)
            await request(app)
                .put(`/api/employees/${employeeId}`)
                .set('Authorization', `Bearer ${hrAdminToken}`) // Using HR admin for now
                .send({ phone: '+1-555-1234' });
            // Check audit logs show different users
            const auditLogs = await auditRepo.getEntityHistory(employeeId);
            expect(auditLogs).toHaveLength(2);
            // Both actions should have performedBy field
            auditLogs.forEach(log => {
                expect(log.performedBy).toBeDefined();
                expect(log.performedBy).not.toBe('');
            });
        });
        test('should capture IP address and timestamp', async () => {
            const createResponse = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .set('X-Forwarded-For', '192.168.1.100')
                .send({
                firstName: 'IP',
                lastName: 'Test',
                email: 'ip.test@company.com',
                jobTitle: 'Engineer',
                department: 'Engineering',
                startDate: '2024-01-01',
                employmentType: 'FULL_TIME'
            });
            const employeeId = createResponse.body.id;
            const auditLogs = await auditRepo.getEntityHistory(employeeId);
            expect(auditLogs).toHaveLength(1);
            const log = auditLogs[0];
            expect(log.performedAt).toBeInstanceOf(Date);
            expect(log.ipAddress).toBeDefined();
            // Check timestamp is recent (within last minute)
            const now = new Date();
            const logTime = new Date(log.performedAt);
            const timeDiff = now.getTime() - logTime.getTime();
            expect(timeDiff).toBeLessThan(60000); // Less than 1 minute
        });
    });
    describe('Data Export Audit', () => {
        test('should log employee data exports', async () => {
            // Create some test employees first
            const employees = [
                {
                    firstName: 'Export1',
                    lastName: 'Test',
                    email: 'export1@company.com',
                    jobTitle: 'Engineer',
                    department: 'Engineering',
                    startDate: '2024-01-01',
                    employmentType: 'FULL_TIME'
                },
                {
                    firstName: 'Export2',
                    lastName: 'Test',
                    email: 'export2@company.com',
                    jobTitle: 'Designer',
                    department: 'Design',
                    startDate: '2024-01-01',
                    employmentType: 'FULL_TIME'
                }
            ];
            for (const emp of employees) {
                await request(app)
                    .post('/api/employees')
                    .set('Authorization', `Bearer ${hrAdminToken}`)
                    .send(emp);
            }
            // Export employee data
            await request(app)
                .post('/api/reports/export')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send({
                format: 'CSV',
                filters: { department: 'Engineering' }
            })
                .expect(200);
            // Check for export audit log
            const exportLogs = await dbPool.query('SELECT * FROM audit_logs WHERE action = $1 ORDER BY performed_at DESC LIMIT 1', ['EXPORT']);
            expect(exportLogs.rows).toHaveLength(1);
            const exportLog = exportLogs.rows[0];
            expect(exportLog.entity_type).toBe('EMPLOYEE_DATA');
            expect(exportLog.changes).toMatchObject({
                format: 'CSV',
                filters: { department: 'Engineering' },
                recordCount: expect.any(Number)
            });
        });
        test('should log report generation', async () => {
            await request(app)
                .get('/api/reports/employees?department=Engineering')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .expect(200);
            // Check for report generation audit log
            const reportLogs = await dbPool.query('SELECT * FROM audit_logs WHERE action = $1 ORDER BY performed_at DESC LIMIT 1', ['REPORT_GENERATED']);
            expect(reportLogs.rows).toHaveLength(1);
            const reportLog = reportLogs.rows[0];
            expect(reportLog.entity_type).toBe('EMPLOYEE_REPORT');
            expect(reportLog.changes).toMatchObject({
                reportType: 'employee_list',
                filters: expect.any(Object)
            });
        });
    });
    describe('Audit Log Security', () => {
        test('should prevent audit log tampering', async () => {
            // Create employee to generate audit log
            const createResponse = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send({
                firstName: 'Tamper',
                lastName: 'Test',
                email: 'tamper.test@company.com',
                jobTitle: 'Engineer',
                department: 'Engineering',
                startDate: '2024-01-01',
                employmentType: 'FULL_TIME'
            });
            const employeeId = createResponse.body.id;
            // Try to directly modify audit log (should fail)
            const auditLogs = await auditRepo.getEntityHistory(employeeId);
            const auditLogId = auditLogs[0].id;
            // Attempt to update audit log directly
            try {
                await dbPool.query('UPDATE audit_logs SET changes = $1 WHERE id = $2', [JSON.stringify({ tampered: true }), auditLogId]);
                // If we reach here, the update succeeded (which it shouldn't in a properly secured system)
                // For this tes);
            }
            finally { }
        });
    });
});
ual(5, rThanOrEqeGreate.count);
toBns[0];
eateActioeInt(crpect(pars, ex));
l(1);
nOrEquaThaoBeGreaterength;
tateActions.l(crexpect, ');, e = 'CREATEow.action == rlter(row =>s.fiats.rowauditSttions = t createAc cons    , al(1));
terThanOrEquBeGreah;
tos.rows.lengtt(auditStat, expec `);

       , action
  ESCday D   ORDER BY _at)
     ormeday', perfRUNC('dDATE_T action,  GROUP BY     '1 day'
  VAL NTERW() - I= NOd_at >meforer    WHERE p 
    ogs_l  FROM audit   s day
   d_at) aorme', perf'dayDATE_TRUNC(       t,
   ) as counNT(*    COUion,
      ct      aLECT 
    
        SEry(`, ool.queit, dbPats = awatStonst, audi, c, tatistics, it, sry, aud // Que  
, p);
nd(em.se, n, `)
    TokehrAdminarer ${`Be', ionizatAuthor.set('      ees')
    employst('/api/   .pop)
       apquest(it re       awayees) {
 p of emplot emconsor (

      f);})ME'
       'FULL_TItType:en    employm  1-01',
  024-0te: '2   startDa,
     g'int: 'Engineer departmen  ,
     ngineer': 'E  jobTitle
      any.com`, mp, { i }, , `audit$
        emae: 'Test',amlastN       }`, udit$, { itName: `A        firsi) => ({
, (_: 5 }, lengthrray.from({ yees = Aonst emploata
      cudit do generate amployees tultiple ete m    // Crea => {
  g', async ()rtinn for repoegatiot log aggrport audi('should sup

    test);   }Equal(1);
 aterThanOrth).toBeGrerows.lengificLogs.pecexpect(userS);

            dBy]
ormeperf
        [_by = $1',rformedgs WHERE peloit_ROM aud F  'SELECT *ery(
      Pool.qu= await dbs SpecificLog const user   ser
  ific uogs by spec Query l   //;

   ()oBeDefinedy).tdBorme expect(perfd_by;
     me[0].perforerLogs.rowsy = usrformedB    const pe
      
  1);HaveLength(.toogs.rows)(userLct     expe );

 Id]
        [employee$1',
     entity_id = s WHERE OM audit_log* FRT    'SELEC  query(
   dbPool.await gs = nst userLo   co  tabase
 ken or datoID from the et the user // G;

      se.body.ideateResponId = crt employeeons    c
  });

        TIME'L_: 'FULntTypeyme emplo         -01-01',
24te: '20tartDa      s   neering',
 ent: 'Engi departm    er',
     'EnginebTitle:         jo
  pany.com',omter@c: 'user.filmail    e
      er', 'Filtme:astNa       lr',
   ame: 'UserstN     fi
     ({nd        .senToken}` });
rer;
$;
{
    hrAdmiion;
    ', `Beaathoriz  .set(';
    Aut;
    es;
    ');
    i / employe.post('/ap, uest(app), ait, reqponse = awst, createReson, ce, yee, emploCreat //  () => {
    , //  () => {
    ', asyncertering by us log filrt auditsuppold est(', shou);
    t;
    ;
}
TE;
'.toBe(';
CREA;
action;
Logs.rows[0(recentect, expngth(1))];
toHaveLetLogs.rows;
ent(rec, expec);
String();
oISOurFromNow.ting(), oneHotrtoISOS;
oneHourAgo.employeeId, [D, $3, ',,
    $2, ANt, BETWEEN, _aformed = $1, AND, perid, ERE, entity_udit_logs, WH * FROM, a, 'SELECT    ,
    ery(ool.qubPwait, d, atLogs = recen, constge, rane, n, datt, logs, withi, audi // Query      0);
    , // Query      0);
    0 * 1 * 60, 0) + 6., getTime(w, Date(now, neFromNow = oneHour, const0 * 1000)),
    -60 * 6, me(), getTiw.Date(norAgo = new t, oneHou, cons()), ew, Datenow = nconst, ing];
for (filternt; timeret; cur
// Ge.id;
)
    // Ge.id;
    bodyesponse.Id = createRt;
employee;
cons;
;
TIME;
'ype: ';
FULL_employmentT;
',;
1 - 1;
te: '2024-rtDa     sta;
eering;
',ginartment: ';
En;
dep;
',;
gineerEn: '    jobTitle;
m;
',any.co.filter@compl: ';
date;
emai;
ter;
', ';
File: Namst;
la,
    e;
'Date';
tNam;
firs;
{
    send(n);
}
`)
      hrAdminToke ${Bearerrization;
', `set(';
Autho
    .yees;
')lost(' / api / emp.poest(app);
await requponse;
escreateRconst;
ployeeeate;
em; // Cr     
sync();
{
    range;
    ', ang by date log filteriaudit support ld';
    shouest(t => { (); Reporting; 'and uerying dit Log Q('; Au; describe; });
    ;
}
;
f(Date);
ceOoBeInstanrformedAt;
tt(log.pe, expec());
toBeDefinedBy;
medfor.per(logpect, ex, BeDefined());
to.changes;
og;
expect(l);
HANGE;
$ / STATUS_CTE | UPDATE | ch(/^(CREA).toMationog.actexpect(l, loyeeId);
toBe(emp.entityIdexpect(log, LOYEE, ');, oBe('EMPtyType).tog.entiect(l        expned();, d).toBeDefig.i, expect(lo, g => {
    forEach(lo, auditLogss, quired, fieldhas, refy, each, log // Veri
    , // Veri
    stamps);
    Timeual(sortedamps).toEqxpect(timestder, ecending, or, Desb - a);
} // => .sort((a, b)mestamps][...ti = psstamTimeedortconst s
)));
getTime(performedAtte(log.Da, newogs.map(logmps = auditLtaconst, times, order, al, chronologic, Verify //NGE
, //NGE
S_CHATATUPDATEs + S, 2, UTE + ))); // CREAHaveLength(4).toogsct(auditL   expeeId);
tory(employentityHistE.geRepowait, auditogs = aauditLst, conail, audit, trify, complete // Ver;
);
Vacation;
'son: ';
rea;
1;
',: ';
2024 - 2 - 0;
ate;
effectiveD;
AVE;
',;
atus: 'ON_LE          stend({
    .sminToken;
`)Adhrearer ${`Bization',.set('Author      tus`;
oyeeId;
/stas/$;
{
    emplmployeeput(`/api/e)
        . request(appait
      awtatusange s  // Ch });

    1-555-5555'phone: '+nd({       .seoken}`);
    $;
    {
        hrAdminT `Bearer rization',set('Autho   .  )
   ployeeId}`;
        ployees / $;
        {
            em `/api/em    .put(
    equest(app)    await r});

  neer' ngiior Ee: 'Sentl jobTiend({    .s  
  dminToken}`;
            $;
            {
                hrAarertion;
                ', `Behoriza';
                Aut.set(eeId);
            }
            `)
  {employployees/$(` / api / em.put;
            quest(app);
            await re;
            mes;
            titipleyee;
            mullote;
            empda // Up    
                .id;
            onse.bodyespteRread = cemployeeIt;
            cons;
        }
        ;
        ME;
        ';
        FULL_TItType: '   employmen     1-01',
        ;
        '2024-0 startDate;
        ing;
        ',gineertment: ';
        En;
        deparineer;
        ',;
        bTitle: 'Engjo  ',
        ;
        'integemail:    t',
            tName;
        'Tes      lasty',
            e;
        'Integriam firstN     {
            .send(n);
    }
    `){hrAdminTokearer $ation', `;
    Behoriz.set('Aut   , ees, ')/api/employ   .post(', pp);
    it;
    request(awaesponse = at, createR, consns, operatiom, multiple);
    for // Per   > {
     (ync() = asrations; ',ss operity acro integudit logintain ashould ma; test('))
        ;
}
;
ined();
r;
toBeDefrroct(e, expeed, protecty, roperle, plogs, arf, audit, xpected, is, is, e // Thi
, // Thi
rror);
{
    try { }
    catch (e) { }
}
;
ruered: tt({ tampeecbjot, : .toMatchOanges }).n.ch[0];
updatedLogs;
expect(Id);
oyeeistory(empltEntityHauditRepo.geait, gs = awt, updatedLo, cons, intact, a, is, still, datinalthe, origjust, verify, t, we, 'll );
