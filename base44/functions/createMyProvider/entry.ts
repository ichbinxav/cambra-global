import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function deriveProviderName(email) {
  const domain = (email?.split('@')[1] || '').split('.')[0] || 'provider';
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // If a provider already linked to this contact exists, return it
    const existing = await base44.entities.Provider.filter({ contact_email: user.email });
    if (Array.isArray(existing) && existing.length > 0) {
      return Response.json({ success: true, provider: existing[0], existed: true });
    }

    const name = deriveProviderName(user.email);

    // Minimal required fields from schema: name, category
    const provider = await base44.entities.Provider.create({
      name,
      category: 'payments',
      contact_email: user.email,
      account_manager: user.full_name || user.email,
      api_status: 'not_connected',
      notes: 'Auto-created via createMyProvider()'
    });

    return Response.json({ success: true, provider });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});