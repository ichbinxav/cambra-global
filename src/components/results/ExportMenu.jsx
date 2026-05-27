import { Download, FileText, FileSpreadsheet } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function ExportMenu({ onExportPdf, onExportExcel, disabled = false }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 text-xs rounded-full px-3 border-border/60 gap-1.5"
        >
          <Download size={11} /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
          Download report
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onExportPdf} className="gap-2 cursor-pointer">
          <FileText size={14} className="text-cambra-plum" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">PDF report</span>
            <span className="text-[10px] text-muted-foreground/60">Share with your team</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExportExcel} className="gap-2 cursor-pointer">
          <FileSpreadsheet size={14} className="text-cambra-mint" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">Excel (.csv)</span>
            <span className="text-[10px] text-muted-foreground/60">Editable spreadsheet</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}