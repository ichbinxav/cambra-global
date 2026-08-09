import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const ENGINE_VERSION = 'cambra-developer-v1';
const GITHUB_API = 'https://api.github.com';
const MAX_FILES = 28;
const MAX_FILE_BYTES = 70_000;
const MAX_TOTAL_BYTES = 260_000;

const json = (body:any, status=200) => Response.json(body, { status });
const now = () => new Date().toISOString();
const cleanRepo = (v:any) => String(v || '').trim().replace(/^https?:\/\/github\.com\//i,'').replace(/\.git$/,'').replace(/^\/+|\/+$/g,'');

async function github(token:string, path:string, init:RequestInit={}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data:any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`github_${res.status}:${typeof data === 'string' ? data.slice(0,180) : (data?.message || 'request_failed')}`);
  return data;
}

async function connection(svc:any) {
  const conn = await svc.connectors.getConnection('github').catch(() => null);
  if (!conn?.accessToken) throw new Error('github_connector_required');
  return conn.accessToken as string;
}

async function callClaude(prompt:string, maxTokens=7000) {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('anthropic_required');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:'claude-sonnet-4-5',max_tokens:maxTokens,messages:[{role:'user',content:prompt}]})
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`anthropic_${res.status}:${data?.error?.message || 'request_failed'}`);
  return data?.content?.map((x:any)=>x?.text||'').join('\n') || '';
}

function parseJson(text:string) {
  const cleaned = String(text||'').replace(/```json\s*/gi,'').replace(/```/g,'').trim();
  try { return JSON.parse(cleaned); } catch {}
  const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a,b+1)); } catch {} }
  throw new Error('ai_json_parse_failed');
}

function interestingPath(path:string) {
  const p = path.toLowerCase();
  if (/(^|\/)(node_modules|dist|build|coverage|\.next|vendor)\//.test(p)) return false;
  if (/(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|pyproject\.toml|composer\.json|gemfile|pom\.xml|build\.gradle|dockerfile|\.github\/workflows\/.*\.ya?ml)$/.test(p)) return true;
  return /(stripe|adyen|checkout|payment|payments|billing|webhook|refund|subscription|3ds|paymentintent|payment_intent|psp)/.test(p) && /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|php|java|kt|go|cs|json|ya?ml|toml)$/.test(p);
}

function b64decode(s:string) {
  try { return atob(String(s||'').replace(/\n/g,'')); } catch { return ''; }
}
function b64encodeUtf8(s:string) {
  const bytes = new TextEncoder().encode(s);
  let bin=''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function repoContext(token:string, fullName:string, branch:string) {
  const ref = await github(token, `/repos/${fullName}/git/ref/heads/${encodeURIComponent(branch)}`);
  const baseSha = ref?.object?.sha;
  const commit = await github(token, `/repos/${fullName}/git/commits/${baseSha}`);
  const treeSha = commit?.tree?.sha;
  const tree = await github(token, `/repos/${fullName}/git/trees/${treeSha}?recursive=1`);
  const all = Array.isArray(tree?.tree) ? tree.tree : [];
  const candidates = all.filter((x:any)=>x?.type==='blob' && interestingPath(String(x.path||''))).slice(0, MAX_FILES);
  const files:any[] = [];
  let total=0;
  for (const f of candidates) {
    if (total >= MAX_TOTAL_BYTES) break;
    const raw = await github(token, `/repos/${fullName}/contents/${encodeURIComponent(f.path).replace(/%2F/g,'/')}?ref=${encodeURIComponent(branch)}`).catch(()=>null);
    if (!raw?.content || raw?.encoding !== 'base64') continue;
    const content = b64decode(raw.content);
    const clipped = content.slice(0, Math.min(MAX_FILE_BYTES, Math.max(0, MAX_TOTAL_BYTES-total)));
    total += clipped.length;
    files.push({path:f.path, sha:raw.sha, content:clipped, truncated:clipped.length < content.length});
  }
  return { baseSha, treeSha, files, total, tree_truncated:!!tree?.truncated, candidate_count:candidates.length };
}

async function requireAdmin(base44:any) {
  const user = await base44.auth.me().catch(()=>null);
  if (!user) return { error: json({ok:false,error:'Unauthorized'},401) };
  if (user.role !== 'admin') return { error: json({ok:false,error:'Forbidden'},403) };
  return { user };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const auth = await requireAdmin(base44);
  if (auth.error) return auth.error;
  const user:any = auth.user;
  const svc = base44.asServiceRole;
  const body = await req.json().catch(()=>({}));
  const action = String(body?.action || 'status');

  try {
    if (action === 'status') {
      const connected = !!(await svc.connectors.getConnection('github').catch(()=>null))?.accessToken;
      const workspaces = await svc.entities.DeveloperWorkspace.list('-updated_date',200).catch(()=>[]);
      const runs = await svc.entities.DeveloperMigrationRun.list('-created_date',200).catch(()=>[]);
      return json({ok:true,engine_version:ENGINE_VERSION,github_connected:connected,workspaces,runs});
    }

    const token = await connection(svc);

    if (action === 'list_repositories') {
      const rows = await github(token, '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member');
      const repos = (rows||[]).map((r:any)=>({full_name:r.full_name,name:r.name,owner:r.owner?.login,private:!!r.private,default_branch:r.default_branch,permissions:r.permissions||{},updated_at:r.updated_at}));
      return json({ok:true,repositories:repos});
    }

    if (action === 'create_workspace') {
      const fullName = cleanRepo(body?.repo_full_name);
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) return json({ok:false,error:'invalid_repo_full_name'},400);
      const repo = await github(token, `/repos/${fullName}`);
      const brandId = String(body?.brand_id || '_platform');
      const existing = await svc.entities.DeveloperWorkspace.filter({repo_full_name:fullName,brand_id:brandId},'-created_date',1).catch(()=>[]);
      if (existing?.[0]) return json({ok:true,workspace:existing[0],reused:true});
      const workspace = await svc.entities.DeveloperWorkspace.create({
        brand_id:brandId, deal_activation_id:String(body?.deal_activation_id||''), provider:'github',
        repo_owner:repo.owner?.login||fullName.split('/')[0], repo_name:repo.name||fullName.split('/')[1], repo_full_name:fullName,
        default_branch:repo.default_branch||'main', current_provider:String(body?.current_provider||''), target_provider:String(body?.target_provider||''),
        status:'connected', policy:{branch_only:true,direct_default_branch_writes:false,pr_required:true,cutover_requires_l4:true,rollback_guard:'only_if_head_unchanged'},
        created_by_email:user.email||'',
      });
      return json({ok:true,workspace});
    }

    const workspaceId = String(body?.workspace_id || '');
    if (!workspaceId) return json({ok:false,error:'workspace_id_required'},400);
    const workspace = await svc.entities.DeveloperWorkspace.get(workspaceId).catch(()=>null);
    if (!workspace) return json({ok:false,error:'workspace_not_found'},404);
    const fullName = cleanRepo(workspace.repo_full_name);
    const baseBranch = String(workspace.default_branch || 'main');

    if (action === 'scan_and_plan') {
      await svc.entities.DeveloperWorkspace.update(workspaceId,{status:'planning'});
      const ctx = await repoContext(token, fullName, baseBranch);
      const fileBundle = ctx.files.map((f:any)=>`\n--- FILE ${f.path}${f.truncated?' (TRUNCATED)':''} ---\n${f.content}`).join('\n');
      const prompt = `You are CAMBRA Developer, a senior payments migration engineer.\nRepository: ${fullName}\nCurrent PSP/provider hint: ${workspace.current_provider||'unknown'}\nTarget PSP/provider: ${workspace.target_provider||body?.target_provider||'unknown'}\n\nAnalyze ONLY the supplied repository files. Produce a conservative migration plan from the current payment integration to the target provider. Do not invent secrets, credentials, APIs or file contents you did not see. Preserve business behavior. Include checkout/payment creation, 3DS/SCA, webhooks, refunds, subscriptions if present, reconciliation/idempotency, env vars, tests, rollout and rollback. Mark unknowns explicitly.\n\nReturn ONLY JSON: {"detected":{"providers":[],"frameworks":[],"payment_flows":[],"webhooks":[],"risks":[]},"summary":"","confidence":0.0,"changes":[{"path":"","change_type":"modify|create","purpose":"","instructions":""}],"tests":[{"name":"","command_or_method":""}],"required_env_vars":[{"name":"","secret":true,"purpose":""}],"cutover_checks":[],"rollback_plan":[],"blockers":[]}\n\nFILES:${fileBundle}`;
      const plan = parseJson(await callClaude(prompt,6500));
      const run = await svc.entities.DeveloperMigrationRun.create({
        workspace_id:workspaceId,brand_id:workspace.brand_id||'_platform',deal_activation_id:workspace.deal_activation_id||'',status:'awaiting_approval',
        source_provider:workspace.current_provider||'',target_provider:workspace.target_provider||'',base_branch:baseBranch,detected_files:ctx.files.map((x:any)=>x.path),
        migration_plan:{...plan,engine_version:ENGINE_VERSION,base_sha:ctx.baseSha,base_tree_sha:ctx.treeSha,scan_bytes:ctx.total,tree_truncated:ctx.tree_truncated},started_at:now(),created_by_email:user.email||''
      });
      const task = await svc.entities.AgentTask.create({brand_id:workspace.brand_id||'_platform',agent_name:'developer_migration',task_type:'developer_migration_plan',status:'completed',requires_approval:true,risk_level:3,input_summary:`Plan migration ${fullName}`,output_summary:plan.summary||'Developer migration plan ready',output_payload_json:{run_id:run.id,workspace_id:workspaceId,plan},started_at:now(),completed_at:now()});
      const approval = await svc.entities.Approval.create({brand_id:workspace.brand_id||'_platform',agent_task_id:task.id,action_type:'developer_apply_patch',related_entity_type:'DeveloperMigrationRun',related_entity_id:run.id,risk_level:3,draft_content:`Apply CAMBRA Developer migration plan to a NEW branch and open a PR for ${fullName}. No direct default-branch write.`,draft_payload_json:{workspace_id:workspaceId,run_id:run.id,repo_full_name:fullName,base_branch:baseBranch,summary:plan.summary||''},status:'pending'});
      await svc.entities.DeveloperMigrationRun.update(run.id,{approval_id:approval.id});
      await svc.entities.DeveloperWorkspace.update(workspaceId,{status:'ready',stack_snapshot:plan.detected||{},last_scan_at:now()});
      return json({ok:true,run_id:run.id,approval_id:approval.id,plan});
    }

    const runId = String(body?.run_id||'');
    if (!runId) return json({ok:false,error:'run_id_required'},400);
    const run = await svc.entities.DeveloperMigrationRun.get(runId).catch(()=>null);
    if (!run || run.workspace_id !== workspaceId) return json({ok:false,error:'run_not_found'},404);

    if (action === 'apply_plan') {
      const approval = run.approval_id ? await svc.entities.Approval.get(run.approval_id).catch(()=>null) : null;
      if (approval?.status !== 'approved') return json({ok:false,error:'developer_patch_approval_required',approval_id:run.approval_id||null},409);
      const ctx = await repoContext(token, fullName, baseBranch);
      const expectedBase = run.migration_plan?.base_sha;
      if (expectedBase && ctx.baseSha !== expectedBase) return json({ok:false,error:'base_branch_changed_rescan_required',expected:expectedBase,actual:ctx.baseSha},409);
      const relevant = new Set((run.migration_plan?.changes||[]).map((x:any)=>String(x.path||'')));
      const files = ctx.files.filter((f:any)=>relevant.has(f.path));
      const bundle = files.map((f:any)=>`\n--- CURRENT FILE ${f.path} ---\n${f.content}`).join('\n');
      const prompt = `You are CAMBRA Developer. Apply the approved migration plan to repository files. Return full replacement contents only for files that must change or be created. NEVER include secrets or real credentials. NEVER delete files. Preserve unrelated code. Do not alter CI to weaken tests.\n\nAPPROVED PLAN:\n${JSON.stringify(run.migration_plan)}\n\nCURRENT FILES:${bundle}\n\nReturn ONLY JSON: {"files":[{"path":"","content":"","reason":""}],"notes":[]}.`;
      const patch = parseJson(await callClaude(prompt,9000));
      const outFiles = Array.isArray(patch?.files)?patch.files:[];
      if (!outFiles.length) return json({ok:false,error:'no_patch_generated'},409);
      if (outFiles.length > 20) return json({ok:false,error:'patch_too_large'},409);
      const branch = `cambra/migration-${run.id.slice(-8)}-${Date.now().toString(36)}`;
      await github(token, `/repos/${fullName}/git/refs`, {method:'POST',body:JSON.stringify({ref:`refs/heads/${branch}`,sha:ctx.baseSha})});
      await svc.entities.DeveloperMigrationRun.update(run.id,{status:'patching',working_branch:branch,rollback_sha:ctx.baseSha,migration_plan:{...run.migration_plan,rollback_tree_sha:ctx.treeSha}});
      const touched:string[]=[];
      for (const f of outFiles) {
        const path=String(f?.path||'').replace(/^\/+/, '');
        if (!path || path.includes('..') || !String(f?.content||'').trim()) throw new Error('unsafe_patch_path_or_content');
        const current = await github(token, `/repos/${fullName}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}?ref=${encodeURIComponent(branch)}`).catch(()=>null);
        const payload:any={message:`CAMBRA Developer: migrate ${path}`,content:b64encodeUtf8(String(f.content)),branch};
        if(current?.sha) payload.sha=current.sha;
        await github(token, `/repos/${fullName}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}`,{method:'PUT',body:JSON.stringify(payload)});
        touched.push(path);
      }
      const pr = await github(token, `/repos/${fullName}/pulls`, {method:'POST',body:JSON.stringify({title:`CAMBRA Developer · ${run.source_provider||'payments'} → ${run.target_provider||'target provider'}`,head:branch,base:baseBranch,body:`Automated migration PR generated by CAMBRA Developer.\n\n${run.migration_plan?.summary||''}\n\nSafety: branch-only changes; merge/cutover requires separate L4 approval.`})});
      await svc.entities.DeveloperMigrationRun.update(run.id,{status:'pr_open',pull_request_url:pr.html_url||'',pull_request_number:pr.number||0,detected_files:touched,commit_sha:pr.head?.sha||''});
      await svc.entities.DeveloperWorkspace.update(workspaceId,{status:'migrating'});
      return json({ok:true,run_id:run.id,branch,pr_url:pr.html_url,pr_number:pr.number,touched_files:touched});
    }

    if (action === 'check_pr') {
      if (!run.pull_request_number) return json({ok:false,error:'pr_not_open'},409);
      const pr = await github(token, `/repos/${fullName}/pulls/${run.pull_request_number}`);
      const sha=pr?.head?.sha;
      const checks = sha ? await github(token, `/repos/${fullName}/commits/${sha}/check-runs?per_page=100`).catch(()=>({check_runs:[]})) : {check_runs:[]};
      const runs=(checks?.check_runs||[]).map((c:any)=>({name:c.name,status:c.status,conclusion:c.conclusion,details_url:c.details_url}));
      const pending=runs.filter((x:any)=>x.status!=='completed').length;
      const failed=runs.filter((x:any)=>x.status==='completed' && !['success','neutral','skipped'].includes(x.conclusion)).length;
      const result={head_sha:sha,total:runs.length,pending,failed,passed:runs.filter((x:any)=>x.conclusion==='success').length,checks:runs,mergeable:pr.mergeable,mergeable_state:pr.mergeable_state};
      await svc.entities.DeveloperMigrationRun.update(run.id,{status:failed?'failed':(pending?'testing':'pr_open'),test_results:result,commit_sha:sha||run.commit_sha});
      return json({ok:true,test_results:result});
    }

    if (action === 'request_cutover') {
      if (run.status !== 'pr_open') return json({ok:false,error:'pr_must_be_ready'},409);
      if ((run.test_results?.failed||0)>0 || (run.test_results?.pending||0)>0) return json({ok:false,error:'checks_not_green'},409);
      const task = await svc.entities.AgentTask.create({brand_id:workspace.brand_id||'_platform',agent_name:'developer_migration',task_type:'developer_cutover',status:'completed',requires_approval:true,risk_level:4,input_summary:`Request merge/cutover ${fullName} PR #${run.pull_request_number}`,output_summary:'All observed checks green; L4 approval required before merge/cutover.',output_payload_json:{run_id:run.id,pr:run.pull_request_url,test_results:run.test_results},started_at:now(),completed_at:now()});
      const approval=await svc.entities.Approval.create({brand_id:workspace.brand_id||'_platform',agent_task_id:task.id,action_type:'migration_go_live',related_entity_type:'DeveloperMigrationRun',related_entity_id:run.id,risk_level:4,draft_content:`Merge ${fullName} PR #${run.pull_request_number} into ${baseBranch}. This can trigger production deployment.`,draft_payload_json:{workspace_id:workspaceId,run_id:run.id,repo_full_name:fullName,pr_number:run.pull_request_number,test_results:run.test_results},status:'pending'});
      await svc.entities.DeveloperMigrationRun.update(run.id,{status:'awaiting_cutover_approval',cutover_approval_id:approval.id});
      return json({ok:true,approval_id:approval.id,status:'awaiting_cutover_approval'});
    }

    if (action === 'cutover') {
      const approval=run.cutover_approval_id?await svc.entities.Approval.get(run.cutover_approval_id).catch(()=>null):null;
      if (approval?.status!=='approved') return json({ok:false,error:'l4_cutover_approval_required',approval_id:run.cutover_approval_id||null},409);
      const currentRef=await github(token,`/repos/${fullName}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
      if (run.rollback_sha && currentRef?.object?.sha!==run.rollback_sha) return json({ok:false,error:'default_branch_changed_before_cutover'},409);
      const merged=await github(token,`/repos/${fullName}/pulls/${run.pull_request_number}/merge`,{method:'PUT',body:JSON.stringify({merge_method:'squash',commit_title:`CAMBRA Developer migration (${run.id})`})});
      if(!merged?.merged) return json({ok:false,error:'github_merge_rejected',message:merged?.message||''},409);
      await svc.entities.DeveloperMigrationRun.update(run.id,{status:'verifying',commit_sha:merged.sha||run.commit_sha,verification:{merge_sha:merged.sha,merged_at:now(),status:'pending'}});
      await svc.entities.DeveloperWorkspace.update(workspaceId,{status:'verifying'});
      return json({ok:true,status:'verifying',merge_sha:merged.sha});
    }

    if (action === 'verify') {
      const healthy = body?.healthy === true;
      const evidence = body?.evidence && typeof body.evidence==='object' ? body.evidence : {};
      if (healthy) {
        await svc.entities.DeveloperMigrationRun.update(run.id,{status:'completed',verification:{...(run.verification||{}),status:'passed',evidence,verified_at:now()},completed_at:now()});
        await svc.entities.DeveloperWorkspace.update(workspaceId,{status:'completed'});
        return json({ok:true,status:'completed'});
      }
      await svc.entities.DeveloperMigrationRun.update(run.id,{status:'failed',verification:{...(run.verification||{}),status:'failed',evidence,verified_at:now()}});
      await svc.entities.DeveloperWorkspace.update(workspaceId,{status:'blocked'});
      return json({ok:true,status:'failed',rollback_available:!!run.rollback_sha});
    }

    if (action === 'rollback') {
      if (!run.rollback_sha || !run.migration_plan?.rollback_tree_sha || !run.commit_sha) return json({ok:false,error:'rollback_metadata_missing'},409);
      const approval=run.cutover_approval_id?await svc.entities.Approval.get(run.cutover_approval_id).catch(()=>null):null;
      if (approval?.status!=='approved') return json({ok:false,error:'l4_approval_required'},409);
      const currentRef=await github(token,`/repos/${fullName}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
      if(currentRef?.object?.sha!==run.commit_sha) return json({ok:false,error:'rollback_refused_head_changed',expected:run.commit_sha,actual:currentRef?.object?.sha},409);
      const revertCommit=await github(token,`/repos/${fullName}/git/commits`,{method:'POST',body:JSON.stringify({message:`CAMBRA Developer rollback ${run.id}`,tree:run.migration_plan.rollback_tree_sha,parents:[run.commit_sha]})});
      await github(token,`/repos/${fullName}/git/refs/heads/${encodeURIComponent(baseBranch)}`,{method:'PATCH',body:JSON.stringify({sha:revertCommit.sha,force:false})});
      await svc.entities.DeveloperMigrationRun.update(run.id,{status:'rolled_back',verification:{...(run.verification||{}),rollback_commit_sha:revertCommit.sha,rolled_back_at:now()}});
      await svc.entities.DeveloperWorkspace.update(workspaceId,{status:'blocked'});
      return json({ok:true,status:'rolled_back',rollback_commit_sha:revertCommit.sha});
    }

    return json({ok:false,error:'unsupported_action'},400);
  } catch (error:any) {
    console.error('developerMigrationEngine',action,error);
    return json({ok:false,error:String(error?.message||'developer_engine_failed')},500);
  }
});
