import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {MongoMemoryReplSet} from 'mongodb-memory-server';

const replica=await MongoMemoryReplSet.create({replSet:{count:1}});
try {
  const child=spawn(process.execPath,['--test','apps/api/test/integration.test.js'],{
    stdio:'inherit',
    env:{...process.env,TEST_MONGODB_URI:replica.getUri('collectdesk_integration_test'),
      LEDGER_TRANSACTIONS_REQUIRED:'true'}
  });
  const [code]=await once(child,'exit');
  process.exitCode=code ?? 1;
} finally {
  await replica.stop();
}
