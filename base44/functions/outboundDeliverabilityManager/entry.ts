import { safeBestEffort } from "../../shared/bestEffort.ts";
import {
  claimSchedulerRun,
  finishSchedulerRunOrThrow,
  markSchedulerEffectStarted,
  schedulerClaimDeniedResponse,
} from "../../shared/schedulerRun.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
Deno.serve(async (req) => {
  let __schedulerSvc: any = null;
  let __schedulerClaim: any = null;
  let __schedulerOk = true;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.clone().json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const svc = base44.asServiceRole;
    __schedulerSvc = svc;
    __schedulerClaim = await claimSchedulerRun(svc, req, {
      worker_key: "outboundDeliverabilityManager",
      cadence_seconds: 3600,
    });
    {
      const denied = schedulerClaimDeniedResponse(__schedulerClaim);
      if (denied) return denied;
    }
    const controls = await svc.entities.OutboundControl.filter(
      { control_key: "global" },
      "-created_date",
      1,
    ).catch((error: any) =>
      safeBestEffort(error, {
        operation: "outboundDeliverabilityManager",
        fallback: [],
        severity: "critical",
      })
    );
    const control = controls[0] || null;
    const profiles = await svc.entities.OutboundSendingProfile.filter(
      { provider: "resend" },
      "-created_date",
      20,
    ).catch((error: any) =>
      safeBestEffort(error, {
        operation: "outboundDeliverabilityManager",
        fallback: [],
        severity: "critical",
      })
    );
    const now = Date.now(), since = new Date(now - 7 * 86400000).toISOString();
    __schedulerClaim = await markSchedulerEffectStarted(
      svc,
      __schedulerClaim,
    );
    {
      const denied = schedulerClaimDeniedResponse(__schedulerClaim);
      if (denied) return denied;
    }
    const out: any[] = [];
    for (const p of profiles) {
      const msgs = await svc.entities.CommunicationMessage.filter(
        {
          direction: "outbound",
          sending_profile_key: p.profile_key,
          sent_at: { $gte: since },
        },
        "-sent_at",
        500,
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "outboundDeliverabilityManager",
          fallback: [],
          severity: "critical",
        })
      );
      const sent = msgs.length,
        bounced = msgs.filter((m: any) => m.send_status === "bounced").length,
        complained = msgs.filter((m: any) =>
          m.send_status === "complained"
        ).length;
      const br = sent ? bounced * 100 / sent : 0,
        cr = sent ? complained * 100 / sent : 0;
      let status = p.status,
        cap = Number(p.current_daily_cap || 0),
        reason = "metrics_only";
      if (status !== "paused" && control?.volume_resend_enabled) {
        if (
          br >= Number(p.bounce_pause_threshold_pct || 3) ||
          cr >= Number(p.complaint_pause_threshold_pct || 0.1)
        ) {
          status = "paused";
          reason = "deliverability_threshold_exceeded";
          await svc.entities.OutboundControl.update(control.id, {
            volume_resend_enabled: false,
            paused_reason: reason,
          }).catch((error: any) =>
            safeBestEffort(error, {
              operation: "outboundDeliverabilityManager",
              fallback: null,
              severity: "critical",
            })
          );
        } else {
          const last = Date.parse(p.last_ramp_at || p.created_date || 0);
          const days = (now - last) / 86400000;
          const enoughVolume = sent >= Math.max(20, cap * 2);
          const healthy = br < Number(p.bounce_pause_threshold_pct || 3) &&
            cr < Number(p.complaint_slow_threshold_pct || 0.08);
          if (
            status === "warming" && healthy && enoughVolume &&
            days >= Number(p.ramp_min_days || 3) &&
            cap < Number(p.target_daily_cap || 500)
          ) {
            cap = Math.min(
              Number(p.target_daily_cap || 500),
              cap + Number(p.ramp_step || 50),
            );
            reason = "ramped";
            await svc.entities.OutboundSendingProfile.update(p.id, {
              current_daily_cap: cap,
              last_ramp_at: new Date(now).toISOString(),
              healthy_days: Number(p.healthy_days || 0) +
                Number(p.ramp_min_days || 3),
            }).catch((error: any) =>
              safeBestEffort(error, {
                operation: "outboundDeliverabilityManager",
                fallback: null,
                severity: "critical",
              })
            );
            if (cap >= Number(p.target_daily_cap || 500)) status = "active";
          } else {reason = healthy
              ? "holding_for_evidence"
              : "holding_for_health";}
        }
      }
      await svc.entities.OutboundSendingProfile.update(p.id, {
        status,
        last_review_at: new Date(now).toISOString(),
        sent_window: sent,
        bounced_window: bounced,
        complained_window: complained,
        bounce_rate_pct: Number(br.toFixed(4)),
        complaint_rate_pct: Number(cr.toFixed(4)),
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "outboundDeliverabilityManager",
          fallback: null,
          severity: "critical",
        })
      );
      out.push({
        profile: p.profile_key,
        status,
        cap,
        sent,
        bounced,
        complained,
        bounce_rate_pct: br,
        complaint_rate_pct: cr,
        reason,
      });
    }
    return Response.json({ ok: true, profiles: out });
  } catch (e) {
    __schedulerOk = false;
    console.error("outboundDeliverabilityManager failed", e);
    return Response.json(
      { ok: false, error: "deliverability_manager_failed" },
      { status: 500 },
    );
  } finally {
    if (__schedulerSvc && __schedulerClaim?.allowed === true) {
      await finishSchedulerRunOrThrow(__schedulerSvc, __schedulerClaim, {
        worker_key: "outboundDeliverabilityManager",
      }, __schedulerOk);
    }
  }
});
