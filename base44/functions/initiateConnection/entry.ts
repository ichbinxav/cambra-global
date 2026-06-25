import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M5 — initiateConnection
 *
 * Creates a ConnectionSession + initial ConnectionTask(s) for a brand
 * to begin connecting an integration.
 *
 * Payload: { brand_id, integration_id }
 * Returns: { ok, session_id, tasks } | { ok: false, error, status? }
 */

const TASK_BY_AUTH = {
  oauth:       { task_type: 'oauth_redirect', title: 'Authorize via OAuth',     description: 'Sign in to the provider and approve access.' },
  api_key:     { task_type: 'api_key_entry',  title: 'Enter API key',           description: 'Paste your API key from the provider dashboard.' },
  file_upload: { task_type: 'file_upload',    title: 'Upload statements',       description: 'Upload recent invoices or statements.' },
  manual:      { task_type: 'manual_input',   title: 'Enter values manually',   description: 'Provide the required values manually.' },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { brand_id, integration_id } = body;
    if (!brand_id || !integration_id) {
      return Response.json({ ok: false, error: 'Missing brand_id or integration_id' }, { status: 400 });
    }

    // Ownership (admin bypass)
    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      const owned = await base44.entities.Brand.filter({ id: brand_id }).catch(() => []);
      if (!owned.length) {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    // Resolve catalog entry
    const catalog = await base44.asServiceRole.entities.IntegrationCatalog
      .filter({ integration_id }, '-created_date', 1)
      .catch(() => []);
    if (!catalog.length) {
      return Response.json({ ok: false, error: 'Unknown integration' }, { status: 404 });
    }
    const entry = catalog[0];

    if (entry.status !== 'live') {
      return Response.json({ ok: false, error: 'Integration not yet available', status: entry.status });
    }

    // Create session
    const session = await base44.asServiceRole.entities.ConnectionSession.create({
      brand_id,
      integration_id,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      tasks_total: 1,
      tasks_completed: 0,
    });

    // Create initial task
    const taskTemplate = TASK_BY_AUTH[entry.auth_type] || TASK_BY_AUTH.manual;
    const task = await base44.asServiceRole.entities.ConnectionTask.create({
      session_id: session.id,
      brand_id,
      integration_id,
      task_type: taskTemplate.task_type,
      title: taskTemplate.title,
      description: taskTemplate.description,
      status: 'pending',
      order: 1,
    });

    return Response.json({
      ok: true,
      session_id: session.id,
      tasks: [task],
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});