import { Outlet } from "react-router-dom";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

export default function DashboardLayout() {
  return (
    <div
      className="dark min-h-screen flex w-full max-w-full overflow-x-hidden font-inter"
      style={{
        color: "#ffffff",
        background: "#0B0E1A",
      }}
    >
      <DashboardSidebar />

      {/* Main content — flat navy canvas */}
      <main className="relative flex-1 min-w-0 max-w-full overflow-x-hidden pt-14 lg:pt-0" style={{ background: "#0B0E1A" }}>
        <div className="relative min-w-0 max-w-[1400px] w-full mx-auto p-4 sm:p-5 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
