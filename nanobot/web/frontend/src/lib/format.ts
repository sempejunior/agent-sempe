export function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atras`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atras`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d atras`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function getInitials(name: string, fallback?: string): string {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }
  const fb = (fallback || "").trim();
  if (fb) return fb.slice(0, 2).toUpperCase();
  return "•";
}
