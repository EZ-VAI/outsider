#!/usr/bin/env node
// Reuses the existing external exact-HTTP observer; one observation is not a
// longitudinal guarantee, and code-supplied output is not an independent oracle.
import path from 'node:path';
import {createGlobalpingExactHttpObserverV2} from '../src/outsider-globalping-exact-http-observer-v2.js';
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce} from '../src/outsider-user-held-durable-execution-v2.js';
try{
  const [flag,file,...extra]=process.argv.slice(2);
  if(flag!=='--input'||!path.isAbsolute(file??'')||extra.length)throw new Error('DATA_OBSERVATION_ARGUMENT_INVALID');
  const input=JSON.parse(readPrivateExecutionBytes(file));
  if(!path.isAbsolute(input.directory??'')||!path.isAbsolute(input.outputFile??'')
    ||!/^sha256:[a-f0-9]{64}$/.test(input.expectedBodyHash??''))throw new Error('DATA_OBSERVATION_INPUT_INVALID');
  const result=await createGlobalpingExactHttpObserverV2({directory:input.directory}).observe({operationId:input.operationId,targetUrl:input.targetUrl});
  const record={schema:'outsider/data-workspace-external-observation/v1',taskId:input.taskId,
    expectedBodyHash:input.expectedBodyHash,exactBodyMatched:result.status===200&&result.bodyHash===input.expectedBodyHash,
    ...result,commercialCommitmentIssued:false,longitudinalOutcomeProven:false};
  writePrivateExecutionRecordOnce(input.outputFile,record);console.log(JSON.stringify(record));
  if(!record.exactBodyMatched)process.exitCode=2;
}catch(error){const code=error.outsiderCode??error.code??error.message;
  console.error(/^[A-Z][A-Z0-9_]{0,160}$/.test(code??'')?code:'DATA_OBSERVATION_FAILED');process.exitCode=1;}
