import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const COLUMNS = [
  { id: "submitted", label: "Submitted", color: "border-blue-500/30 bg-blue-500/[0.03]" },
  { id: "in_review", label: "In Review", color: "border-orange-500/30 bg-orange-500/[0.03]" },
  { id: "provider_contacted", label: "Provider Contacted", color: "border-purple-500/30 bg-purple-500/[0.03]" },
  { id: "offer_ready", label: "Offer Ready", color: "border-amber-500/30 bg-amber-500/[0.03]" },
  { id: "activated", label: "Activated", color: "border-green-500/30 bg-green-500/[0.03]" },
];

export default function AdminPipeline() {
  const [apps, setApps] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [a, b] = await Promise.all([
        base44.entities.UserDeal.list("-created_date", 500),
        base44.entities.Brand.list(),
      ]);
      setApps(a);
      setBrands(b);
      setLoading(false);
    };

    load();

    // Subscribe to real-time updates
    const subs = [];
    try {
      const unsub1 = base44.entities.UserDeal.subscribe(() => load());
      const unsub2 = base44.entities.Brand.subscribe(() => load());
      if (unsub1) subs.push(unsub1);
      if (unsub2) subs.push(unsub2);
    } catch (err) {
      console.warn('Subscription error:', err);
    }

    return () => {
      subs.forEach(unsub => unsub?.());
    };
  }, []);

  const getBrand = (email) => brands.find(b => b.created_by === email);

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;
    await base44.entities.UserDeal.update(draggableId, { status: newStatus });
    setApps(prev => prev.map(a => a.id === draggableId ? { ...a, status: newStatus } : a));
  };

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  // Filter out rejected/closed from kanban
  const activeApps = apps.filter(a => !["rejected", "closed", "expired"].includes(a.status));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-[-0.03em]">Deal Pipeline</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Drag & drop to update status · {activeApps.length} active applications</p>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map(col => {
            const colApps = activeApps.filter(a => a.status === col.id);
            const totalSavings = colApps.reduce((s, a) => s + (a.estimated_savings || 0), 0);
            return (
              <div key={col.id} className="flex-shrink-0 w-64">
                <div className={`rounded-xl border ${col.color} overflow-hidden`}>
                  {/* Column header */}
                  <div className="px-4 py-3 border-b border-border/30">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold">{col.label}</p>
                      <span className="text-[10px] font-black bg-background/60 px-2 py-0.5 rounded-full">{colApps.length}</span>
                    </div>
                    {totalSavings > 0 && (
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">€{totalSavings.toLocaleString()}/yr</p>
                    )}
                  </div>

                  {/* Cards */}
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`p-2 min-h-[200px] space-y-2 transition-colors ${snapshot.isDraggingOver ? "bg-background/30" : ""}`}
                      >
                        {colApps.map((app, index) => {
                          const brand = getBrand(app.user_email);
                          return (
                            <Draggable key={app.id} draggableId={app.id} index={index}>
                              {(prov, snap) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  className={`p-3 rounded-lg bg-background border border-border/50 shadow-sm cursor-grab active:cursor-grabbing transition-shadow ${snap.isDragging ? "shadow-lg" : ""}`}
                                >
                                  <p className="text-xs font-bold truncate">{brand?.name || app.user_email}</p>
                                  <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{app.deal_name}</p>
                                  <p className="text-[11px] text-muted-foreground/40 mt-0.5">{app.provider}</p>
                                  {app.estimated_savings && (
                                    <p className="text-xs font-black text-green-600 mt-2">€{app.estimated_savings.toLocaleString()}/yr</p>
                                  )}
                                  <p className="text-[10px] text-muted-foreground/25 mt-1">
                                    {new Date(app.created_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                  </p>
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
  );
}