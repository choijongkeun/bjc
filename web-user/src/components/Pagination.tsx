import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui";

export function Pagination({
  page,
  limit,
  total,
  onChange,
}: {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4 text-sm text-slate-400">
      <div>
        페이지 <span className="tabular text-slate-200">{page}</span> / <span className="tabular">{totalPages}</span>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          이전
        </Button>
        <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          다음
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
