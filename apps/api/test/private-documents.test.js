import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import test from 'node:test';
import {documentConfig,scanPdf} from '../src/private-documents.js';

test('private documents require explicit storage, scanner, and retention configuration',()=>{
  assert.equal(documentConfig({}),null);
  assert.throws(()=>documentConfig({PRIVATE_DOCUMENTS_ENABLED:'true'}));
  assert.equal(documentConfig({PRIVATE_DOCUMENTS_ENABLED:'true',DOCUMENT_BUCKET:'fixture-only',
    DOCUMENT_REGION:'ap-south-1',CLAMAV_HOST:'127.0.0.1',DOCUMENT_RETENTION_DAYS:'30'}).retentionDays,30);
});

test('ClamAV streams bounded binary frames and requires an explicit verdict',async()=>{
  const sample=Buffer.from('%PDF-1.4\nFictional invoice\n%%EOF\n');
  const expected=Buffer.concat([Buffer.from('zINSTREAM\0'),Buffer.from([0,0,0,sample.length]),sample,Buffer.alloc(4)]);
  for(const [reply,expectedVerdict] of [['stream: OK\0',true],['stream: Test-Sample FOUND\0',false],['stream: ERROR\0',null]]){
    const server=net.createServer(socket=>{
      let bytes=Buffer.alloc(0);
      socket.on('data',chunk=>{
        bytes=Buffer.concat([bytes,chunk]);
        if(bytes.length<expected.length)return;
        assert.deepEqual(bytes,expected);
        socket.end(reply);
      });
    }).listen(0,'127.0.0.1');
    await once(server,'listening');
    try{
      const scan=scanPdf(sample,{host:'127.0.0.1',port:server.address().port});
      if(expectedVerdict===null)await assert.rejects(scan);
      else assert.equal(await scan,expectedVerdict);
    }finally{
      await new Promise(resolve=>server.close(resolve));
    }
  }
});
