export function StatusPill({ className = "", status }: { className?: string; status: string }) {
  return <span className={`status-pill ${getStatusTone(status)} ${className}`}>{status}</span>;
}

export function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile px-3 py-2">
      <p className="text-xs font-semibold text-graphite">{label}</p>
      <p className="mt-1 font-bold text-ink">{value}</p>
    </div>
  );
}

export function getStatusTone(status: string) {
  const tones: Record<string, string> = {
    待确认: "status-gray",
    待付款: "status-orange",
    已付款: "status-blue",
    排产中: "status-blue",
    生产中: "status-purple",
    后处理: "status-yellow",
    已发货: "status-green",
    已完成: "status-mint",
    已取消: "status-gray",
    待评估: "status-orange",
    已联系: "status-blue",
    已报价: "status-blue",
    已接受: "status-green",
    已拒绝: "status-gray",
    待处理: "status-orange",
    已处理: "status-mint",
  };

  return tones[status] || "status-gray";
}
