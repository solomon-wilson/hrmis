import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { database } from '../../database/connection';
import { runM
};);Environment(downTesttearp.estSetutegrationT
  await In<void> => {): Promisets = async (ionTesegratIntnst teardown

export co);
};ronment(tupTestEnviSetup.seationTestawait Integrid> => {
  : Promise<vo async ()ionTests =tupIntegratsest export con
st for Jeteardown setup and 

// Global
  }
},
    };tPassword()ner.geaiesContis.postgrpassword: th      ame(),
rnetUseContainer.g.postgresme: this  usernae(),
    abas.getDatresContainerthis.postg database: 
     dPort(),irstMappe.getFntainerostgresCort: this.p po     
etHost(),tainer.gtgresConst: this.pos{
      hourn 
    ret
    }
started');ner not  contairor('Test new Er      thrower) {
resContainostg(!this.pif 
     {Info()aseDatabc getTestati st
  */n info
  connectiot database  * Get tes  /**
  

   }
  }error;
    throw error);
   ata', t d seed tes'Failed to.error( logger
     error) {catch (

    }      `);PLOYEE')
 r-3', 'EM    ('use   ),
   'MANAGER'ser-2',    ('u),
       , 'HR_ADMIN'  ('user-1'          VALUES 

      le)r_id, ror_roles (useuseSERT INTO    IN
     ery(`abase.qu  await dat   
 oleser rt us  // Inser;

      `)())
    W(), NOWash3', NOb$10$h.com', '$2pany1@comployee, 'eme1' 'employe',-3user        (',
  (), NOW())sh2', NOWb$10$ha '$2.com',ompany 'manager1@cager1',an-2', 'm    ('user)),
      NOW(), NOW(ash1', '$2b$10$hom', @company.chr.adminin', 'dm-1', 'hr_a'user  (    LUES 
          VA
  updated_at), created_ath, ssword_haspa email, d, username,(iers O us INSERT INT
       (`uery.qit database     awaers
 t usnsert tes // I  

    `);  NOW())
   NOW(), partment', ales De'Sales', 'Sept-3',   ('d     OW()),
   OW(), Nartment', Ns Depan ResourceHum 'R',ept-2', 'H ('d     
    ()),NOWt', NOW(),  Departmenneeringtware Engi 'Sofineering',ept-1', 'Eng   ('d
       S    VALUE_at)
      updatedd_at,tetion, crea descrip (id, name,departmentsINTO      INSERT   `
 query(ase.abait dat      awartments
ert test dep      // Insy {
 trd> {
   Promise<voi: TestData() seed asyncstatic   */
  data
t  tesSeed
   *  }

  /**
 ;
    } throw error);
     ase', errorlean datab'Failed to cror(er.er  logg  rror) {
   catch (e);

    }ART WITH 1'q RESTd_seit_logs_i audUENCEEQER Sery('ALTquabase.atait d
      aw;ART WITH 1')q RESTid_seCE users_ENALTER SEQUe.query('wait databas
      a);1'ESTART WITH q R_seployees_idCE emER SEQUENy('ALTase.querait databs
      awet sequence      // Res    
');
  ASCADEtments CdeparTE TABLE y('TRUNCAase.querait datab  awE');
    ers CASCADusCATE TABLE ('TRUNuerydatabase.q  await DE');
    SCA CArolesLE user_TAB'TRUNCATE uery(se.qt databaawai    ADE');
  s CASCyeeemploABLE E TATRUNC('Tquerybase.t data awai   E');
  SCADistory CAatus_h_steeABLE employNCATE T.query('TRUait database
      awCADE');dit_logs CASE TABLE aury('TRUNCATdatabase.que      await  try {
id> {
   romise<votabase(): Psync cleanDastatic a  */
  on
 t isolaties for testablbase  Clean data  *
  /**
 
  }
  }w error;
  hro);
      tment', errorvironn test engratio inteupd to cleanrror('Faileger.e
      log(error) {  } catch up');

  nt cleaned t environmeesn tratiofo('Integer.in     logglse;
  faSetup =his.is

      t
      }top();sContainer.ss.postgreit thi      awa {
  iner)ostgresConta.phisf (t  i
      }
   ct();
 disconne database.ait      aw{
  ()) onnectedisCbase.    if (data {
  
    tryise<void> {t(): PromironmenstEnvc teardownTesyntatic a s
 nment
   */est enviro tupClean /**
   *   }

   }

  hrow error;  t;
    error)',  environmentsttegration teetup in to s'Failedror(logger.er) {
      or(err} catch 
    ;
omplete')etup cironment st envtesIntegration nfo('r.igge   lo
   ue;= trhis.isSetup      t
 ();
Migrations   await runns
    migratio    // Run

  onnect();atabase.ct d   awai
    databaseect to test     // Conn
  'false';
SSL =.DB_.env    process  ;
d()asswortPntainer.geostgresCo = this.pRD.DB_PASSWOs.envproces    rname();
  er.getUseontain.postgresCthisv.DB_USER = process.ene();
      Databasntainer.getresCos.postg= thiB_NAME .env.D     process();
 tringdPort().toSetFirstMappe.gContainerstgrespo= this.v.DB_PORT .encess
      proHost();etainer.gpostgresContis.= th_HOST ocess.env.DB
      prest database tariables fornvironment v  // Set et();

    tar       .s
 rts(5432)thExposedPo   .wi
     assword')rd('test_phPasswo  .wit     )
 'test_user'sername(ithU .w     
  )t'emen_managployeee('test_em.withDatabas    ne')
    :15-alpigres'postainer(lContw PostgreSq = await neContainerstgres  this.po    ner...');
contaiest stgreSQL t'Starting Poer.info(     loggner
 L contaitgreSQ/ Start Pos    /y {
  tr  
  
  }return;
  
      up) {(this.isSetf   i   {
e<void> Promisonment():nvirTestEtupsetatic async  s/
   *tainers
 on test cent withest environmtup tSe* *
   
  /* false;
c isSetup =ivate stati  prntainer;
qlCortedPostgreSainer: StatgresContstatic poste  privaSetup {
 Testration Integ class;

exportls/logger' '../../utier } fromggrt { lopotions';
imtabase/migra../../das } from 'ionigrat