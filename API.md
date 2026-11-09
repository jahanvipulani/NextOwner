# NextOwner API contract (v1)

Base path `/api`. JSON everywhere except file upload (multipart) and PDF (binary).
Auth: `Authorization: Bearer <jwt>`. Errors: `{"detail": "message"}` (FastAPI 422 gives `detail` as an array of `{loc,msg}`).
Frontend calls `/api/...` on its own origin (nginx proxies to backend:8000; Vite dev server proxies too).

## Vocabulary
- Project roles: `team_lead` | `reviewer` | `contributor` | `incoming_owner`
- Claim category: `decision` | `ownership` | `risk` | `dependency` | `question` | `contact`
- Review status (`status`): `pending` | `accepted` | `edited` | `rejected` | `unknown`
- Evidence status: `verified` | `single_source` | `conflicting` | `no_evidence`
- Source type: `document` | `meeting_notes` | `chat_export` | `github`
- Handover status: `draft` | `approved` | `shared`
- Project status: `planning` | `in_progress` | `ready_for_handover` | `completed`
- Any detail field may be `null`; the UI shows "Unknown".

## Shapes
User `{id,name,email,organisation}`
ProjectSummary `{id,name,description,category,status,owner:{id,name},incoming_owner:{id,name}|null,member_count,source_count,claim_count,reviewed_count,progress(0-100),start_date,updated_at,my_role}`
ProjectDetail = ProjectSummary + `{members:[{user_id,name,email,role}], permissions:[string], counts:{pending,accepted,edited,rejected,unknown}, last_reconstruction:{at,mode,claims}|null}`
Source `{id,project_id,name,source_type,mime,size_bytes,page_count,confidential,uploaded_by,created_at,status:"processed"|"failed",error|null,origin:string|null}`
Evidence `{id,source_id,source_name,source_type,quote,page|null,location|null,author|null,date|null,reference,confidential}`
Claim `{id,project_id,category,text,status,evidence_status,evidence_note|null,details:{...},evidence:[Evidence],comment_count,reviewed_by|null,reviewed_at|null,created_at,updated_at}`
 details by category:
 - decision `{rationale,decision_date,responsible_person}`
 - ownership `{assignee,status,deadline}`
 - risk `{severity:"low"|"medium"|"high"|null,impact,mitigation}`
 - dependency `{related_task,component,responsible_person}`
 - question `{why_it_matters,responsible_person,related_source}`
 - contact `{name,role,area,contact_details}`
Comment `{id,claim_id,author,author_role,kind:"comment"|"clarification"|"information",body,created_at}`
HistoryEntry `{id,claim_id,claim_text,reviewer,action,previous:{text,details,status},updated:{text,details,status},comment|null,created_at}`
Activity `{id,project_id,project_name,kind,message,user|null,created_at}`
Notification `{id,title,body,link|null,read,created_at}`
Handover `{id,project_id,project_name,version,status,content,generated_at,approved_by|null,approved_at|null,shared_at|null,acknowledged_by|null,acknowledged_at|null}`
 content `{overview:string, first_week_plan:[{day,title,detail,claim_id|null}], decisions:[ClaimLite], responsibilities:[ClaimLite], risks:[ClaimLite], dependencies:[ClaimLite], questions:[ClaimLite], contacts:[ClaimLite], unresolved:[ClaimLite], evidence_refs:[{claim_id,source_name,page,quote,reference}]}`
 ClaimLite `{id,category,text,status,evidence_status,details,evidence:[Evidence]}`
 `unresolved` = pending/unknown claims plus open questions and conflicting claims (kept visible, never presented as approved).

## Endpoints
Auth
- POST `/auth/register` `{name,email,password,organisation?}` -> `{access_token,user}`
- POST `/auth/login` `{email,password}` -> `{access_token,user}`
- GET `/auth/me` -> User
System
- GET `/system` -> `{llm_enabled,llm_model|null,max_upload_mb,allowed_types:["pdf","docx","txt"],demo_mode}`
Dashboard
- GET `/dashboard` -> `{stats:{projects:{total,active},sources:{total,recent},claims:{total,verified},reviews:{pending,high_priority},handovers:{approved,recently_shared}}, progress:[{stage,value}] (stages: "Sources Connected","Knowledge Extracted","Claims Reviewed","Handover Approved"), activity:[Activity] (latest 12), projects:[ProjectSummary] (latest 6)}`
Projects
- GET `/projects?q=&status=&sort=updated|name|progress` -> [ProjectSummary]
- POST `/projects` `{name,description,category,owner_email?,incoming_owner_email?,members?:[{email,role}],start_date?,status?}` -> ProjectSummary (creator becomes team_lead; unknown emails -> 422 detail string)
- GET `/projects/{id}` -> ProjectDetail
- PATCH `/projects/{id}` (team_lead) `{name?,description?,status?,category?}` -> ProjectDetail
- POST `/projects/{id}/members` (team_lead) `{email,role}` -> ProjectDetail ; PATCH `/projects/{id}/members/{user_id}` `{role}` ; DELETE `/projects/{id}/members/{user_id}`
- GET `/permissions` -> `{roles:[{name,label,permissions:[string]}], all_permissions:[{key,label}]}`
Sources (team_lead connect/upload; reviewer + team_lead read)
- GET `/integrations?project_id=` -> `[{key,name,description,status:"connected"|"available"|"not_implemented",implemented:boolean,last_synced_at|null}]` keys: github, google_drive, google_docs, pdf, docx, txt, meeting_notes, chat_export
- GET `/projects/{id}/sources` -> [Source]
- POST `/projects/{id}/sources/upload` multipart `file`, `source_type` (document|meeting_notes|chat_export), `confidential` ("true"/"false"), `author?`, `doc_date?` -> Source (415 bad type, 413 too large, 422 empty/unreadable)
- POST `/projects/{id}/sources/github` `{repo:"owner/name",max_items?:number}` -> Source (public repos; optional GITHUB_TOKEN server side)
- GET `/sources/{id}` -> `{source:Source,pages:[{page,text}]}` ; DELETE `/sources/{id}` (team_lead)
Reconstruction
- POST `/projects/{id}/reconstruct` (team_lead|reviewer) -> `{mode:"llm"|"rules",claims_created,sources_used,sources_skipped,by_category:{...},evidence_status:{verified,single_source,conflicting,no_evidence},warnings:[string]}` ; re-running replaces unreviewed (pending) claims only and keeps reviewed ones
- GET `/projects/{id}/reconstruction` -> `{last_run:{at,mode,claims}|null,by_category,claims:[Claim]}`
Claims / evidence / review
- GET `/projects/{id}/claims?category=&evidence_status=&status=&source_id=&q=` -> [Claim] (team_lead, reviewer; contributor gets only claims where details.assignee/responsible matches their name, no confidential evidence)
- GET `/claims/{id}` -> `{claim:Claim,comments:[Comment],history:[HistoryEntry]}`
- POST `/claims/{id}/review` (team_lead|reviewer) `{action:"accept"|"edit"|"reject"|"unknown",text?,details?,comment?}` -> Claim (edit requires text)
- POST `/claims/{id}/comments` (team_lead|reviewer|contributor) `{body,kind}` -> Comment
- GET `/projects/{id}/review-history` -> [HistoryEntry]
Handovers
- GET `/projects/{id}/handovers` -> [Handover] newest first (team_lead|reviewer)
- POST `/projects/{id}/handover/generate` (team_lead|reviewer) -> Handover (new draft from accepted/edited claims; replaces existing draft)
- PUT `/handovers/{id}` (team_lead|reviewer, draft only) `{overview,first_week_plan}` -> Handover
- POST `/handovers/{id}/approve` (team_lead, or reviewer with `handover.approve`) -> Handover ; 409 if conflicting/pending claims block? no: unresolved are allowed but listed
- POST `/handovers/{id}/share` (team_lead, must be approved) -> Handover
- GET `/handovers/{id}/pdf` -> application/pdf (team_lead|reviewer any status; incoming_owner only if shared, filtered)
- GET `/handovers` -> all handovers visible to me (Reports page)
Incoming owner
- GET `/incoming` -> [Handover] shared with me (content filtered: no confidential evidence, no pending/rejected claims)
- GET `/incoming/{id}` -> Handover (filtered)
- POST `/incoming/{id}/acknowledge` -> Handover
Other
- GET `/activity?project_id=&limit=` -> [Activity]
- GET `/notifications` -> [Notification] ; POST `/notifications/read-all` ; POST `/notifications/{id}/read`

## Demo accounts (password `Demo@12345`)
lead@demo.nextowner.dev (team lead, Priya Sharma), reviewer@demo.nextowner.dev (Rahul Nair), contributor@demo.nextowner.dev (Meera Joshi), incoming@demo.nextowner.dev (Sana Kapoor). Demo project: "Student Research Portal" (synthetic).
