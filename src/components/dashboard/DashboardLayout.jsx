import { Outlet } from "react-router-dom";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

export default function DashboardLayout() {
  return (
    <div
      className="dark min-h-screen flex font-inter"
      style={{
        color: "#ffffff",
        background: "#0B0E1A",
      }}
    >
      <DashboardSidebar />

      {/* Main content — flat navy canvas */}
      <main className="relative flex-1 min-w-0 pt-14 lg:pt-0" style={{ background: "#0B0E1A" }}>
        <div className="relative max-w-[1400px] mx-auto p-5 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}