import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { DEAL_STATUSES } from "@/lib/adminStatusConstants";
import AdminApplicationDetail from "./AdminApplicationDetail.jsx";
import { toast } from "sonner";

const COLUMNS = [
  { id: DEAL_STATUSES.SUBMITTED, label: "Submitted", color: "border-blue-500/30 bg-blue-500/[0.03]", dot: "bg-blue-500" },
  { id: DEAL_STATUSES.IN_REVIEW, label: "In Review", color: "border-orange-500/30 bg-orange-500/[0.03]", dot: "bg-orange-500" },
  { id: DEAL_STATUSES.PROVIDER_CONTACTED, label: "Provider Contacted", color: "border-purple-500/30 bg-purple-500/[0.03]", dot: "bg-purple-500" },
  { id: DEAL_STATUSES.OFFER_READY, label: "Offer Ready", color: "border-amber-500/30 bg-amber-500/[0.03]", dot: "bg-amber-500" },
  { id: DEAL_STATUSES.ACTIVATED, label: "Activated", color: "border-green-500/30 bg-green-500/[0.03]", dot: "bg-green-500" },
];

function daysInStage(created_date) {
  return Math.floor((Date.now() - new Date(created_date).getTime()) / 86400000);
}

export default function AdminPipeline() {
  const [apps, setApps] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    const [a, b] = await Promise.all([
      base44.entities.DealApplication.list("-created_date", 500),
      base44.entities.Brand.list(),
    ]);
    setApps(a);
    setBrands(b);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.DealApplication.subscribe(load);
    return () => unsub?.();
  }, []);

  const getBrand = (email) => brands.find(b => b.created_by === email);

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;
    const res = await base44.functions.invoke('adminUpdateApplicationStatus', { id: draggableId, status: newStatus });
    if (res.data?.error) { toast.error(res.data.error); return; }
    setApps(prev => prev.map(a => a.id === draggableId ? { ...a, status: newStatus } : a));
  };

  const updateStatus = async (id, status) => {
    const res = await base44.functions.invoke('adminUpdateApplicationStatus', { id, status });
    if (res.data?.error) { toast.error(res.data.error); return; }
    setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    if (selected?.id === id) setSelected(prev => ({ ...prev, status }));
  };

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  const activeApps = apps.filter(a => ![DEAL_STATUSES.REJECTED, DEAL_STATUSES.CLOSED].includes(a.status));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">Deal Pipeline</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Drag & drop to move · Click to inspect · {activeApps.length} active</p>
        </div>
        {selected && (
          <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground/50 hover:text-foreground flex items-center gap-1">✕ Close panel</button>
        )}
      </div>

      <div className="flex gap-4">
        {/* Kanban */}
        <div className={`${selected ? "w-1/2" : "w-full"} transition-all overflow-x-auto`}>
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-2.5 pb-4 min-w-max">
              {COLUMNS.map(col => {
                const colApps = activeApps.filter(a => a.status === col.id);
                const totalSavings = colApps.reduce((s, a) => s + (a.estimated_savings || 0), 0);
                const stuckCount = colApps.filter(a => daysInStage(a.created_date) > 7).length;
                return (
                  <div key={col.id} className="flex-shrink-0 w-60">
                    <div className={`rounded-xl border ${col.color} overflow-hidden`}>
                      <div className="px-3 py-3 border-b border-border/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
                            <p className="text-xs font-bold">{col.label}</p>
                          </div>
                          <span className="text-[10px] font-black bg-background/60 px-2 py-0.5 rounded-full">{colApps.length}</span>
                        </div>
                        {totalSavings > 0 && <p className="text-[10px] text-muted-foreground/50 mt-1">€{totalSavings.toLocaleString()}/yr</p>}
                        {stuckCount > 0 && <p className="text-[9px] text-orange-500 mt-0.5">⚠ {stuckCount} stuck &gt;7d</p>}
                      </div>

                      <Droppable droppableId={col.id}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps}
                            className={`p-2 min-h-[180px] space-y-2 transition-colors ${snapshot.isDraggingOver ? "bg-background/30" : ""}`}>
                            {colApps.map((app, index) => {
                              const brand = getBrand(app.user_email);
                              const days = daysInStage(app.created_date);
                              const isStuck = days > 7;
                              const isSelected = selected?.id === app.id;
                              return (
                                <Draggable key={app.id} draggableId={app.id} index={index}>
                                  {(prov, snap) => (
                                    <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                                      onClick={() => setSelected(isSelected ? null : app)}
                                      className={`p-3 rounded-lg border shadow-sm cursor-pointer transition-all ${snap.isDragging ? "shadow-lg rotate-1" : ""} ${isSelected ? "border-foreground/30 bg-foreground/5" : isStuck ? "border-orange-500/30 bg-orange-500/[0.03] hover:shadow-md" : "bg-background border-border/50 hover:shadow-md"}`}>
                                      <p className="text-xs font-bold truncate">{brand?.name || app.user_email}</p>
                                      <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{app.deal_name}</p>
                                      <p className="text-[10px] text-muted-foreground/35 mt-0.5">{app.provider}</p>
                                      {app.estimated_savings > 0 && (
                                        <p className="text-xs font-black text-green-600 mt-2">€{app.estimated_savings.toLocaleString()}/yr</p>
                                      )}
                                      <div className="flex items-center justify-between mt-1.5">
                                        <p className={`text-[9px] ${isStuck ? "text-orange-500 font-semibold" : "text-muted-foreground/25"}`}>
                                          {isStuck ? `⚠ ${days}d` : `${days}d`}
                                        </p>
                                        {app.deal_mode === "instant" && (
                                          <span className="text-[9px] text-purple-500 font-semibold">instant</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 shrink-0">
            <AdminApplicationDetail
              app={selected}
              brand={getBrand(selected.user_email)}
              onClose={() => setSelected(null)}
              onStatusChange={updateStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}