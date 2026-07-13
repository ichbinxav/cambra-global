// TEMPORARY RLS CONFOUND PROBE — decide between two scenarios:
//   (A) REAL LEAK: a normal (non-admin) caller sees other tenants' rows.
//   (B) HARNESS ARTIFACT: test_backend_function runs with admin context, so
//       createClientFromRequest inherits admin → admin correctly sees all rows
//       and RLS is actually fine in production.
//
// To tell them apart we MUST inspect the caller identity the request-scoped
// client actually carries. We return auth.me() verbatim (email + role +
// whatever role-ish fields exist) and run the SAME filter twice:
//   - request-scoped (RLS path, what the frontend uses)
//   - asServiceRole (bypass, the known "sees everything" baseline)
// If request-scoped == serviceRole AND caller.role === 'admin' → artifact.
// If caller is a normal user AND still sees foreign rows → real leak.
//
// DELETE this function once the question is settled.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let me = null;
    let meError = null;
    try {
      me = await base44.auth.me();
    } catch (e) {
      meError = e.message;
    }

    const callerEmail = me?.email ?? null;
    // Surface every plausible role field without assuming the shape.
    const roleFields = me
      ? {
          role: me.role ?? null,
          _app_role: me._app_role ?? null,
          app_role: me.app_role ?? null,
        }
      : null;

    // (1) Request-scoped read — the RLS path the frontend uses.
    const scoped = await base44.entities.AnalyzerResult.filter({}, "-created_date", 50);
    const scopedOwners = [...new Set(scoped.map((r) => r.created_by))];

    // (2) Service-role read — the known bypass baseline.
    const svc = await base44.asServiceRole.entities.AnalyzerResult.filter({}, "-created_date", 50);
    const svcOwners = [...new Set(svc.map((r) => r.created_by))];

    const scopedForeign = callerEmail
      ? scopedOwners.filter((o) => o !== callerEmail)
      : scopedOwners;

    // Interpretation hint (does NOT decide anything on its own — you read the raw fields).
    let verdict;
    if (!me) verdict = "no_auth_context";
    else if (roleFields.role === "admin" || roleFields._app_role === "admin" || roleFields.app_role === "admin")
      verdict = "caller_is_ADMIN — seeing all rows is CORRECT; harness likely elevated; RE-TEST as normal user before concluding anything";
    else if (scopedForeign.length > 0)
      verdict = "caller_is_NORMAL and still sees FOREIGN rows → REAL LEAK (P0)";
    else
      verdict = "caller_is_NORMAL and sees only own rows → RLS ENFORCED, no leak";

    return Response.json({
      caller_identity: {
        email: callerEmail,
        role_fields: roleFields,
        me_error: meError,
        full_me: me, // verbatim, so you can see any other role-ish field
      },
      request_scoped_read: {
        returned_count: scoped.length,
        owners: scopedOwners,
        foreign_owner_count: scopedForeign.length,
      },
      service_role_read: {
        returned_count: svc.length,
        owners: svcOwners,
      },
      scoped_equals_serviceRole: scoped.length === svc.length,
      verdict,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});