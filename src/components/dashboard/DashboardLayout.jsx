import { Outlet, useLocation } from "react-router-dom";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import Navbar from "@/components/landing/Navbar";

export default function DashboardLayout() {
  const location = useLocation();
  const isLightWorkspace = ["/dashboard", "/reports", "/account", "/invoices", "/vault", "/referrals"].includes(location.pathname.toLowerCase());

  return (
    <div
      className={`${isLightWorkspace ? "" : "dark"} min-h-screen w-full max-w-full overflow-x-hidden font-inter`}
      style={{
        color: isLightWorkspace ? "#0C0C16" : "#ffffff",
        background: isLightWorkspace ? "#F7F8FC" : "#0B0E1A",
      }}
    >
      <Navbar />
      <div className="flex min-h-screen w-full pt-[72px]">
        <DashboardSidebar />

        <main
          className="relative min-w-0 max-w-full flex-1 overflow-x-hidden"
          style={isLightWorkspace ? {
            backgroundColor: "#F7F8FC",
            backgroundImage: "radial-gradient(circle at 78% 4%, rgba(91,76,245,.10), transparent 28%), radial-gradient(circle at 14% 34%, rgba(57,198,240,.07), transparent 24%), radial-gradient(rgba(91,76,245,.13) .8px, transparent .8px)",
            backgroundSize: "auto, auto, 24px 24px",
          } : { background: "#0B0E1A" }}
        >
          <div className={`relative min-w-0 w-full mx-auto p-4 sm:p-5 lg:p-8 ${isLightWorkspace ? "max-w-[1480px]" : "max-w-[1400px]"}`}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
