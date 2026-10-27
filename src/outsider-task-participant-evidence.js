/* Read actual evidence attached to a report on this original task. Customer
 * transport uses bounded chunks; owner downloads retain private HTTP access. */
const fail=code=>{throw Object.assign(new Error(`TASK_PARTICIPANT_EVIDENCE_${code}`),{code:`TASK_PARTICIPANT_EVIDENCE_${code}`});};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export function createTaskParticipantEvidenceReader({inspectTask,workService}){
  async function readFile(taskId,input){
    if(!/^task_[a-f0-9]{32}$/u.test(taskId??'')||!exact(input,['requirementId','reportHash','attachmentId'])
      ||typeof input.requirementId!=='string'||!input.requirementId||input.requirementId.length>128
      ||!/^sha256:[a-f0-9]{64}$/u.test(input.reportHash??'')||!/^workfile_[a-f0-9]{32}$/u.test(input.attachmentId??''))fail('INPUT_INVALID');
    const order=await inspectTask(taskId),requirement=order.session?.participantWork?.find(row=>row.requirementId===input.requirementId);
    if(order.taskId!==taskId||!requirement?.work?.requestId)fail('WORK_NOT_FOUND');
    const result=await workService.readEvidence(requirement.work.requestId,{attachmentId:input.attachmentId,reportHash:input.reportHash});
    if(!Buffer.isBuffer(result.bytes)||!result.bytes.length||result.bytes.length>8*1024*1024
      ||result.attachment?.attachmentId!==input.attachmentId||result.attachment.byteLength!==result.bytes.length)fail('SOURCE_INVALID');
    return result;
  }
  return Object.freeze({readFile,async readChunk(taskId,input){
    if(!exact(input,['requirementId','reportHash','attachmentId','offset'])||!Number.isInteger(input.offset)
      ||input.offset<0||input.offset%(24*1024)!==0)fail('OFFSET_INVALID');
    const {offset,...binding}=input,{attachment,bytes}=await readFile(taskId,binding);
    if(offset>=bytes.length)fail('OFFSET_INVALID');
    const chunk=bytes.subarray(offset,offset+24*1024),next=offset+chunk.length;
    return {taskId,...binding,offset,byteLength:chunk.length,totalByteLength:bytes.length,mimeType:attachment.mediaType,
      filename:attachment.filename,sha256:attachment.contentHash,base64:chunk.toString('base64'),nextOffset:next<bytes.length?next:null};
  }});
}
