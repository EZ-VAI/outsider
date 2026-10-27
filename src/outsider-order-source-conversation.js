/* Email is another input to the original participant work request. Supplier
 * confirmation records a quote, never a booking, payment, or finished result. */
import path from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {publicDatasetHash as digest} from './outsider-public-dataset.js';
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce as writeOnce,replacePrivateExecutionRecord,withUserHeldExecutionLockV2} from './outsider-user-held-durable-execution-v2.js';
import {contactMessagePacket,validContactMessage,validSupplierQuoteTerms,readContactEmail} from './outsider-order-contact-message.js';
const read=file=>JSON.parse(readPrivateExecutionBytes(file));
const byteHash=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const worker=fileURLToPath(new URL('../scripts/outsider-order-contact-worker.mjs',import.meta.url));
const workers=new Map();
const conversationLock=root=>digest({kind:'ORDER_SOURCE_CONVERSATION',root});
const terminal=new Set(['DECLINED','OFFER_CONFIRMED','STOPPED','EXPIRED','REPLY_LIMIT','DELIVERY_UNKNOWN','SCOPE_REVIEW_REQUIRED']);
const save=replacePrivateExecutionRecord;
const money=offer=>{
  const decimals=new Intl.NumberFormat('en',{style:'currency',currency:offer.currency}).resolvedOptions().maximumFractionDigits;
  const value=offer.amountMinor.padStart(decimals+1,'0');
  return `${offer.currency} ${decimals?`${value.slice(0,-decimals)}.${value.slice(-decimals)}`:value}`;
};
function normalizeOffer(input,brief,clock,{supplierTermsRequired=false}={}){
  if(!input||!['currency','amountMinor','availableStart','availableEnd','durationMs'].every(k=>input[k]!==null&&input[k]!==undefined))return null;
  if(supplierTermsRequired&&!validSupplierQuoteTerms(input.supplierTerms))return null;
  const now=Date.parse(clock()),end=Date.parse(input.availableEnd);
  if(!Number.isFinite(end))return null;
  const offer={...input,offerExpiresAt:input.offerExpiresAt??new Date(Math.min(now+86400000,end)).toISOString()};
  if(offer.currency!==brief.budget.currency||!/^(?:0|[1-9][0-9]{0,14})$/u.test(offer.amountMinor)
    ||BigInt(offer.amountMinor)>BigInt(brief.budget.maximumAmountMinor)
    ||!['availableStart','availableEnd','offerExpiresAt'].every(k=>typeof offer[k]==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/u.test(offer[k])&&Number.isFinite(Date.parse(offer[k])))
    ||Date.parse(offer.availableStart)>=end||end>Date.parse(brief.completionDeadline)||end<=now
    ||Date.parse(offer.offerExpiresAt)<=now||Date.parse(offer.offerExpiresAt)>end
    ||!Number.isSafeInteger(offer.durationMs)||offer.durationMs<60000
    ||offer.durationMs>end-Math.max(now,Date.parse(offer.availableStart)))return null;
  if(brief.coordinationConstraints){
    const constraints=brief.coordinationConstraints,start=Math.max(Date.parse(offer.availableStart),Date.parse(constraints.notBefore)),finish=Math.min(end,Date.parse(constraints.completeBy));
    if(BigInt(offer.amountMinor)>BigInt(constraints.maximumAmountMinor)||offer.durationMs>finish-Math.max(now,start))return null;
    offer.availableStart=new Date(start).toISOString();offer.availableEnd=new Date(finish).toISOString();
    offer.offerExpiresAt=new Date(Math.min(Date.parse(offer.offerExpiresAt),finish)).toISOString();
  }
  return Object.fromEntries(Object.entries(offer).filter(([k,v])=>k!=='supplierTerms'||v!=null)
    .map(([k,v])=>[k,['availableStart','availableEnd','offerExpiresAt'].includes(k)?new Date(v).toISOString():v]));
}
const summary=(brief,offer)=>['Please confirm this quote for the complete scope below:',brief.scope,
  ...brief.acceptanceCriteria.map(row=>`- ${row.description}`),`Total price, including all charges: ${money(offer)}`,
  `Available window (UTC): ${offer.availableStart} to ${offer.availableEnd}`,
  `Time needed: ${offer.durationMs/60000} minutes`,
  `We propose this quote remains valid until (UTC): ${offer.offerExpiresAt}`,
  ...(offer.supplierTerms?[`Cancellation: ${offer.supplierTerms.cancellation}`,`Refund: ${offer.supplierTerms.refund}`,
    `Payment schedule: ${offer.supplierTerms.paymentSchedule}`,`Scope exclusions: ${offer.supplierTerms.scopeExclusions}`]:[]),
  'Please reply "Confirmed" if all these terms are correct, or send your corrections.',
  'This confirms a quote only. The customer has not booked or authorized work to start.'].join('\n\n');
const missing='Please reply with the all-inclusive fixed total and currency, available date and time window with timezone, time needed to finish, and quote expiry. If a fixed quote is not possible, please tell us what information is needed. This is a quote inquiry only; work has not been booked.';
const missingTerms='Please include the cancellation and refund rules, payment schedule and any scope exclusions in your quote. If there are no exclusions, please say so. This is a quote inquiry only; work has not been booked.';

export function startOrderSourceConversation({root,requestId,candidate,grantHash,brief,invitation,transactionBindingHash,maximumReplyMessages,clock}){
  if(!Number.isInteger(maximumReplyMessages)||maximumReplyMessages<1||maximumReplyMessages>4)return;
  const file=path.join(root,'conversation.json');
  if(!existsSync(file))writeOnce(file,{schema:'outsider/order-source-conversation/v1',requestId,candidate,grantHash,brief,briefHash:digest(brief),
    invitation,maximumReplyMessages,currentDelivery:transactionBindingHash,status:'WAITING_REPLY',
    history:[{role:'outsider',kind:'INQUIRY_SENT',at:clock(),transactionBindingHash,text:brief.scope}],seen:[],pendingOffer:null,
    received:0,replyMessagesSent:0,nextPollAt:clock(),createdAt:clock(),job:null,outgoing:null,
    ...(candidate.reviewedInquiryHash?{supplierTermsRequired:true}:{})});
}
export function orderSourceConversationStatus(root){
  const file=path.join(root,'conversation.json');if(!existsSync(file))return null;const state=read(file);
  return {invitationId:state.invitation.invitationId,state:state.status,received:state.received,replyMessagesSent:state.replyMessagesSent,
    ...(state.status==='SCOPE_REVIEW_REQUIRED'?{readOnly:true}:{}),
    maximumReplyMessages:state.maximumReplyMessages,offerConfirmed:state.status==='OFFER_CONFIRMED',
    nextCheckAt:terminal.has(state.status)||state.status==='WAITING_CUSTOMER'?null:state.nextPollAt,
    lastActivityAt:state.lastActivityAt??state.createdAt,
    customerQuestions:(state.customerQuestions??[]).map(q=>({questionId:q.questionId,prompt:q.prompt,state:q.state,
      participantLabel:state.candidate.participantLabel,...(q.answer!==undefined?{answer:q.answer,answerHash:digest(q.answer)}:{})})),
    ...(state.coordinationConstraints?{reInquiry:{state:state.constraintSentAt?'SENT':state.status==='REPLY_LIMIT'?'REPLY_LIMIT':'PENDING',
      constraintVersion:state.coordinationConstraints.constraintsVersion,...(state.constraintSentAt?{sentAt:state.constraintSentAt}:{})}}:{}),
    ...(state.issue?{issue:state.issue}:{})};
}

// Narrow the already authorized inquiry in its existing thread. No new
// recipient, invitation, reply allowance, booking or payment grant is created.
export async function reviseOrderSourceConstraints({root,constraints,text,active,clock,work}) {
  const file=path.join(root,'conversation.json');if(!existsSync(file))return {state:'FOLLOW_UP_UNAVAILABLE'};
  return withUserHeldExecutionLockV2(conversationLock(root),async()=>{
    const state=read(file),participant=work.invitations.find(row=>row.invitationId===state.invitation.invitationId);
    if(!active||!participant||participant.status==='DECLINED'||(work.dispatch||work.started)&&participant.invitationId===(work.currentPlan??work.selectedPlan)?.invitationId||work.workAccepted
      ||['STOPPED','EXPIRED','DECLINED','DELIVERY_UNKNOWN'].includes(state.status))return orderSourceConversationStatus(root);
    if(state.coordinationConstraints?.constraintsVersion===constraints.constraintsVersion)return orderSourceConversationStatus(root);
    if(!/^sha256:[a-f0-9]{64}$/u.test(constraints.constraintsVersion??'')||constraints.requirementId!==work.requirementId
      ||constraints.currency!==work.budget.currency||!/^(0|[1-9][0-9]*)$/u.test(constraints.maximumAmountMinor??'')
      ||BigInt(constraints.maximumAmountMinor)>BigInt(work.budget.maximumAmountMinor)
      ||!Number.isFinite(Date.parse(constraints.notBefore))||!Number.isFinite(Date.parse(constraints.completeBy))
      ||Date.parse(constraints.completeBy)>Date.parse(work.completionDeadline)||typeof text!=='string'||!text.trim())throw new Error('CONTACT_COORDINATION_INVALID');
    if(state.outgoing)return orderSourceConversationStatus(root);
    state.coordinationConstraints=constraints;state.constraintSentAt=null;
    if(state.replyMessagesSent>=state.maximumReplyMessages){state.status='REPLY_LIMIT';save(file,state);return orderSourceConversationStatus(root);}
    state.pendingOffer=null;state.incoming=null;state.job=null;
    for(const question of state.customerQuestions??[])if(question.state==='WAITING_CUSTOMER')question.state='SUPERSEDED';
    state.outgoing={text,transactionBindingHash:digest({kind:'ORDER_CONTACT_CONSTRAINT_UPDATE',requestId:state.requestId,
      constraintVersion:constraints.constraintsVersion,parent:state.currentDelivery,grantHash:state.grantHash}),constraintVersion:constraints.constraintsVersion};
    state.status='CONSTRAINT_UPDATE_READY';state.nextPollAt=clock();save(file,state);return orderSourceConversationStatus(root);
  });
}

export async function answerOrderSourceQuestion({root,questionId,answer,requestId,brief,active,clock}){
  if(!/^sourceq_[a-f0-9]{32}$/u.test(questionId??'')||typeof answer!=='string'||!answer.trim()
    ||answer.length>4000||answer.includes('\0')||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(requestId??''))throw new Error('CONTACT_CUSTOMER_ANSWER_INVALID');
  return withUserHeldExecutionLockV2(conversationLock(root),async()=>{
    const file=path.join(root,'conversation.json');if(!existsSync(file))throw new Error('CONTACT_CUSTOMER_QUESTION_NOT_FOUND');
    const state=read(file),question=state.customerQuestions?.find(q=>q.questionId===questionId);
    if(!question)throw new Error('CONTACT_CUSTOMER_QUESTION_NOT_FOUND');
    if(question.answer!==undefined){
      if(question.answer!==answer.trim()||question.answerRequestId!==requestId)throw new Error('CONTACT_CUSTOMER_ANSWER_CHANGED');
      return orderSourceConversationStatus(root);
    }
    if(!active||terminal.has(state.status)||question.state!=='WAITING_CUSTOMER'||digest(brief)!==state.briefHash
      ||Date.parse(clock())>=Date.parse(brief.completionDeadline)||state.replyMessagesSent>=state.maximumReplyMessages)throw new Error('CONTACT_CUSTOMER_QUESTION_NOT_CURRENT');
    question.answer=answer.trim();question.answerRequestId=requestId;question.answeredAt=clock();question.state='ANSWER_READY';
    state.status='CUSTOMER_ANSWER_READY';state.nextPollAt=clock();save(file,state);
    return orderSourceConversationStatus(root);
  });
}
async function interpret({root,state,packet,modelCommandFile,interpretMessage,clock,accounting}){
  if(typeof interpretMessage==='function')return interpretMessage(packet);
  if(!modelCommandFile||!existsSync(modelCommandFile)){state.status='WAITING_MODEL';return null;}
  const key=digest(packet).slice(7),directory=path.join(root,'interpretations',key),resultFile=path.join(directory,'result.json');
  if(existsSync(resultFile)){const result=read(resultFile);if(!result.ok)throw new Error(result.code);state.job=null;return result.value;}
  const running=workers.get(root);
  if(running){if(Date.now()-running.startedAt>150000){try{running.child.kill('SIGTERM');}catch{}}
    state.status='INTERPRETING_REPLY';return null;}
  if(state.job?.key===key&&Date.parse(clock())-Date.parse(state.job.startedAt)<180000){state.status='INTERPRETING_REPLY';return null;}
  if(workers.size){state.status='WAITING_MODEL';return null;}
  mkdirSync(directory,{recursive:true,mode:0o700});const jobFile=path.join(directory,'job.json');
  if(!existsSync(jobFile))writeOnce(jobFile,{modelCommandFile,packet,...(accounting?.taskId?{accounting}:{})});
  const child=spawn(process.execPath,[worker,jobFile],{cwd:directory,stdio:'ignore'});
  workers.set(root,{child,startedAt:Date.now()});child.once('exit',()=>workers.delete(root));child.once('error',()=>workers.delete(root));child.unref();
  state.job={key,startedAt:clock()};state.status='INTERPRETING_REPLY';return null;
}

export async function pollOrderSourceConversation({root,brief,active,isActive=async()=>active,receiveOnly=false,workService,channelFactory,modelCommandFile,interpretMessage,clock,accounting}){
  const file=path.join(root,'conversation.json');if(!existsSync(file))return null;
  return withUserHeldExecutionLockV2(conversationLock(root),async()=>{
    const state=read(file);if(terminal.has(state.status)&&!receiveOnly)return orderSourceConversationStatus(root);
    const persist=()=>{save(file,state);return orderSourceConversationStatus(root);};
    if(receiveOnly){
      // A changed brief revokes further sending, not receipt of an already
      // invited supplier's reply. Keep the original thread and its dedup keys.
      state.status='SCOPE_REVIEW_REQUIRED';
      if(state.seen.length>=64)return persist();
      try{
        const channel=channelFactory();
        if(!channel.readEnabled||typeof channel.receive!=='function')return persist();
        if(!state.incoming&&Date.parse(clock())<Date.parse(state.nextPollAt))return persist();
        if(!state.incoming){
          const response=await channel.receive({transactionBindingHash:state.currentDelivery,recipient:state.candidate.recipient,
            excludedResponseHashes:state.seen,maximumObservationCalls:512});
          state.nextPollAt=new Date(Date.parse(clock())+15*60000).toISOString();
          if(response.status!=='RESPONSE')return persist();
          const responseHash=byteHash(response.responseBytes);if(state.seen.includes(responseHash))return persist();
          state.incoming={responseHash,message:readContactEmail(response.responseBytes),receivedAt:clock()};state.received++;
        }
        const {responseHash,message,receivedAt}=state.incoming;
        state.history.push({role:'supplier',kind:message.automatic?'AUTOMATIC_REPLY':'REPLY_RECEIVED',text:message.body,
          at:receivedAt,receivedAt,responseHash,readOnly:true});
        state.seen.push(responseHash);state.incoming=null;state.job=null;state.lastActivityAt=receivedAt;state.issue=null;
      }catch{state.issue='CONTACT_HISTORY_RECEIVE_UNAVAILABLE';}
      return persist();
    }
    if(!active||digest(brief)!==state.briefHash){state.status='STOPPED';return persist();}
    if(Date.parse(clock())>=Date.parse(brief.completionDeadline)){state.status='EXPIRED';return persist();}
    if(state.seen.length>=64){state.status='REPLY_LIMIT';return persist();}
    const current=workService.inspect(state.requestId),participant=current.invitations.find(row=>row.invitationId===state.invitation.invitationId);
    if(!participant||participant.status==='DECLINED'){state.status='STOPPED';return persist();}
    if(participant.offer&&!state.coordinationConstraints){state.status='OFFER_CONFIRMED';return persist();}
    if(state.coordinationConstraints)brief={...brief,coordinationConstraints:state.coordinationConstraints};
    const command=async(action,responseHash)=>{
      if(!await isActive()){state.status='STOPPED';throw new Error('CONTACT_ORDER_STOPPED');}
      await workService.respondIdempotent(state.invitation.invitationId,state.invitation.token,{commandId:`workcmd_${digest({requestId:state.requestId,responseHash,action}).slice(7,39)}`,command:action});
    };
    try{
      const channel=channelFactory();
      const sendPending=async()=>{
        if(!await isActive()){state.status='STOPPED';throw new Error('CONTACT_ORDER_STOPPED');}
        const outgoing=state.outgoing,bytes=Buffer.from(outgoing.text.replace(/\r?\n/gu,'\r\n'),'utf8');
        await channel.send({recipient:state.candidate.recipient,candidateRefHash:state.candidate.candidateHash,tenderBytes:bytes,tenderBodyHash:byteHash(bytes),
          transactionBindingHash:outgoing.transactionBindingHash,authorityGrantHash:state.grantHash,effectDeadline:brief.completionDeadline,
          idempotencyKey:outgoing.transactionBindingHash,oneUseNonceHash:digest({kind:'ORDER_CONTACT_REPLY',transaction:outgoing.transactionBindingHash}),
          replyToTransactionBindingHash:state.currentDelivery});
        state.currentDelivery=outgoing.transactionBindingHash;state.history.push({role:'outsider',kind:'REPLY_SENT',
          text:outgoing.text,at:clock(),transactionBindingHash:outgoing.transactionBindingHash});
        if(outgoing.questionId){const question=state.customerQuestions?.find(q=>q.questionId===outgoing.questionId);
          if(question){question.state='ANSWER_SENT';question.sentAt=clock();}}
        if(outgoing.constraintVersion)state.constraintSentAt=clock();
        state.replyMessagesSent++;state.lastActivityAt=clock();state.outgoing=null;state.status=state.pendingOffer?'WAITING_QUOTE_CONFIRMATION':'WAITING_REPLY';
        state.nextPollAt=new Date(Date.parse(clock())+60000).toISOString();state.issue=null;
      };
      const answered=state.customerQuestions?.find(q=>q.state==='ANSWER_READY');
      if(answered&&!state.outgoing){
        const text=['The customer provided this answer to the question below:',answered.prompt,answered.answer,
          'Please use this information to prepare your quote for the existing scope. This is not a booking or authorization to start work.'].join('\n\n');
        const transactionBindingHash=digest({kind:'ORDER_CONTACT_CUSTOMER_ANSWER',requestId:state.requestId,questionId:answered.questionId,
          answerHash:digest(answered.answer),grantHash:state.grantHash,parent:state.currentDelivery});
        state.outgoing={text,transactionBindingHash,questionId:answered.questionId};save(file,state);
      }
      if(state.outgoing){await sendPending();return persist();}
      if(!channel.readEnabled||typeof channel.receive!=='function'){state.status='WAITING_MAILBOX_ACCESS';return persist();}
      if(!state.incoming&&Date.parse(clock())<Date.parse(state.nextPollAt))return orderSourceConversationStatus(root);
      if(!state.incoming){
        const response=await channel.receive({transactionBindingHash:state.currentDelivery,recipient:state.candidate.recipient,
          excludedResponseHashes:state.seen,maximumObservationCalls:512});
        state.nextPollAt=new Date(Date.parse(clock())+15*60000).toISOString();
        if(response.status!=='RESPONSE')return persist();
        const responseHash=byteHash(response.responseBytes);if(state.seen.includes(responseHash))return persist();
        const message=readContactEmail(response.responseBytes);state.received++;
        if(message.automatic){state.history.push({role:'supplier',kind:'AUTOMATIC_REPLY',at:clock(),text:message.body,responseHash});
          state.lastActivityAt=clock();state.seen.push(responseHash);return persist();}
        state.incoming={responseHash,message,receivedAt:clock()};state.lastActivityAt=clock();
        save(file,state);
      }
      const {responseHash,message,receivedAt}=state.incoming;
      const packet=contactMessagePacket({brief,receivedAt,history:state.history.slice(-10),message,pendingOffer:state.pendingOffer,
        customerAnswers:(state.customerQuestions??[]).filter(q=>q.state==='ANSWER_SENT').map(q=>({question:q.prompt,answer:q.answer}))});
      if(accounting?.taskId)packet.taskId=accounting.taskId;
      const result=message.truncated||!message.body?{intent:'QUESTION',reply:'Please send the quote details in the email body so we can confirm them. We cannot read this attachment or the full message yet.',offer:null}
        :await interpret({root,state,packet,modelCommandFile,interpretMessage,clock,accounting});
      if(result===null)return persist();
      if(!validContactMessage(result))throw new Error('CONTACT_MODEL_REPLY_INVALID');
      // Apply commands before marking the email consumed. The original work
      // command id survives a crash between its event append and this save.
      if(result.intent==='DECLINE'){
        await command({action:'DECLINE'},responseHash);state.status='DECLINED';
      }else if(result.intent==='CONFIRM'&&state.pendingOffer&&normalizeOffer(state.pendingOffer,brief,clock,state)){
        await command({action:'OFFER',...state.pendingOffer},responseHash);state.status='OFFER_CONFIRMED';
      }else if(result.intent==='ASK_CUSTOMER'){
        if(!result.reply.trim()||result.offer!==null)throw new Error('CONTACT_CUSTOMER_QUESTION_INVALID');
        state.pendingOffer=null;
        if(state.replyMessagesSent>=state.maximumReplyMessages)state.status='REPLY_LIMIT';
        else{
          state.customerQuestions??=[];
          for(const q of state.customerQuestions)if(q.state==='WAITING_CUSTOMER')q.state='SUPERSEDED';
          state.customerQuestions.push({questionId:`sourceq_${digest({invitationId:state.invitation.invitationId,responseHash,prompt:result.reply.trim()}).slice(7,39)}`,
            prompt:result.reply.trim(),state:'WAITING_CUSTOMER',createdAt:clock()});
          state.status='WAITING_CUSTOMER';
        }
      }else if(result.intent!=='IGNORE'){
        const offer=normalizeOffer(result.offer,brief,clock,state);
        if(offer)for(const q of state.customerQuestions??[])if(q.state==='WAITING_CUSTOMER')q.state='SUPERSEDED';
        const termsMissing=state.supplierTermsRequired&&normalizeOffer(result.offer,brief,clock)&&!validSupplierQuoteTerms(result.offer?.supplierTerms);
        const text=offer?summary(brief,offer):termsMissing?missingTerms:result.reply.trim()||missing;
        state.pendingOffer=offer;
        if(state.replyMessagesSent>=state.maximumReplyMessages)state.status='REPLY_LIMIT';
        else{
          const transactionBindingHash=digest({kind:'ORDER_CONTACT_REPLY',requestId:state.requestId,candidateHash:state.candidate.candidateHash,
            grantHash:state.grantHash,responseHash,parent:state.currentDelivery,text});
          state.outgoing={text,transactionBindingHash};
        }
      }
      state.history.push({role:'supplier',kind:result.intent,at:receivedAt,text:message.body,responseHash});
      state.seen.push(responseHash);state.incoming=null;state.job=null;state.issue=null;
      save(file,state);
      if(state.outgoing)await sendPending();
      return persist();
    }catch(error){
      const code=error?.outsiderCode??error?.code??error?.message;
      state.issue=/^[A-Z][A-Z0-9_]{1,120}$/u.test(code??'')?code:'CONTACT_CONVERSATION_UNAVAILABLE';
      if(/AMBIGUOUS|ALREADY_ATTEMPTED_NO_RETRY/u.test(code??''))state.status='DELIVERY_UNKNOWN';
      else if(!terminal.has(state.status))state.status=/MODEL/u.test(code??'')?'WAITING_MODEL':'WAITING_CONTACT_CHANNEL';
      return persist();
    }
  });
}
