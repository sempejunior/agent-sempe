import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  listCronJobs,
  addCronJob,
  deleteCronJob,
  enableCronJob,
  runCronJob,
  listChannels,
  type ChannelInfo
} from "@/lib/api";
import type { CronJob } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Calendar, Plus, Trash2, X, Clock, Settings2, Play, Pause, Send } from "lucide-react";

export function CronPanel() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [activeChannels, setActiveChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"every" | "cron">("every");

  // Interval state
  const [intervalValue, setIntervalValue] = useState("1");
  const [intervalUnit, setIntervalUnit] = useState<"M" | "H" | "D">("H");

  // Cron state
  const [cronExpr, setCronExpr] = useState("0 9 * * *");

  // Delivery State
  const [deliver, setDeliver] = useState(false);
  const [channel, setChannel] = useState("");
  const [to, setTo] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedJobs, fetchedChannels] = await Promise.all([
        listCronJobs(),
        listChannels()
      ]);
      setJobs(fetchedJobs);
      setActiveChannels(fetchedChannels.filter(c => c.enabled));
    } catch (e) {
      toast("error", `Failed to load scheduler data: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setName("");
    setMessage("");
    setKind("every");
    setIntervalValue("1");
    setIntervalUnit("H");
    setCronExpr("0 9 * * *");
    setDeliver(false);
    setChannel("");
    setTo("");
    setShowForm(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) {
      toast("error", "Name and Message are required");
      return;
    }

    if (deliver && (!channel || !to.trim())) {
      toast("error", "Please specify a channel and recipient if delivery is enabled");
      return;
    }

    let every_seconds = 3600;
    if (kind === "every") {
      const val = parseInt(intervalValue, 10);
      if (isNaN(val) || val <= 0) {
        toast("error", "Please enter a valid interval number");
        return;
      }
      if (intervalUnit === "M") every_seconds = val * 60;
      if (intervalUnit === "H") every_seconds = val * 3600;
      if (intervalUnit === "D") every_seconds = val * 86400;
    }

    // Get client timezone for accurate cron scheduling
    const tz = kind === "cron" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

    try {
      await addCronJob({
        name: name.trim(),
        message: message.trim(),
        kind,
        tz,
        deliver,
        channel: deliver ? channel : null,
        to: deliver ? to.trim() : null,
        ...(kind === "every"
          ? { every_seconds }
          : { expr: cronExpr }),
      });
      toast("success", `Task "${name.trim()}" created`);
      resetForm();
      loadData();
    } catch (e) {
      toast("error", `Failed to add task: ${(e as Error).message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCronJob(id);
      toast("success", "Task deleted");
      loadData();
    } catch (e) {
      toast("error", `Failed to delete: ${(e as Error).message}`);
    }
  };

  const handleToggleState = async (id: string, currentlyEnabled: boolean) => {
    try {
      await enableCronJob(id, !currentlyEnabled);
      toast("success", `Task ${!currentlyEnabled ? "resumed" : "paused"}`);
      loadData();
    } catch (e) {
      toast("error", `Failed to toggle task: ${(e as Error).message}`);
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await runCronJob(id);
      toast("success", "Task execution triggered");
    } catch (e) {
      toast("error", `Failed to run task: ${(e as Error).message}`);
    }
  };

  const formatSchedule = (job: CronJob) => {
    if (job.schedule_kind === "cron") {
      return (
        <div className="flex items-center gap-1.5 text-slate-500 font-mono text-xs bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
          <Settings2 className="w-3.5 h-3.5" />
          {job.schedule_expr}
        </div>
      );
    }

    // Parse the seconds to make it human readable
    const match = job.schedule_expr.match(/every (\d+)s/);
    if (!match) return <div className="text-slate-500 text-xs">{job.schedule_expr}</div>;

    const seconds = parseInt(match[1], 10);
    let readable = "";
    if (seconds % 86400 === 0) {
      const d = seconds / 86400;
      readable = `Every ${d} Day${d > 1 ? "s" : ""}`;
    } else if (seconds % 3600 === 0) {
      const h = seconds / 3600;
      readable = `Every ${h} Hour${h > 1 ? "s" : ""}`;
    } else if (seconds % 60 === 0) {
      const m = seconds / 60;
      readable = `Every ${m} Minute${m > 1 ? "s" : ""}`;
    } else {
      readable = `Every ${seconds} Seconds`;
    }

    return (
      <div className="flex items-center gap-1.5 text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
        <Clock className="w-3.5 h-3.5" />
        {readable}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 shrink-0">
        <div className="content-container">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">Scheduler</h1>
                <p className="text-sm font-medium text-slate-500 mt-1">
                  Automate the agent on a recurring basis
                </p>
              </div>
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-bold h-10 px-5 rounded-xl border-none"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Task
            </Button>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="content-container animate-fade-in-up">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-12 text-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center mx-auto mb-6">
                <Calendar className="w-10 h-10 text-emerald-500 opacity-60" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">No scheduled tasks</h3>
              <p className="text-sm font-medium text-slate-500 max-w-sm mx-auto">
                Set up background automation to have the agent run specific instructions on a timer.
              </p>
              <Button
                onClick={() => setShowForm(true)}
                variant="outline"
                className="mt-6 border-slate-200 font-bold rounded-xl h-11 px-6 shadow-sm hover:bg-slate-50"
              >
                Create First Task
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pb-12">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {jobs.length} Task{jobs.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,350px),1fr))] gap-5 items-start">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className={cn(
                      "flex flex-col h-full bg-white rounded-3xl shadow-sm border overflow-hidden transition-all",
                      job.enabled ? "border-slate-200 hover:shadow-md hover:border-slate-300 card-glow" : "border-slate-100 opacity-75 grayscale-[0.2]"
                    )}
                  >
                    <div className="flex-1 p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h3 className={cn(
                            "text-base font-bold truncate leading-tight mb-2",
                            job.enabled ? "text-slate-900" : "text-slate-500"
                          )}>
                            {job.name}
                          </h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            {formatSchedule(job)}
                            {!job.enabled && (
                              <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-600">Paused</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-2">
                          <button
                            onClick={() => handleRunNow(job.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"
                            title="Run task immediately"
                          >
                            <Play className="w-4 h-4 fill-current" />
                          </button>
                          <button
                            onClick={() => handleDelete(job.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                            title="Delete task"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-100 flex-1 flex flex-col justify-between">
                        <p className={cn("text-sm font-medium line-clamp-3 leading-relaxed mb-4", job.enabled ? "text-slate-600" : "text-slate-400")}>
                          " {job.message} "
                        </p>

                        {/* Status Footer */}
                        <div className="flex items-center justify-between">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleState(job.id, job.enabled)}
                            className={cn(
                              "h-8 px-3 text-xs font-bold rounded-lg border",
                              job.enabled
                                ? "text-slate-500 hover:text-amber-600 hover:bg-amber-50 border-transparent hover:border-amber-200"
                                : "text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100 hover:text-amber-700"
                            )}
                          >
                            {job.enabled ? <Pause className="w-3.5 h-3.5 mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                            {job.enabled ? "Pause Task" : "Resume Task"}
                          </Button>

                          {job.channel && (
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              <Send className="w-3 h-3" />
                              {job.channel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Task Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-center items-start pt-10 sm:pt-20 px-4 overflow-y-auto pb-10">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mb-20 animate-in slide-in-from-bottom-8 fade-in duration-300">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">New Scheduled Task</h2>
              <button
                onClick={resetForm}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Task Name <span className="text-red-500">*</span></label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Daily Standup Prep"
                    className="h-11 rounded-xl bg-slate-50/50 focus:bg-white"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Agent Instructions <span className="text-red-500">*</span></label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What should the agent do? e.g. Analyze my unread emails and summarize them."
                    className="w-full min-h-[100px] resize-y p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
                  />
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <label className="block text-sm font-bold text-slate-700 mb-3">Schedule Type</label>
                <div className="flex rounded-xl bg-slate-200/50 p-1 border border-slate-200/60 mb-4">
                  <button
                    type="button"
                    onClick={() => setKind("every")}
                    className={cn(
                      "flex-1 py-2 text-sm font-bold rounded-lg transition-all cursor-pointer",
                      kind === "every" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Simple Interval
                  </button>
                  <button
                    type="button"
                    onClick={() => setKind("cron")}
                    className={cn(
                      "flex-1 py-2 text-sm font-bold rounded-lg transition-all cursor-pointer",
                      kind === "cron" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Advanced Cron
                  </button>
                </div>

                {kind === "every" ? (
                  <div className="flex gap-3 items-center">
                    <span className="text-sm font-medium text-slate-500 shrink-0">Run every</span>
                    <Input
                      value={intervalValue}
                      onChange={(e) => setIntervalValue(e.target.value)}
                      placeholder="1"
                      type="number"
                      min="1"
                      className="h-11 rounded-xl bg-white flex-1"
                    />
                    <div className="relative w-32 shrink-0">
                      <select
                        value={intervalUnit}
                        onChange={(e) => setIntervalUnit(e.target.value as any)}
                        className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none cursor-pointer"
                      >
                        <option value="M">Minutes</option>
                        <option value="H">Hours</option>
                        <option value="D">Days</option>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Input
                      value={cronExpr}
                      onChange={(e) => setCronExpr(e.target.value)}
                      placeholder="e.g. 0 9 * * *"
                      className="h-11 rounded-xl bg-white font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 font-medium mt-2">
                      Standard Cron syntax. Timezone: <span className="font-bold text-slate-700">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Delivery Section */}
              <div className={cn("rounded-2xl p-5 border transition-all", deliver ? "bg-indigo-50/50 border-indigo-100" : "bg-white border-slate-200")}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={cn("w-5 h-5 rounded flex items-center justify-center border transition-colors", deliver ? "bg-indigo-600 border-indigo-600" : "bg-white border-slate-300")}>
                    {deliver && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">Push to Channel</p>
                    <p className="text-xs text-slate-500 mt-0.5">Send the agent's response directly to a messenger app</p>
                  </div>
                  <input type="checkbox" className="sr-only" checked={deliver} onChange={(e) => setDeliver(e.target.checked)} />
                </label>

                {deliver && (
                  <div className="mt-4 space-y-4 pt-4 border-t border-indigo-100/50 animate-in fade-in slide-in-from-top-2">
                    {activeChannels.length === 0 ? (
                      <div className="bg-amber-50 text-amber-700 text-xs font-medium p-3 rounded-lg border border-amber-200/50">
                        No active channels. Go to "Channels" to configure Telegram, Slack, or WhatsApp first.
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1.5 break-words">Platform</label>
                          <div className="relative">
                            <select
                              value={channel}
                              onChange={(e) => setChannel(e.target.value)}
                              className="w-full h-11 px-3 bg-white border border-indigo-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
                            >
                              <option value="" disabled>Select a platform...</option>
                              {activeChannels.map(c => (
                                <option key={c.name} value={c.name}>{c.label}</option>
                              ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">Recipient ID / Chat ID <span className="text-red-500">*</span></label>
                          <Input
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            placeholder="e.g. @username or -10012345"
                            className="h-11 rounded-xl bg-white border-indigo-200 focus:border-indigo-500"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  className="flex-1 h-12 rounded-xl border-slate-200 font-bold hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-[2] h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold border-none shadow-md shadow-emerald-600/20"
                >
                  Create Schedule
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
